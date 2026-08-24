import { Graphics } from 'pixi.js';
import type { SimulationSnapshot } from '../sim/types';

const BLUE_DARK = 0x164f91;
const RED_DARK = 0xb12620;
const CONTOUR_LEVELS = 10;
const MIN_LEVEL_FRACTION = 0.08;
const GRADIENT_STRIDE = 4;
const GRADIENT_ARROW_LENGTH = 2.2;
const GRADIENT_ARROW_HEAD = 0.55;
const GRADIENT_MIN_MAGNITUDE = 1e-4;

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
    this.graphics.clear();
    this.drawSide(snapshot, snapshot.potentialBlue, BLUE_DARK);
    this.drawSide(snapshot, snapshot.potentialRed, RED_DARK);
  }

  private drawSide(
    snapshot: SimulationSnapshot,
    potential: Float32Array,
    color: number,
  ): void {
    const g = this.graphics;
    let maxPotential = 0;
    for (let i = 0; i < potential.length; i++) {
      const value = potential[i];
      if (Number.isFinite(value)) maxPotential = Math.max(maxPotential, value);
    }
    if (maxPotential <= 1e-6) return;

    const firstLevel = maxPotential * MIN_LEVEL_FRACTION;
    const levelStep = (maxPotential - firstLevel) / CONTOUR_LEVELS;
    if (levelStep <= 1e-6) return;

    for (let levelIndex = 0; levelIndex < CONTOUR_LEVELS; levelIndex++) {
      const level = firstLevel + levelStep * (levelIndex + 0.5);
      let segmentCount = 0;

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

          if (![v00, v10, v11, v01].every(Number.isFinite)) continue;

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
            segmentCount += 1;
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
            segmentCount += 2;
          }
        }
      }

      if (segmentCount > 0) {
        const relative = (levelIndex + 1) / CONTOUR_LEVELS;
        g.stroke({ color, width: 0.14 + relative * 0.08, alpha: 0.30 + relative * 0.24 });
      }
    }

    this.drawGradientArrows(snapshot, potential, maxPotential, color);
  }

  private drawGradientArrows(
    snapshot: SimulationSnapshot,
    potential: Float32Array,
    maxPotential: number,
    color: number,
  ): void {
    const g = this.graphics;
    let arrowCount = 0;

    for (let y = GRADIENT_STRIDE; y < snapshot.height - GRADIENT_STRIDE; y += GRADIENT_STRIDE) {
      for (let x = GRADIENT_STRIDE; x < snapshot.width - GRADIENT_STRIDE; x += GRADIENT_STRIDE) {
        const i = y * snapshot.width + x;
        const center = potential[i];
        if (!Number.isFinite(center) || center <= maxPotential * 0.01) continue;

        const left = potential[i - 1];
        const right = potential[i + 1];
        const up = potential[i - snapshot.width];
        const down = potential[i + snapshot.width];
        if (![left, right, up, down].every(Number.isFinite)) continue;

        const gradientX = (right - left) * 0.5;
        const gradientY = (down - up) * 0.5;
        const magnitude = Math.hypot(gradientX, gradientY);
        if (magnitude <= GRADIENT_MIN_MAGNITUDE) continue;

        const directionX = gradientX / magnitude;
        const directionY = gradientY / magnitude;
        const halfLength = GRADIENT_ARROW_LENGTH * 0.5;
        const startX = x - directionX * halfLength;
        const startY = y - directionY * halfLength;
        const tipX = x + directionX * halfLength;
        const tipY = y + directionY * halfLength;

        g.moveTo(startX, startY).lineTo(tipX, tipY);

        const angle = Math.atan2(directionY, directionX);
        const leftAngle = angle + Math.PI * 0.82;
        const rightAngle = angle - Math.PI * 0.82;
        g.moveTo(tipX, tipY)
          .lineTo(
            tipX + Math.cos(leftAngle) * GRADIENT_ARROW_HEAD,
            tipY + Math.sin(leftAngle) * GRADIENT_ARROW_HEAD,
          );
        g.moveTo(tipX, tipY)
          .lineTo(
            tipX + Math.cos(rightAngle) * GRADIENT_ARROW_HEAD,
            tipY + Math.sin(rightAngle) * GRADIENT_ARROW_HEAD,
          );
        arrowCount += 1;
      }
    }

    if (arrowCount > 0) g.stroke({ color, width: 0.22, alpha: 0.62 });
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
    if (!Number.isFinite(v0) || !Number.isFinite(v1)) return;
    const delta = v1 - v0;
    if (Math.abs(delta) <= 1e-8) return;

    const d0 = v0 - level;
    const d1 = v1 - level;
    if ((d0 < 0 && d1 < 0) || (d0 > 0 && d1 > 0)) return;

    const t = (level - v0) / delta;
    if (!Number.isFinite(t) || t < 0 || t > 1) return;
    points.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t });
  }
}
