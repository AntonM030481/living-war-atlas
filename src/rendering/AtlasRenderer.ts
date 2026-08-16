import { Application, Container, Graphics } from 'pixi.js';
import type { SimulationSnapshot, MapDefinition, City } from '../sim/types';

const BLUE = 0x4f769d;
const BLUE_DARK = 0x164f91;
const RED = 0xc76b5c;
const RED_DARK = 0xb12620;
const PAPER = 0xe6ddb7;
const PAPER_LIGHT = 0xf6efd7;
const INK = 0x2f2b24;
const RIVER = 0x4fa6bd;
const GRID = 0x8b7a59;

interface Point { x: number; y: number }

export class AtlasRenderer {
  private readonly world = new Container();
  private readonly terrain = new Graphics();
  private readonly grid = new Graphics();
  private readonly historicalBorder = new Graphics();
  private readonly territory = new Graphics();
  private readonly flows = new Graphics();
  private readonly front = new Graphics();
  private readonly instability = new Graphics();
  private readonly cities = new Graphics();
  private debug = false;

  constructor(
    private readonly app: Application,
    private readonly map: MapDefinition,
  ) {
    this.world.addChild(
      this.terrain,
      this.grid,
      this.historicalBorder,
      this.territory,
      this.flows,
      this.front,
      this.instability,
      this.cities,
    );
    this.app.stage.addChild(this.world);
    this.drawTerrain();
    this.drawGrid();
    this.drawHistoricalBorder();
    this.fit();
    window.addEventListener('resize', () => this.fit());
  }

  setDebug(value: boolean): void {
    this.debug = value;
    this.instability.visible = value;
  }

  toggleDebug(): boolean {
    this.setDebug(!this.debug);
    return this.debug;
  }

  render(snapshot: SimulationSnapshot): void {
    this.drawTerritory(snapshot);
    this.drawFlows(snapshot);
    this.drawFront(snapshot);
    this.drawCities(snapshot);
    if (this.debug) this.drawInstability(snapshot);
  }

  private fit(): void {
    const margin = 18;
    const rightPanelWidth = 254;
    const availableWidth = Math.max(240, this.app.screen.width - rightPanelWidth);
    const sx = (availableWidth - margin * 2) / this.map.width;
    const sy = (this.app.screen.height - margin * 2) / this.map.height;
    const scale = Math.max(0.1, Math.min(sx, sy));
    this.world.scale.set(scale);
    this.world.x = (availableWidth - this.map.width * scale) / 2;
    this.world.y = (this.app.screen.height - this.map.height * scale) / 2;
  }

  private drawTerrain(): void {
    const g = this.terrain;
    g.clear();
    g.rect(0, 0, this.map.width, this.map.height).fill(PAPER);

    for (let y = 2; y < this.map.height; y += 2.8) {
      const wobble = Math.sin(y * 1.73) * 0.16;
      g.moveTo(0, y).lineTo(this.map.width, y + wobble);
    }
    g.stroke({ color: 0x8a806d, width: 0.055, alpha: 0.12 });

    for (let x = 4; x < this.map.width; x += 6) {
      g.moveTo(x, 0).lineTo(x + Math.sin(x) * 0.25, this.map.height);
    }
    g.stroke({ color: 0xb8a77d, width: 0.04, alpha: 0.06 });

    for (const m of this.map.mountains) {
      for (let row = -5; row <= 5; row++) {
        const yy = m.y + row * (m.r / 6.2);
        const inside = Math.max(0, 1 - (row / 5.8) ** 2);
        const half = m.r * 0.72 * Math.sqrt(inside);
        if (half < 0.5) continue;
        const segments = Math.max(2, Math.round(half / 1.75));
        for (let s = 0; s < segments; s++) {
          const x = m.x - half + ((s + 0.5) / segments) * half * 2;
          const size = 0.9 + 0.35 * Math.sin((s + row) * 1.7);
          g.moveTo(x - size, yy + 0.8)
            .lineTo(x, yy - 0.25)
            .lineTo(x + size, yy + 0.8);
        }
      }
    }
    g.stroke({ color: 0x766e5f, width: 0.14, alpha: 0.58 });

    // River: pale outer stroke and a thinner core like an atlas symbol.
    for (let y = 0; y < this.map.height - 0.5; y += 0.5) {
      g.moveTo(this.map.riverX(y), y)
        .lineTo(this.map.riverX(y + 0.5), y + 0.5);
    }
    g.stroke({ color: PAPER_LIGHT, width: 1.10, alpha: 0.75 });
    for (let y = 0; y < this.map.height - 0.5; y += 0.5) {
      g.moveTo(this.map.riverX(y), y)
        .lineTo(this.map.riverX(y + 0.5), y + 0.5);
    }
    g.stroke({ color: RIVER, width: 0.46, alpha: 0.82 });
  }

