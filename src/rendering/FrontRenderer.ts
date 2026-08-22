import { Graphics } from 'pixi.js';
import { CFG } from '../sim/Config';
import type { SimulationSnapshot } from '../sim/types';
import type { Point } from './coordinates';

const BLUE_DARK = 0x164f91;
const RED_DARK = 0xb12620;
const INK = 0x2f2b24;
const PAPER_LIGHT = 0xf6efd7;

export interface FrontSample extends Point {
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

export class FrontRenderer {
  constructor(
    readonly graphics: Graphics,
    private readonly probe: Graphics,
  ) {}

  draw(snapshot: SimulationSnapshot): void {
    const g = this.graphics;
    g.clear();
    const segments = this.frontSegments(snapshot);

    const drawSide = (side: 'blue' | 'red', dark: number) => {
      const sign = side === 'blue' ? 1 : -1;
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

  samples(snapshot: SimulationSnapshot): FrontSample[] {
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

  drawProbe(snapshot: SimulationSnapshot, selectedFrontIndex: number | null): void {
    const g = this.probe;
    g.clear();
    if (selectedFrontIndex === null) return;
    const x = selectedFrontIndex % snapshot.width;
    const y = Math.floor(selectedFrontIndex / snapshot.width);
    g.circle(x, y, 1.7).stroke({ color: INK, width: 0.22, alpha: 1 });
    g.circle(x, y, 1.15).stroke({ color: PAPER_LIGHT, width: 0.24, alpha: 0.95 });
    g.moveTo(x - 2.1, y).lineTo(x + 2.1, y);
    g.moveTo(x, y - 2.1).lineTo(x, y + 2.1);
    g.stroke({ color: INK, width: 0.10, alpha: 0.88 });
  }

  clearProbe(): void {
    this.probe.clear();
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
    return { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t };
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
}
