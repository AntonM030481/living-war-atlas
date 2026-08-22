import { Graphics } from 'pixi.js';

export interface FlowVector {
  x: number;
  y: number;
  dx: number;
  dy: number;
  magnitude: number;
}

export class FlowRenderer {
  constructor(readonly graphics: Graphics) {}

  clear(): void {
    this.graphics.clear();
  }

  drawVectors(vectors: readonly FlowVector[], color: number, scale = 1): void {
    const g = this.graphics;
    for (const vector of vectors) {
      if (vector.magnitude <= 0) continue;
      const length = Math.min(4, vector.magnitude * scale);
      const norm = Math.hypot(vector.dx, vector.dy) || 1;
      const ex = vector.x + vector.dx / norm * length;
      const ey = vector.y + vector.dy / norm * length;
      g.moveTo(vector.x, vector.y).lineTo(ex, ey);
    }
    g.stroke({ width: 0.45, color, alpha: 0.7 });
  }
}
