import { Application, Container, Graphics } from 'pixi.js';
import type { SimulationSnapshot, MapDefinition, City } from '../sim/types';
import { CFG } from '../sim/Config';

const BLUE = 0x4f769d;
const BLUE_DARK = 0x164f91;
const RED = 0xc76b5c;
const RED_DARK = 0xb12620;
const PAPER = 0xe6ddb7;
const PAPER_LIGHT = 0xf6efd7;
const INK = 0x2f2b24;
const RIVER = 0x4fa6bd;
const GRID = 0x8b7a59;
const RESOURCE_CLAMP = 18;

interface Point { x: number; y: number }
interface FrontSample extends Point {
  sampleIndex: number;
  nx: number;
  ny: number;
  blueWidth: number;
  redWidth: number;
}
interface FrontSegment {
  a: FrontSample;
  b: FrontSample;
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
  private readonly probe = new Graphics();
  private debug = false;
  private showFlows = false;
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

  setShowFlows(value: boolean): void {
    this.showFlows = value;
    this.flows.visible = value;
    if (!value) this.flows.clear();
  }

  toggleDebug(): boolean {
    this.setDebug(!this.debug);
    return this.debug;
  }

  mapScreenRect(): { left: number; top: number; width: number; height: number } {
    const canvasRect = this.app.canvas.getBoundingClientRect();
    return {
      left: canvasRect.left + this.world.x,
      top: canvasRect.top + this.world.y,
      width: this.map.width * this.world.scale.x,
      height: this.map.height * this.world.scale.y,
    };
  }

  resize(): void {
    this.fit();
  }

  worldToScreen(point: Point): Point {
    const canvasRect = this.app.canvas.getBoundingClientRect();
    return {
      x: canvasRect.left + this.world.x + point.x * this.world.scale.x,
      y: canvasRect.top + this.world.y + point.y * this.world.scale.y,
    };
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
    if (this.showFlows) this.drawFlows(snapshot);
    else this.flows.clear();
    this.drawFront(snapshot);
    if (this.debug) this.drawInstability(snapshot);
    this.drawProbe(snapshot);
  }

