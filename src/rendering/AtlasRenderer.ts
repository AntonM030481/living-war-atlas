import { Application, Container, Graphics, Text } from 'pixi.js';
import type { SimulationSnapshot, MapDefinition, City } from '../sim/types';

const BLUE = 0x557895;
const BLUE_DARK = 0x315b7f;
const RED = 0xb06a58;
const RED_DARK = 0x8f4638;
const PAPER = 0xd8cfb8;
const PAPER_LIGHT = 0xeee7d5;
const INK = 0x3b3932;
const RIVER = 0x718da2;

interface Point { x: number; y: number }

export class AtlasRenderer {
  private readonly world = new Container();
  private readonly terrain = new Graphics();
  private readonly historicalBorder = new Graphics();
  private readonly territory = new Graphics();
  private readonly flows = new Graphics();
  private readonly front = new Graphics();
  private readonly instability = new Graphics();
  private readonly cities = new Graphics();
  private readonly labels = new Container();
  private debug = false;

  constructor(
    private readonly app: Application,
    private readonly map: MapDefinition,
  ) {
    this.world.addChild(
      this.terrain,
      this.historicalBorder,
      this.territory,
      this.flows,
      this.front,
      this.instability,
      this.cities,
      this.labels,
    );
    this.app.stage.addChild(this.world);
    this.drawTerrain();
    this.drawHistoricalBorder();
    this.createCityLabels();
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
    const sx = (this.app.screen.width - margin * 2) / this.map.width;
    const sy = (this.app.screen.height - margin * 2) / this.map.height;
    const scale = Math.max(0.1, Math.min(sx, sy));
    this.world.scale.set(scale);
    this.world.x = (this.app.screen.width - this.map.width * scale) / 2;
    this.world.y = (this.app.screen.height - this.map.height * scale) / 2;
  }

  private drawTerrain(): void {
    const g = this.terrain;
    g.clear();
    g.rect(0, 0, this.map.width, this.map.height).fill(PAPER);

    // Very light cartographic paper texture: sparse horizontal strokes.
    for (let y = 3; y < this.map.height; y += 5) {
      g.moveTo(0, y).lineTo(this.map.width, y + 0.12);
    }
    g.stroke({ color: 0x8a806d, width: 0.06, alpha: 0.08 });

    // Mountains are hachures only; no large translucent circles.
    for (const m of this.map.mountains) {
      for (let row = -3; row <= 3; row++) {
        const yy = m.y + row * (m.r / 4.3);
        const inside = Math.max(0, 1 - (row / 3.6) ** 2);
        const half = m.r * 0.72 * Math.sqrt(inside);
        if (half < 0.5) continue;
        const segments = Math.max(2, Math.round(half / 2.3));
        for (let s = 0; s < segments; s++) {
          const x = m.x - half + ((s + 0.5) / segments) * half * 2;
          const size = 0.9 + 0.35 * Math.sin((s + row) * 1.7);
          g.moveTo(x - size, yy + 0.8)
            .lineTo(x, yy - 0.25)
            .lineTo(x + size, yy + 0.8);
        }
      }
    }
    g.stroke({ color: 0x766e5f, width: 0.16, alpha: 0.50 });

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

  private frontXByRow(snapshot: SimulationSnapshot): Array<number | null> {
    const out: Array<number | null> = new Array(snapshot.height).fill(null);
    const { width, height, control } = snapshot;
    for (let y = 0; y < height; y++) {
      const candidates: number[] = [];
      for (let x = 0; x < width - 1; x++) {
        const a = control[y * width + x];
        const b = control[y * width + x + 1];
        if ((a >= 0) === (b >= 0)) continue;
        const t = Math.abs(a) / (Math.abs(a) + Math.abs(b) + 1e-6);
        candidates.push(x + t);
      }
      if (candidates.length > 0) {
        // Main theatre: choose the crossing nearest the map centre.
        let best = candidates[0];
        let bestD = Math.abs(best - width / 2);
        for (const x of candidates) {
          const d = Math.abs(x - width / 2);
          if (d < bestD) { best = x; bestD = d; }
        }
        out[y] = best;
      }
    }

    // Gentle visual smoothing only; simulation remains untouched.
    const smoothed = out.slice();
    for (let y = 2; y < height - 2; y++) {
      const values = [out[y - 2], out[y - 1], out[y], out[y + 1], out[y + 2]]
        .filter((v): v is number => v !== null);
      if (values.length >= 3) smoothed[y] = values.reduce((a, b) => a + b, 0) / values.length;
    }
    return smoothed;
  }

  private drawFront(snapshot: SimulationSnapshot): void {
    const g = this.front;
    g.clear();
    const rows = this.frontXByRow(snapshot);

    const drawPath = (offset: number, color: number, width: number, alpha: number) => {
      let started = false;
      for (let y = 0; y < rows.length; y++) {
        const x = rows[y];
        if (x === null) { started = false; continue; }
        if (!started) { g.moveTo(x + offset, y); started = true; }
        else g.lineTo(x + offset, y);
      }
      g.stroke({ color, width, alpha });
    };

    // Two faint opposing shoulders make the line read as a battle front,
    // with a dark atlas line in the middle. No white contour halo.
    drawPath(-0.27, BLUE_DARK, 0.42, 0.78);
    drawPath(+0.27, RED_DARK, 0.42, 0.78);
    drawPath(0, INK, 0.16, 0.96);
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
      }
    }
  }

  private drawInstability(snapshot: SimulationSnapshot): void {
    const g = this.instability;
    g.clear();
    const rows = this.frontXByRow(snapshot);
    for (let y = 1; y < snapshot.height - 1; y += 2) {
      const x = rows[y];
      if (x === null) continue;
      const ix = Math.max(0, Math.min(snapshot.width - 1, Math.round(x)));
      const i = y * snapshot.width + ix;
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

  private createCityLabels(): void {
    for (const city of this.map.cities) {
      const label = new Text({
        text: city.name,
        style: {
          fontFamily: 'Georgia, Times New Roman, serif',
          fontSize: 2.15,
          fontWeight: '600',
          fill: '#34312b',
          stroke: { color: '#eee7d5', width: 0.42 },
        },
      });
      label.x = city.x + 1.45;
      label.y = city.y - 1.18;
      label.resolution = 3;
      this.labels.addChild(label);
    }
  }
}