  private drawGrid(): void {
    const g = this.grid;
    g.clear();
    g.rect(0.6, 0.6, this.map.width - 1.2, this.map.height - 1.2);
    g.stroke({ color: 0x4d6f43, width: 0.16, alpha: 0.55 });

    for (let x = 16; x < this.map.width; x += 16) {
      g.moveTo(x, 0.7).lineTo(x, this.map.height - 0.7);
    }
    for (let y = 13; y < this.map.height; y += 13) {
      g.moveTo(0.7, y).lineTo(this.map.width - 0.7, y);
    }
    g.stroke({ color: GRID, width: 0.06, alpha: 0.28 });
  }

  private drawHistoricalBorder(): void {
    const g = this.historicalBorder;
    g.clear();
    let draw = true;
    for (let y = 0; y < this.map.height - 0.8; y += 0.8) {
      if (draw) {
        g.moveTo(this.map.initialFrontX(y), y)
          .lineTo(this.map.initialFrontX(y + 0.55), y + 0.55);
      }
      draw = !draw;
    }
    g.stroke({ color: INK, width: 0.16, alpha: 0.24 });
  }

  private drawTerritory(snapshot: SimulationSnapshot): void {
    const g = this.territory;
    g.clear();
    const { width, height, control } = snapshot;

    // Keep occupation tint restrained. The atlas should still look like paper.
    for (let y = 0; y < height; y++) {
      let runStart = 0;
      let runKey = this.controlKey(control[y * width]);
      for (let x = 1; x <= width; x++) {
        const key = x < width ? this.controlKey(control[y * width + x]) : 999;
        if (key !== runKey) {
          if (runKey !== 0) {
            const strength = Math.abs(runKey) / 3;
            const color = runKey > 0 ? BLUE : RED;
            g.rect(runStart, y, x - runStart, 1).fill({
              color,
              alpha: 0.055 + strength * 0.075,
            });
          }
          runStart = x;
          runKey = key;
        }
      }
    }
  }

  private controlKey(c: number): number {
    const strength = Math.abs(c);
    if (strength < 0.08) return 0;
    const q = Math.min(3, Math.max(1, Math.ceil(strength * 3)));
    return c > 0 ? q : -q;
  }

  private contourSegments(snapshot: SimulationSnapshot): Array<[Point, Point]> {
    const segments: Array<[Point, Point]> = [];
    const { width, height, control } = snapshot;

    const edgePoint = (x1: number, y1: number, v1: number, x2: number, y2: number, v2: number): Point => {
      const t = Math.abs(v1) / (Math.abs(v1) + Math.abs(v2) + 1e-6);
      return { x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t };
    };

    for (let y = 0; y < height - 1; y++) {
      for (let x = 0; x < width - 1; x++) {
        const i = y * width + x;
        const c00 = control[i];
        const c10 = control[i + 1];
        const c01 = control[i + width];
        const c11 = control[i + width + 1];
        const points: Point[] = [];

        if ((c00 >= 0) !== (c10 >= 0)) points.push(edgePoint(x, y, c00, x + 1, y, c10));
        if ((c10 >= 0) !== (c11 >= 0)) points.push(edgePoint(x + 1, y, c10, x + 1, y + 1, c11));
        if ((c01 >= 0) !== (c11 >= 0)) points.push(edgePoint(x, y + 1, c01, x + 1, y + 1, c11));
        if ((c00 >= 0) !== (c01 >= 0)) points.push(edgePoint(x, y, c00, x, y + 1, c01));

        if (points.length === 2) segments.push([points[0], points[1]]);
        else if (points.length === 4) {
          segments.push([points[0], points[1]], [points[2], points[3]]);
        }
      }
    }

    return segments;
  }

