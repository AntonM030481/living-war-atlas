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
interface FrontSample extends Point {
  sampleIndex: number;
  nx: number;
  ny: number;
  blueWidth: number;
  redWidth: number;
}
interface FlowTrace {
  points: Point[];
  averageMagnitude: number;
  maxMagnitude: number;
}
export interface FrontDebugInfo {
  x: number;
  y: number;
  index: number;
  distance: number;
  radius: number;
  control: number;
  warBlue: number;
  warRed: number;
  frontMassBlue: number;
  frontMassRed: number;
  incomingBlue: number;
  incomingRed: number;
  drainBlue: number;
  drainRed: number;
  advanceBlue: number;
  advanceRed: number;
  stressBlue: number;
  stressRed: number;
  rawForcing: number;
  forcing: number;
  pressure: number;
  instabilityBlue: number;
  instabilityRed: number;
  terrainDefense: number;
  terrainMobility: number;
  flowBlue: number;
  flowRed: number;
  localWarBlue: number;
  localWarRed: number;
  localDrainBlue: number;
  localDrainRed: number;
}

export class AtlasRenderer {
  private readonly world = new Container();
  private readonly terrain = new Graphics();
  private readonly grid = new Graphics();
  private readonly historicalBorder = new Graphics();
  private readonly territory = new Graphics();
  private readonly resourceDensity = new Graphics();
  private readonly flows = new Graphics();
  private readonly front = new Graphics();
  private readonly instability = new Graphics();
  private readonly cities = new Graphics();
  private readonly probe = new Graphics();
  private debug = false;
  private selectedFrontIndex: number | null = null;

  constructor(
    private readonly app: Application,
    private readonly map: MapDefinition,
  ) {
    this.world.addChild(
      this.terrain,
      this.grid,
      this.historicalBorder,
      this.territory,
      this.resourceDensity,
      this.flows,
      this.front,
      this.instability,
      this.cities,
      this.probe,
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
    this.resourceDensity.visible = value;
  }

  toggleDebug(): boolean {
    this.setDebug(!this.debug);
    return this.debug;
  }

  cityIdAtClientPoint(clientX: number, clientY: number): string | null {
    const { x, y } = this.clientToWorld(clientX, clientY);
    let best: string | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const city of this.map.cities) {
      const radius = (1.15 + city.baseProduction * 0.14) * this.mapScale();
      const distance = Math.hypot(x - city.x, y - city.y);
      if (distance <= radius && distance < bestDistance) {
        best = city.id;
        bestDistance = distance;
      }
    }

    return best;
  }

  inspectFrontAtClientPoint(snapshot: SimulationSnapshot, clientX: number, clientY: number): FrontDebugInfo | null {
    return this.inspectFrontAtWorldPoint(snapshot, this.clientToWorld(clientX, clientY));
  }

  inspectFrontAtWorldPoint(snapshot: SimulationSnapshot, point: Point): FrontDebugInfo | null {
    let best: FrontSample | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const sample of this.frontSamples(snapshot)) {
      const distance = Math.hypot(point.x - sample.x, point.y - sample.y);
      if (distance < bestDistance) {
        best = sample;
        bestDistance = distance;
      }
    }

    if (!best || bestDistance > 4.5 * this.mapScale()) {
      this.selectedFrontIndex = null;
      this.probe.clear();
      return null;
    }

