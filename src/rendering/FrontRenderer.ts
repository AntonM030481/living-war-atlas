import { Graphics } from 'pixi.js';
import { CFG } from '../sim/Config';
import type { SimulationSnapshot } from '../sim/types';
import type { Point } from './coordinates';

const BLUE_DARK = 0x164f91;
const RED_DARK = 0xb12620;
const INK = 0x2f2b24;

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
        g.stroke({ color: dark, width: Math.max(0.14, width * 0.30), alpha: 1 });
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
    const x = selectedFrontIndex % snapshot.width + 0.5;
    const y = Math.floor(selectedFrontIndex / snapshot.width) + 0.5;
    const radius = CFG.massRadius;
    g.circle(x, y, radius).stroke({ color: INK, width: 0.18, alpha: 0.9 });
    g.moveTo(x - 0.8, y).lineTo(x + 0.8, y);
    g.moveTo(x, y - 0.8).lineTo(x, y + 0.8);
    g.stroke({ color: INK, width: 0.12, alpha: 0.9 });
  }

  clearProbe(): void {
    this.probe.clear();
  }

  private frontSegments(snapshot: SimulationSnapshot): FrontSegment[] {
    const segments: FrontSegment[] = [];
    const { width, height, control } = snapshot;

    for (let y = 0; y < height - 1; y++) {
      for (let x = 0; x < width - 1; x++) {
        const tlIndex = y * width + x;
        const trIndex = tlIndex + 1;
        const blIndex = (y + 1) * width + x;
        const brIndex = blIndex + 1;
        if (
          this.isBlocked(snapshot, tlIndex) ||
          this.isBlocked(snapshot, trIndex) ||
          this.isBlocked(snapshot, blIndex) ||
          this.isBlocked(snapshot, brIndex)
        ) continue;

        const tl = control[tlIndex];
        const tr = control[trIndex];
        const br = control[brIndex];
        const bl = control[blIndex];
        const crossings: Point[] = [];
        const left = x + 0.5;
        const top = y + 0.5;
        const right = x + 1.5;
        const bottom = y + 1.5;

        if (this.crossesZero(tl, tr)) crossings.push(this.edgeCrossing(left, top, right, top, tl, tr));
        if (this.crossesZero(tr, br)) crossings.push(this.edgeCrossing(right, top, right, bottom, tr, br));
        if (this.crossesZero(br, bl)) crossings.push(this.edgeCrossing(right, bottom, left, bottom, br, bl));
        if (this.crossesZero(bl, tl)) crossings.push(this.edgeCrossing(left, bottom, left, top, bl, tl));

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

  private isBlocked(snapshot: SimulationSnapshot, index: number): boolean {
    return snapshot.terrainBlocked?.[index] !== undefined && snapshot.terrainBlocked[index] !== 0;
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
    const x = Math.max(0, Math.min(snapshot.width - 1, Math.floor(point.x)));
    const y = Math.max(0, Math.min(snapshot.height - 1, Math.floor(point.y)));
    const i = y * snapshot.width + x;
    const control = snapshot.control[i];
    const leftIndex = i - 1;
    const rightIndex = i + 1;
    const upIndex = i - snapshot.width;
    const downIndex = i + snapshot.width;
    const left = x > 0 && !this.isBlocked(snapshot, leftIndex) ? snapshot.control[leftIndex] : control;
    const right = x + 1 < snapshot.width && !this.isBlocked(snapshot, rightIndex) ? snapshot.control[rightIndex] : control;
    const up = y > 0 && !this.isBlocked(snapshot, upIndex) ? snapshot.control[upIndex] : control;
    const down = y + 1 < snapshot.height && !this.isBlocked(snapshot, downIndex) ? snapshot.control[downIndex] : control;
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
    const ix = Math.max(0, Math.min(snapshot.width - 1, Math.floor(x)));
    const iy = Math.max(0, Math.min(snapshot.height - 1, Math.floor(y)));
    return iy * snapshot.width + ix;
  }

  private frontSideWidth(mass: number): number {
    const strength = Math.max(0, Math.min(1, mass / 0.7));
    return 0.24 + strength * 2.30;
  }
}
