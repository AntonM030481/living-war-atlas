import type { MapPoint } from './types';

export interface RiverRaster {
  strength: Float32Array;
  crossingX: Float32Array;
  crossingY: Float32Array;
}

const WIDTH = 1.15;
const CROSSING = 0.26;

function pointSegmentDistance(px: number, py: number, a: MapPoint, b: MapPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length2 = dx * dx + dy * dy;
  if (length2 <= 1e-9) return Math.hypot(px - a.x, py - a.y);
  const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / length2));
  return Math.hypot(px - (a.x + dx * t), py - (a.y + dy * t));
}

function orientation(a: MapPoint, b: MapPoint, c: MapPoint): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function intersects(a: MapPoint, b: MapPoint, c: MapPoint, d: MapPoint): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  return o1 * o2 <= 0 && o3 * o4 <= 0;
}

export function rasterizeRivers(width: number, height: number, rivers: MapPoint[][]): RiverRaster {
  const size = width * height;
  const strength = new Float32Array(size);
  const crossingX = new Float32Array(size);
  const crossingY = new Float32Array(size);
  crossingX.fill(1);
  crossingY.fill(1);

  for (const path of rivers) {
    for (let p = 0; p + 1 < path.length; p++) {
      const a = path[p];
      const b = path[p + 1];
      const minX = Math.max(0, Math.floor(Math.min(a.x, b.x) - WIDTH));
      const maxX = Math.min(width - 1, Math.ceil(Math.max(a.x, b.x) + WIDTH));
      const minY = Math.max(0, Math.floor(Math.min(a.y, b.y) - WIDTH));
      const maxY = Math.min(height - 1, Math.ceil(Math.max(a.y, b.y) + WIDTH));

      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const i = y * width + x;
          const distance = pointSegmentDistance(x, y, a, b);
          if (distance < WIDTH) strength[i] = Math.max(strength[i], 1 - distance / WIDTH);

          if (x + 1 < width && intersects(a, b, { x, y }, { x: x + 1, y })) {
            crossingX[i] = Math.min(crossingX[i], CROSSING);
          }
          if (y + 1 < height && intersects(a, b, { x, y }, { x, y: y + 1 })) {
            crossingY[i] = Math.min(crossingY[i], CROSSING);
          }
        }
      }
    }
  }

  return { strength, crossingX, crossingY };
}