  private drawFront(snapshot: SimulationSnapshot): void {
    const g = this.front;
    g.clear();
    const segments = this.contourSegments(snapshot);

    const drawSegments = (color: number, width: number, alpha: number) => {
      for (const [a, b] of segments) {
        g.moveTo(a.x, a.y).lineTo(b.x, b.y);
      }
      g.stroke({ color, width, alpha });
    };

    drawSegments(PAPER_LIGHT, 0.78, 0.72);
    drawSegments(INK, 0.34, 0.95);
    drawSegments(RED_DARK, 0.12, 0.90);

    for (let i = 0; i < segments.length; i += 8) {
      const [a, b] = segments[i];
      const mx = (a.x + b.x) * 0.5;
      const my = (a.y + b.y) * 0.5;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-4) continue;
      const nx = -dy / len;
      const ny = dx / len;
      g.moveTo(mx - nx * 0.24, my - ny * 0.24).lineTo(mx + nx * 0.24, my + ny * 0.24);
    }
    g.stroke({ color: BLUE_DARK, width: 0.10, alpha: 0.58 });
  }

  private sampleVector(
    snapshot: SimulationSnapshot,
    flowX: Float32Array,
    flowY: Float32Array,
    x: number,
    y: number,
  ): Point {
    const ix = Math.max(0, Math.min(snapshot.width - 1, Math.round(x)));
    const iy = Math.max(0, Math.min(snapshot.height - 1, Math.round(y)));
    const i = iy * snapshot.width + ix;
    return { x: flowX[i], y: flowY[i] };
  }

  private traceFlow(
    snapshot: SimulationSnapshot,
    city: City,
    flowX: Float32Array,
    flowY: Float32Array,
    lateralOffset: number,
  ): Point[] {
    let x = city.x;
    let y = city.y + lateralOffset;
    const points: Point[] = [{ x, y }];
    let stale = 0;

    for (let step = 0; step < 150; step++) {
      const v = this.sampleVector(snapshot, flowX, flowY, x, y);
      const mag = Math.hypot(v.x, v.y);
      if (mag < 0.018) {
        stale += 1;
        if (stale > 5) break;
        // Small nudge toward the front while the vector field is weak near a city.
        const sign = city.owner === 'blue' ? 1 : -1;
        x += sign * 0.42;
      } else {
        stale = 0;
        const stepSize = 0.55;
        x += (v.x / mag) * stepSize;
        y += (v.y / mag) * stepSize;
      }

      if (x < 0 || x >= snapshot.width || y < 0 || y >= snapshot.height) break;
      points.push({ x, y });
      const i = Math.round(y) * snapshot.width + Math.round(x);
      if (i >= 0 && i < snapshot.control.length && Math.abs(snapshot.control[i]) < 0.22) break;
    }
    return points;
  }

  private drawDashedPath(g: Graphics, points: Point[], phase: number, dash = 1.2, gap = 1.3): void {
    if (points.length < 2) return;
    let cursor = phase % (dash + gap);
    let drawing = cursor < dash;
    let remaining = drawing ? dash - cursor : dash + gap - cursor;

    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = Math.hypot(dx, dy);
      if (length < 1e-6) continue;
      let pos = 0;
      while (pos < length) {
        const take = Math.min(remaining, length - pos);
        const t0 = pos / length;
        const t1 = (pos + take) / length;
        const x0 = a.x + dx * t0;
        const y0 = a.y + dy * t0;
        const x1 = a.x + dx * t1;
        const y1 = a.y + dy * t1;
        if (drawing) g.moveTo(x0, y0).lineTo(x1, y1);
        pos += take;
        remaining -= take;
        if (remaining <= 1e-6) {
          drawing = !drawing;
          remaining = drawing ? dash : gap;
        }
      }
    }
  }

  private drawArrowHead(g: Graphics, points: Point[], color: number): void {
    if (points.length < 2) return;
    const tip = points[points.length - 1];
    const prev = points[Math.max(0, points.length - 4)];
    const angle = Math.atan2(tip.y - prev.y, tip.x - prev.x);
    const size = 1.15;
    const left = angle + Math.PI * 0.82;
    const right = angle - Math.PI * 0.82;
    g.moveTo(tip.x, tip.y)
      .lineTo(tip.x + Math.cos(left) * size, tip.y + Math.sin(left) * size)
      .lineTo(tip.x + Math.cos(right) * size, tip.y + Math.sin(right) * size)
      .lineTo(tip.x, tip.y)
      .fill({ color, alpha: 0.42 });
  }

  private drawFlows(snapshot: SimulationSnapshot): void {
    const g = this.flows;
    g.clear();

    for (const city of snapshot.cities) {
      if (city.integration < 0.08) continue;
      const blue = city.owner === 'blue';
      const flowX = blue ? snapshot.flowBlueX : snapshot.flowRedX;
      const flowY = blue ? snapshot.flowBlueY : snapshot.flowRedY;
      const color = blue ? BLUE_DARK : RED_DARK;
      const offsets = city.baseProduction >= 4.5 ? [-0.7, 0, 0.7] : [-0.35, 0.35];

      for (const offset of offsets) {
        const path = this.traceFlow(snapshot, city, flowX, flowY, offset);
        if (path.length < 4) continue;

        // Quiet route underlay.
        g.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < path.length; i++) g.lineTo(path[i].x, path[i].y);
        g.stroke({ color, width: 0.18, alpha: 0.16 });

        // Moving dashes make direction visible without filling the whole map with vectors.
        this.drawDashedPath(g, path, snapshot.gameTime * 0.9 + offset * 1.7);
        g.stroke({ color, width: 0.27, alpha: 0.56 });
        this.drawArrowHead(g, path, color);
      }
    }
  }

  private drawInstability(snapshot: SimulationSnapshot): void {
    const g = this.instability;
    g.clear();
    for (let y = 1; y < snapshot.height - 1; y += 2) {
      for (let x = 1; x < snapshot.width - 1; x += 2) {
        const i = y * snapshot.width + x;
        if (Math.abs(snapshot.control[i]) > 0.24) continue;
        const b = snapshot.instabilityBlue[i];
        const r = snapshot.instabilityRed[i];
      const v = Math.max(b, r);
      if (v < 0.08) continue;
      g.circle(x, y, 0.35 + Math.min(1, v) * 0.9).fill({
        color: b > r ? RED_DARK : BLUE_DARK,
        alpha: Math.min(0.50, 0.08 + v * 0.28),
      });
      }
    }
  }

  private drawCities(snapshot: SimulationSnapshot): void {
    const g = this.cities;
    g.clear();
    for (const city of snapshot.cities) {
      const radius = 0.62 + city.baseProduction * 0.11;
      const color = city.owner === 'blue' ? BLUE_DARK : RED_DARK;
      g.circle(city.x, city.y, radius + 0.28).fill({ color: PAPER_LIGHT, alpha: 0.96 });
      g.circle(city.x, city.y, radius).fill({ color, alpha: 0.96 });
      if (city.integration < 0.999) {
        const ring = Math.max(0.1, city.integration);
        g.circle(city.x, city.y, radius * ring).fill({ color: PAPER_LIGHT, alpha: 0.36 });
      }
    }
  }

}