  private fit(): void {
    const margin = 0;
    const availableWidth = Math.max(240, this.app.screen.width);
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

    for (const forest of this.map.forests) {
      const boundary: Point[] = [];
      const points = 42;
      for (let i = 0; i < points; i++) {
        const a = (i / points) * Math.PI * 2;
        const wobble =
          1
          + 0.13 * Math.sin(a * 3 + forest.x * 0.13)
          + 0.08 * Math.sin(a * 5 - forest.y * 0.11)
          + 0.05 * Math.sin(a * 9 + forest.x * 0.07);
        boundary.push({
          x: forest.x + Math.cos(a) * forest.r * wobble * 0.92,
          y: forest.y + Math.sin(a) * forest.r * wobble * 0.78,
        });
      }

      g.moveTo(boundary[0].x, boundary[0].y);
      for (let i = 1; i < boundary.length; i++) g.lineTo(boundary[i].x, boundary[i].y);
      g.closePath().fill({ color: 0x83a96b, alpha: 0.30 });
    }

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
    g.stroke({ color: INK, width: 0.26, alpha: 0.24 });
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
    this.drawResourceOverloadGlow(g, snapshot, 'blue');
    this.drawResourceOverloadGlow(g, snapshot, 'red');
    this.drawCityResourceClouds(g, snapshot);
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
        const strength = Math.max(0, Math.min(1, Math.pow(v / RESOURCE_CLAMP, 0.70)));
        g.rect(x, y, 1, 1).fill({
          color,
          alpha: 0.035 + strength * 0.31,
        });
      }
    }
  }

  private drawResourceOverloadGlow(g: Graphics, snapshot: SimulationSnapshot, side: 'blue' | 'red'): void {
    const color = side === 'blue' ? BLUE_DARK : RED_DARK;
    const war = side === 'blue' ? snapshot.warBlue : snapshot.warRed;

    for (let y = 0; y < snapshot.height; y += 2) {
      for (let x = 0; x < snapshot.width; x += 2) {
        const i = y * snapshot.width + x;
        const control = side === 'blue' ? snapshot.control[i] : -snapshot.control[i];
        if (control < -0.12) continue;
        const overload = war[i] - RESOURCE_CLAMP;
        if (overload <= 0) continue;
        const strength = Math.min(1, Math.log1p(overload) / Math.log1p(160));
        g.circle(x + 0.5, y + 0.5, 1.8 + strength * 3.4).fill({
          color,
          alpha: 0.035 + strength * 0.17,
        });
      }
    }
  }

  private drawCityResourceClouds(g: Graphics, snapshot: SimulationSnapshot): void {
    for (const city of snapshot.cities) {
      const blue = city.owner === 'blue';
      const war = blue ? snapshot.warBlue : snapshot.warRed;
      const color = blue ? BLUE_DARK : RED_DARK;
      const localWar = this.localSum(snapshot, war, city.x, city.y, 5);
      if (localWar < 6) continue;

      const strength = Math.min(1, Math.log1p(localWar) / Math.log1p(900));
      const radius = 1.5 + strength * 6.5;
      const alpha = 0.11 + strength * 0.27;

      g.circle(city.x, city.y, radius * 1.45).fill({ color, alpha: alpha * 0.22 });
      g.circle(city.x, city.y, radius).fill({ color, alpha });
    }
  }

  private frontSamples(snapshot: SimulationSnapshot): FrontSample[] {
    return this.frontSegments(snapshot).map((segment) => {
      const x = (segment.a.x + segment.b.x) * 0.5;
      const y = (segment.a.y + segment.b.y) * 0.5;
      const sampleIndex = this.indexClamp(snapshot, x, y);
      return {
        x,
        y,
        sampleIndex,
        nx: (segment.a.nx + segment.b.nx) * 0.5,
        ny: (segment.a.ny + segment.b.ny) * 0.5,
        blueWidth: this.frontSideWidth(snapshot.frontMassBlue[sampleIndex]),
        redWidth: this.frontSideWidth(snapshot.frontMassRed[sampleIndex]),
      };
    });
  }

  private frontSegments(snapshot: SimulationSnapshot): FrontSegment[] {
    const segments: FrontSegment[] = [];
    const { width, height, control } = snapshot;
    const px = width > CFG.frontBoundaryPadding * 2 + 1 ? CFG.frontBoundaryPadding : 0;
    const py = height > CFG.frontBoundaryPadding * 2 + 1 ? CFG.frontBoundaryPadding : 0;

    for (let y = py; y < height - 1 - py; y++) {
      for (let x = px; x < width - 1 - px; x++) {
        const tl = control[y * width + x];
        const tr = control[y * width + x + 1];
        const br = control[(y + 1) * width + x + 1];
        const bl = control[(y + 1) * width + x];
        const crossings: Point[] = [];

        if (this.crossesZero(tl, tr)) crossings.push(this.edgeCrossing(x, y, x + 1, y, tl, tr));
        if (this.crossesZero(tr, br)) crossings.push(this.edgeCrossing(x + 1, y, x + 1, y + 1, tr, br));
        if (this.crossesZero(br, bl)) crossings.push(this.edgeCrossing(x + 1, y + 1, x, y + 1, br, bl));
        if (this.crossesZero(bl, tl)) crossings.push(this.edgeCrossing(x, y + 1, x, y, bl, tl));

        if (crossings.length === 2) {
          segments.push(this.makeFrontSegment(snapshot, crossings[0], crossings[1]));
        } else if (crossings.length === 4) {
          segments.push(this.makeFrontSegment(snapshot, crossings[0], crossings[1]));
          segments.push(this.makeFrontSegment(snapshot, crossings[2], crossings[3]));
        }
      }
    }

    return segments;
  }

  private crossesZero(a: number, b: number): boolean {
    return (a < 0 && b >= 0) || (a >= 0 && b < 0);
  }

  private edgeCrossing(x0: number, y0: number, x1: number, y1: number, a: number, b: number): Point {
    const t = Math.abs(a) / (Math.abs(a) + Math.abs(b) + 1e-6);
    return {
      x: x0 + (x1 - x0) * t,
      y: y0 + (y1 - y0) * t,
    };
  }

  private makeFrontSegment(snapshot: SimulationSnapshot, a: Point, b: Point): FrontSegment {
    return {
      a: this.makeFrontSample(snapshot, a, b),
      b: this.makeFrontSample(snapshot, b, a),
    };
  }

  private makeFrontSample(snapshot: SimulationSnapshot, point: Point, fallback: Point): FrontSample {
    const sampleIndex = this.indexClamp(snapshot, point.x, point.y);
    const normal = this.controlNormal(snapshot, point, fallback);
    return {
      ...point,
      sampleIndex,
      nx: normal.x,
      ny: normal.y,
      blueWidth: this.frontSideWidth(snapshot.frontMassBlue[sampleIndex]),
      redWidth: this.frontSideWidth(snapshot.frontMassRed[sampleIndex]),
    };
  }

  private controlNormal(snapshot: SimulationSnapshot, point: Point, fallback: Point): Point {
    const x = Math.max(0, Math.min(snapshot.width - 1, Math.round(point.x)));
    const y = Math.max(0, Math.min(snapshot.height - 1, Math.round(point.y)));
    const i = y * snapshot.width + x;
    const left = x > 0 ? snapshot.control[i - 1] : snapshot.control[i];
    const right = x + 1 < snapshot.width ? snapshot.control[i + 1] : snapshot.control[i];
    const up = y > 0 ? snapshot.control[i - snapshot.width] : snapshot.control[i];
    const down = y + 1 < snapshot.height ? snapshot.control[i + snapshot.width] : snapshot.control[i];
    const gx = right - left;
    const gy = down - up;
    const gl = Math.hypot(gx, gy);
    if (gl > 1e-5) return { x: gx / gl, y: gy / gl };

    const tx = fallback.x - point.x;
    const ty = fallback.y - point.y;
    const tl = Math.hypot(tx, ty) || 1;
    return { x: -ty / tl, y: tx / tl };
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
    const segments = this.frontSegments(snapshot);

    const drawSide = (side: 'blue' | 'red', dark: number) => {
      const sign = side === 'blue' ? 1 : -1; // control gradient points toward Blue.
      for (const { a, b } of segments) {
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

    for (const { a, b } of segments) {
      g.moveTo(a.x, a.y).lineTo(b.x, b.y);
      g.stroke({ color: INK, width: 0.28, alpha: 1 });
    }
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

  private smoothFlowPath(points: Point[], iterations = 2): Point[] {
    if (points.length < 3) return points;
    let smoothed = points;

    for (let iter = 0; iter < iterations; iter++) {
      const next: Point[] = [smoothed[0]];
      for (let i = 0; i < smoothed.length - 1; i++) {
        const a = smoothed[i];
        const b = smoothed[i + 1];
        next.push({
          x: a.x * 0.75 + b.x * 0.25,
          y: a.y * 0.75 + b.y * 0.25,
        });
        next.push({
          x: a.x * 0.25 + b.x * 0.75,
          y: a.y * 0.25 + b.y * 0.75,
        });
      }
      next.push(smoothed[smoothed.length - 1]);
      smoothed = next;
    }

    return smoothed;
  }

  private trimPathStart(points: Point[], distance: number): Point[] {
    if (points.length < 2 || distance <= 0) return points;

    let remaining = distance;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = Math.hypot(dx, dy);
      if (length <= 1e-6) continue;
      if (remaining > length) {
        remaining -= length;
        continue;
      }

      const t = remaining / length;
      return [
        { x: a.x + dx * t, y: a.y + dy * t },
        ...points.slice(i),
      ];
    }

    return [];
  }

  private drawArrowHead(g: Graphics, points: Point[], color: number, strength: number): void {
    if (points.length < 2) return;
    const tip = points[points.length - 1];
    const prev = points[Math.max(0, points.length - 4)];
    const angle = Math.atan2(tip.y - prev.y, tip.x - prev.x);
    const size = 1.05 + strength * 0.75;
    const left = angle + Math.PI * 0.82;
    const right = angle - Math.PI * 0.82;
    g.moveTo(tip.x, tip.y)
      .lineTo(tip.x + Math.cos(left) * size, tip.y + Math.sin(left) * size)
      .lineTo(tip.x + Math.cos(right) * size, tip.y + Math.sin(right) * size)
      .lineTo(tip.x, tip.y)
      .fill({ color, alpha: 0.38 + strength * 0.34 });
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
      const trace = this.traceFlow(snapshot, city, flowX, flowY, 0);
      const markerClearance = 1.75 + city.baseProduction * 0.18;
      const path = this.smoothFlowPath(this.trimPathStart(trace.points, markerClearance));
      if (path.length < 4) continue;

      const strength = Math.min(1, Math.sqrt(trace.averageMagnitude / 4.5));
      const underlayWidth = 0.16 + strength * 0.44;
      const routeWidth = 0.16 + strength * 0.62;
      const routeAlpha = 0.22 + strength * 0.68;
      const phaseSpeed = 0.35 + strength * 1.15;

      // Quiet route underlay.
      g.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i++) g.lineTo(path[i].x, path[i].y);
      g.stroke({ color, width: underlayWidth, alpha: 0.09 + strength * 0.18 });

      // Moving dashes make direction visible without filling the whole map with vectors.
      this.drawDashedPath(g, path, snapshot.gameTime * phaseSpeed);
      g.stroke({ color, width: routeWidth, alpha: routeAlpha });
      this.drawArrowHead(g, path, color, strength);
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
        const color = b > r ? BLUE_DARK : RED_DARK;
        const strength = Math.min(1, v);
        const size = 0.42 + strength * 0.92;
        const alpha = Math.min(0.62, 0.16 + v * 0.32);
        const width = 0.13 + strength * 0.13;
        g.moveTo(x - size, y - size).lineTo(x + size, y + size);
        g.moveTo(x - size, y + size).lineTo(x + size, y - size);
        g.stroke({ color, width, alpha });
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
