import { Graphics } from 'pixi.js';
import type { SimulationSnapshot } from '../sim/types';

const BLUE_DARK = 0x164f91;
const RED_DARK = 0xb12620;
const CONTOUR_LEVELS = 10;
const MIN_LEVEL_FRACTION = 0.08;

interface Point {
  x: number;
  y: number;
}

export class PotentialContourRenderer {
  constructor(readonly graphics: Graphics) {}

  clear(): void {
    this.graphics.clear();
  }

  draw(snapshot: SimulationSnapshot): void {
    const g = this.graphics;
    g.clear();
    this.drawSide(snapshot, snapshot.potentialBlue, BLUE_DARK);
    this.drawSide(snapshot, snapshot.potentialRed, RED_DARK);
  }

  private drawSide(
    snapshot: SimulationSnapshot,
    potential: Float32Array,
    color: number,
  ): void {
    let maxPotential = 0;
    for (let i = 0; i < potential.length; i++) {
      if (Number.isFinite(potential[i])) maxPotential = Math.max(maxPotential, potential[i]);
    }
    if (maxPotential <= 1e-6) return;

    const firstLevel = maxPotential * MIN_LEVEL_FRACTION;
    const levelStep = (maxPotential - firstLevel) / CONTOUR_LEVELS;
    if (levelStep <= 1e-6) return;

    for (let levelIndex = 0; levelIndex < CONTOUR_LEVELS; levelIndex++) {
      const level = firstLevel + levelStep * (levelIndex + 0.5);
      for (let y = 0; y < snapshot.height - 1; y++) {
        for (let x = 0; x < snapshot.width - 1; x++) {
          const i00 = y * snapshot.width + x;
          const i10 = i00 + 1;
          const i01 = i00 + snapshot.width;
          const i11 = i01 + 1;
          const v00 = potential[i00];
          const v10 = potential[i10];
          const v11 = potential[i11];
          const v01 = potential[i01];
          const minValue = Math.min(v00, v10, v11, v01);
          const maxValue = Math.max(v00, v10, v11, v01);
          if (level < minValue || level > maxValue || maxValue - minValue <= 1e-8) continue;

          const crossings: Point[] = [];
          this.addCrossing(crossings, x, y, v00, x + 1, y, v10, level);
          this.addCrossing(crossings, x + 1, y, v10, x + 1, y + 1, v11, level);
          this.addCrossing(crossings, x + 1, y + 1, v11, x, y + 1, v01, level);
          this.addCrossing(crossings, x, y + 1, v01, x, y, v00, level);

          if (crossings.length === 2) {
            g.moveTo(crossings[0].x, crossings[0].y)
              .lineTo(crossings[1].x, crossings[1].y);
          } else if (crossings.length === 4) {
            const center = (v00 + v10 + v11 + v01) * 0.25;
            if (center >= level) {
              g.moveTo(crossings[0].x, crossings[0].y)
                .lineTo(crossings[1].x, crossings[1].y);
              g.moveTo(crossings[2].x, crossings[2].y)
                .lineTo(crossings[3].x, crossings[3].y);
            } else {
              g.moveTo(crossings[0].x, crossings[0].y)
                .lineTo(crossings[3].x, crossings[3].y);
              g.moveTo(crossings[1].x, crossings[1].y)
                .lineTo(crossings[2].x, crossings[2].y);
            }
          }
        }
      }
      const relative = (levelIndex + 1) / CONTOUR_LEVELS;
      g.stroke({ color, width: 0.10 + relative * 0.06, alpha: 0.22 + relative * 0.18 });
    }
  }

  private addCrossing(
    points: Point[],
    x0: number,
    y0: number,
    v0: number,
    x1: number,
    y1: number,
    v1: number,
    level: number,
  ): void {
    const d0 = v0 - level;
    const d1 = v1 - level;
    if ((d0 < 0 && d1 < 0) || (d0 > 0 && d1 > 0) || Math.abs(v1 - v0) <= 1e-8) return;
    if (d0 === 0 && d1 === 0) return;
    const t = Math.max(0, Math.min(1, (level - v0) / (v1 - v0)));
    points.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t });
  }
}