    const i = best.sampleIndex;
    const radius = Math.round(5 * this.mapScale());
    this.selectedFrontIndex = i;
    return {
      x: best.x,
      y: best.y,
      index: i,
      distance: bestDistance,
      radius,
      control: this.localAverage(snapshot, snapshot.control, best.x, best.y, radius),
      warBlue: this.localAverage(snapshot, snapshot.warBlue, best.x, best.y, radius),
      warRed: this.localAverage(snapshot, snapshot.warRed, best.x, best.y, radius),
      frontMassBlue: this.localAverage(snapshot, snapshot.frontMassBlue, best.x, best.y, radius),
      frontMassRed: this.localAverage(snapshot, snapshot.frontMassRed, best.x, best.y, radius),
      incomingBlue: this.localAverage(snapshot, snapshot.incomingBlue, best.x, best.y, radius),
      incomingRed: this.localAverage(snapshot, snapshot.incomingRed, best.x, best.y, radius),
      drainBlue: this.localAverage(snapshot, snapshot.drainBlue, best.x, best.y, radius),
      drainRed: this.localAverage(snapshot, snapshot.drainRed, best.x, best.y, radius),
      advanceBlue: this.localAverage(snapshot, snapshot.advanceBlue, best.x, best.y, radius),
      advanceRed: this.localAverage(snapshot, snapshot.advanceRed, best.x, best.y, radius),
      stressBlue: this.localAverage(snapshot, snapshot.stressBlue, best.x, best.y, radius),
      stressRed: this.localAverage(snapshot, snapshot.stressRed, best.x, best.y, radius),
      rawForcing: this.localAverage(snapshot, snapshot.rawForcing, best.x, best.y, radius),
      forcing: this.localAverage(snapshot, snapshot.forcing, best.x, best.y, radius),
      pressure: this.localAverage(snapshot, snapshot.pressure, best.x, best.y, radius),
      instabilityBlue: this.localAverage(snapshot, snapshot.instabilityBlue, best.x, best.y, radius),
      instabilityRed: this.localAverage(snapshot, snapshot.instabilityRed, best.x, best.y, radius),
      terrainDefense: this.localAverage(snapshot, snapshot.terrainDefense, best.x, best.y, radius),
      terrainMobility: this.localAverage(snapshot, snapshot.terrainMobility, best.x, best.y, radius),
      flowBlue: this.localVectorMagnitudeAverage(snapshot, snapshot.flowBlueX, snapshot.flowBlueY, best.x, best.y, radius),
      flowRed: this.localVectorMagnitudeAverage(snapshot, snapshot.flowRedX, snapshot.flowRedY, best.x, best.y, radius),
      localWarBlue: this.localSum(snapshot, snapshot.warBlue, best.x, best.y, radius),
      localWarRed: this.localSum(snapshot, snapshot.warRed, best.x, best.y, radius),
      localDrainBlue: this.localSum(snapshot, snapshot.drainBlue, best.x, best.y, radius),
      localDrainRed: this.localSum(snapshot, snapshot.drainRed, best.x, best.y, radius),
    };
  }

  private clientToWorld(clientX: number, clientY: number): Point {
    const rect = this.app.canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - this.world.x) / this.world.scale.x,
      y: (clientY - rect.top - this.world.y) / this.world.scale.y,
    };
  }

  private mapScale(): number {
    return this.map.width / 128;
  }

  render(snapshot: SimulationSnapshot): void {
    this.drawTerritory(snapshot);
    if (this.debug) this.drawResourceDensity(snapshot);
    else this.resourceDensity.clear();
    this.drawFlows(snapshot);
    this.drawFront(snapshot);
    this.drawCities(snapshot);
    if (this.debug) this.drawInstability(snapshot);
    this.drawProbe(snapshot);
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
  }

  private drawResourceDensity(snapshot: SimulationSnapshot): void {
    const g = this.resourceDensity;
    g.clear();
    this.drawResourceHeightmap(g, snapshot, 'blue');
    this.drawResourceHeightmap(g, snapshot, 'red');
  }

  private drawResourceHeightmap(g: Graphics, snapshot: SimulationSnapshot, side: 'blue' | 'red'): void {
    const color = side === 'blue' ? BLUE_DARK : RED_DARK;
    const war = side === 'blue' ? snapshot.warBlue : snapshot.warRed;

    for (let y = 0; y < snapshot.height; y++) {
      for (let x = 0; x < snapshot.width; x++) {
        const i = y * snapshot.width + x;
        const control = side === 'blue' ? snapshot.control[i] : -snapshot.control[i];
        if (control < -0.12) continue;
        const v = war[i];
        if (v < 0.08) continue;
        const strength = Math.max(0, Math.min(1, Math.pow(v / 3.2, 0.58)));
        g.rect(x, y, 1, 1).fill({
          color,
          alpha: 0.035 + strength * 0.32,
        });
      }
    }
  }

  private frontSamples(snapshot: SimulationSnapshot): FrontSample[] {
    const rows: Array<{ x: number; y: number; sampleIndex: number } | null> = new Array(snapshot.height).fill(null);
    const { width, height, control } = snapshot;

    for (let y = 0; y < height; y++) {
      let bestX: number | null = null;
      let bestD = Number.POSITIVE_INFINITY;
      for (let x = 0; x < width - 1; x++) {
        const a = control[y * width + x];
        const b = control[y * width + x + 1];
        if ((a >= 0) === (b >= 0)) continue;
        const t = Math.abs(a) / (Math.abs(a) + Math.abs(b) + 1e-6);
        const crossingX = x + t;
        const d = Math.abs(crossingX - width / 2);
        if (d < bestD) {
          bestX = crossingX;
          bestD = d;
        }
      }
      if (bestX !== null) rows[y] = { x: bestX, y, sampleIndex: this.indexClamp(snapshot, bestX, y) };
    }

    const smoothed = rows.map((row, y) => {
      if (!row) return null;
      let total = 0;
      let count = 0;
      for (let yy = y - 2; yy <= y + 2; yy++) {
        const neighbor = rows[yy];
        if (!neighbor) continue;
        total += neighbor.x;
        count += 1;
      }
      const x = count > 0 ? total / count : row.x;
      return { x, y: row.y, sampleIndex: this.indexClamp(snapshot, x, row.y) };
    });

    const samples: FrontSample[] = [];
    for (let y = 0; y < smoothed.length; y++) {
      const row = smoothed[y];
      if (!row) continue;
      const prev = smoothed[Math.max(0, y - 2)] ?? row;
      const next = smoothed[Math.min(smoothed.length - 1, y + 2)] ?? row;
      const tx = next.x - prev.x;
      const ty = Math.max(0.001, next.y - prev.y);
      const len = Math.hypot(tx, ty);
      const nx = -ty / len;
      const ny = tx / len;
      samples.push({
        ...row,
        nx,
        ny,
        blueWidth: this.frontSideWidth(snapshot.frontMassBlue[row.sampleIndex]),
        redWidth: this.frontSideWidth(snapshot.frontMassRed[row.sampleIndex]),
      });
    }

    return samples;
  }

  private indexClamp(snapshot: SimulationSnapshot, x: number, y: number): number {
    const ix = Math.max(0, Math.min(snapshot.width - 1, Math.round(x)));
    const iy = Math.max(0, Math.min(snapshot.height - 1, Math.round(y)));
    return iy * snapshot.width + ix;
  }

  private frontSideWidth(mass: number): number {
    const strength = Math.max(0, Math.min(1, Math.sqrt(mass / 16)));
    return 0.34 + strength * 2.35;
  }

  private drawFront(snapshot: SimulationSnapshot): void {
    const g = this.front;
    g.clear();
    const samples = this.frontSamples(snapshot);

    const drawSide = (side: 'blue' | 'red', dark: number) => {
      const sign = side === 'blue' ? 1 : -1;
      for (let i = 1; i < samples.length; i++) {
        const a = samples[i - 1];
        const b = samples[i];
        if (b.y - a.y > 1.5) continue;
        const aw = side === 'blue' ? a.blueWidth : a.redWidth;
        const bw = side === 'blue' ? b.blueWidth : b.redWidth;
        const ax = a.x + a.nx * sign * (0.24 + aw * 0.28);
        const ay = a.y + a.ny * sign * (0.24 + aw * 0.28);
        const bx = b.x + b.nx * sign * (0.24 + bw * 0.28);
        const by = b.y + b.ny * sign * (0.24 + bw * 0.28);
        const width = (aw + bw) * 0.5;
        g.moveTo(ax, ay).lineTo(bx, by);
        g.stroke({ color: dark, width: Math.max(0.18, width * 0.34), alpha: 1 });
      }
    };

    drawSide('blue', BLUE_DARK);
    drawSide('red', RED_DARK);
    this.drawIncomingMarkers(g, snapshot, samples);

    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1];
      const b = samples[i];
      if (b.y - a.y > 1.5) continue;
      g.moveTo(a.x, a.y).lineTo(b.x, b.y);
      g.stroke({ color: INK, width: 0.14, alpha: 1 });
    }
  }

  private drawIncomingMarkers(g: Graphics, snapshot: SimulationSnapshot, samples: FrontSample[]): void {
    const drawSideMarkers = (side: 'blue' | 'red', color: number) => {
      const sign = side === 'blue' ? 1 : -1;
      const incoming = side === 'blue' ? snapshot.incomingBlue : snapshot.incomingRed;
      for (let i = 1; i < samples.length; i += 4) {
        const sample = samples[i];
        const amount = incoming[sample.sampleIndex];
        if (amount < 0.08) continue;
        const strength = Math.max(0, Math.min(1, Math.sqrt(amount / 4.2)));
        const width = side === 'blue' ? sample.blueWidth : sample.redWidth;
        const baseX = sample.x + sample.nx * sign * (0.38 + width * 0.50);
        const baseY = sample.y + sample.ny * sign * (0.38 + width * 0.50);
        const tipX = baseX + sample.nx * sign * (0.62 + strength * 1.20);
        const tipY = baseY + sample.ny * sign * (0.62 + strength * 1.20);
        g.moveTo(baseX, baseY).lineTo(tipX, tipY);
        g.stroke({ color, width: 0.14 + strength * 0.36, alpha: 1 });
      }
    };

    drawSideMarkers('blue', BLUE_DARK);
    drawSideMarkers('red', RED_DARK);
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
  ): FlowTrace {
    let x = city.x;
    let y = city.y + lateralOffset;
    const points: Point[] = [{ x, y }];
    let stale = 0;
    let magnitudeSum = 0;
    let magnitudeSamples = 0;
    let maxMagnitude = 0;

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
        magnitudeSum += mag;
        magnitudeSamples += 1;
        maxMagnitude = Math.max(maxMagnitude, mag);
        const stepSize = 0.55;
        x += (v.x / mag) * stepSize;
        y += (v.y / mag) * stepSize;
      }

      if (x < 0 || x >= snapshot.width || y < 0 || y >= snapshot.height) break;
      points.push({ x, y });
      const i = Math.round(y) * snapshot.width + Math.round(x);
      if (i >= 0 && i < snapshot.control.length && Math.abs(snapshot.control[i]) < 0.22) break;
    }
    return {
      points,
      averageMagnitude: magnitudeSamples > 0 ? magnitudeSum / magnitudeSamples : 0,
      maxMagnitude,
    };
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
      if (city.enabled === false) continue;
      if (city.integration < 0.08) continue;
      const blue = city.owner === 'blue';
      const flowX = blue ? snapshot.flowBlueX : snapshot.flowRedX;
      const flowY = blue ? snapshot.flowBlueY : snapshot.flowRedY;
      const color = blue ? BLUE_DARK : RED_DARK;
      const offsets = city.baseProduction >= 4.5 ? [-0.7, 0, 0.7] : [-0.35, 0.35];

      for (const offset of offsets) {
        const trace = this.traceFlow(snapshot, city, flowX, flowY, offset);
        const path = trace.points;
        if (path.length < 4) continue;

        const strength = Math.min(1, Math.sqrt(trace.averageMagnitude / 4.5));
        const underlayWidth = 0.10 + strength * 0.20;
        const routeWidth = 0.14 + strength * 0.34;
        const routeAlpha = 0.22 + strength * 0.52;
        const phaseSpeed = 0.35 + strength * 1.15;

        // Quiet route underlay.
        g.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < path.length; i++) g.lineTo(path[i].x, path[i].y);
        g.stroke({ color, width: underlayWidth, alpha: 0.11 + strength * 0.14 });

        // Moving dashes make direction visible without filling the whole map with vectors.
        this.drawDashedPath(g, path, snapshot.gameTime * phaseSpeed + offset * 1.7);
        g.stroke({ color, width: routeWidth, alpha: routeAlpha });
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

  private drawProbe(snapshot: SimulationSnapshot): void {
    const g = this.probe;
    g.clear();
    if (this.selectedFrontIndex === null) return;
    const x = this.selectedFrontIndex % snapshot.width;
    const y = Math.floor(this.selectedFrontIndex / snapshot.width);
    g.circle(x, y, 1.7).stroke({ color: INK, width: 0.22, alpha: 1 });
    g.circle(x, y, 1.15).stroke({ color: PAPER_LIGHT, width: 0.24, alpha: 0.95 });
    g.moveTo(x - 2.1, y).lineTo(x + 2.1, y);
    g.moveTo(x, y - 2.1).lineTo(x, y + 2.1);
    g.stroke({ color: INK, width: 0.10, alpha: 0.88 });
  }

  private drawCities(snapshot: SimulationSnapshot): void {
    const g = this.cities;
    g.clear();
    for (const city of snapshot.cities) {
      const radius = 0.62 + city.baseProduction * 0.11;
      const color = city.owner === 'blue' ? BLUE_DARK : RED_DARK;
      const enabled = city.enabled !== false;
      const reserve = this.cityLocalResource(snapshot, city);
      const reserveStrength = Math.max(0, Math.min(1, Math.sqrt(reserve / 42)));
      if (reserveStrength > 0.02) {
        g.circle(city.x, city.y, radius + 0.72 + reserveStrength * 1.65).stroke({
          color,
          width: 0.16 + reserveStrength * 0.34,
          alpha: enabled ? 0.82 : 0.42,
        });
      }
      g.circle(city.x, city.y, radius + 0.28).fill({ color: PAPER_LIGHT, alpha: 0.96 });
      if (enabled) {
        g.circle(city.x, city.y, radius).fill({ color, alpha: 0.96 });
      } else {
        g.circle(city.x, city.y, radius).fill({ color: PAPER, alpha: 1 });
        g.circle(city.x, city.y, Math.max(0.22, radius - 0.18)).stroke({
          color,
          width: 0.24,
          alpha: 0.92,
        });
        g.moveTo(city.x - radius * 0.75, city.y + radius * 0.75)
          .lineTo(city.x + radius * 0.75, city.y - radius * 0.75);
        g.stroke({ color, width: 0.22, alpha: 0.92 });
      }
      if (city.integration < 0.999) {
        const ring = Math.max(0.1, city.integration);
        g.circle(city.x, city.y, radius * ring).fill({ color: PAPER_LIGHT, alpha: 0.36 });
      }
    }
  }

  private cityLocalResource(snapshot: SimulationSnapshot, city: City): number {
    const war = city.owner === 'blue' ? snapshot.warBlue : snapshot.warRed;
    let total = 0;
    const radius = 5;

    for (let dy = -radius; dy <= radius; dy++) {
      const y = city.y + dy;
      if (y < 0 || y >= snapshot.height) continue;
      for (let dx = -radius; dx <= radius; dx++) {
        const x = city.x + dx;
        if (x < 0 || x >= snapshot.width) continue;
        const d = Math.hypot(dx, dy);
        if (d > radius) continue;
        const i = y * snapshot.width + x;
        total += war[i] * (1 - d / (radius + 1));
      }
    }

    return total;
  }

  private localSum(snapshot: SimulationSnapshot, field: Float32Array, x: number, y: number, radius: number): number {
    let total = 0;
    for (const { index, weight } of this.localWeightedCells(snapshot, x, y, radius)) total += field[index] * weight;
    return total;
  }

  private localAverage(snapshot: SimulationSnapshot, field: Float32Array, x: number, y: number, radius: number): number {
    let total = 0;
    let weightTotal = 0;
    for (const { index, weight } of this.localWeightedCells(snapshot, x, y, radius)) {
      total += field[index] * weight;
      weightTotal += weight;
    }
    return weightTotal > 0 ? total / weightTotal : 0;
  }

  private localVectorMagnitudeAverage(
    snapshot: SimulationSnapshot,
    xField: Float32Array,
    yField: Float32Array,
    x: number,
    y: number,
    radius: number,
  ): number {
    let total = 0;
    let weightTotal = 0;
    for (const { index, weight } of this.localWeightedCells(snapshot, x, y, radius)) {
      total += Math.hypot(xField[index], yField[index]) * weight;
      weightTotal += weight;
    }
    return weightTotal > 0 ? total / weightTotal : 0;
  }

  private localWeightedCells(
    snapshot: SimulationSnapshot,
    x: number,
    y: number,
    radius: number,
  ): Array<{ index: number; weight: number }> {
    const cells: Array<{ index: number; weight: number }> = [];
    const cx = Math.round(x);
    const cy = Math.round(y);

    for (let dy = -radius; dy <= radius; dy++) {
      const yy = cy + dy;
      if (yy < 0 || yy >= snapshot.height) continue;
      for (let dx = -radius; dx <= radius; dx++) {
        const xx = cx + dx;
        if (xx < 0 || xx >= snapshot.width) continue;
        const d = Math.hypot(dx, dy);
        if (d > radius) continue;
        cells.push({
          index: yy * snapshot.width + xx,
          weight: 1 - d / (radius + 1),
        });
      }
    }

    return cells;
  }

}
