import { Graphics } from 'pixi.js';
import type { SimulationSnapshot } from '../sim/types';

export interface FrontSegmentPoint {
  x: number;
  y: number;
}

export class FrontRenderer {
  constructor(readonly graphics: Graphics) {}

  clear(): void {
    this.graphics.clear();
  }

  drawPolyline(points: readonly FrontSegmentPoint[], width: number, color: number): void {
    if (points.length < 2) return;
    const g = this.graphics;
    g.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
    g.stroke({ width, color, cap: 'round', join: 'round' });
  }

  static averageMass(snapshot: SimulationSnapshot, index: number): number {
    return (snapshot.frontMassBlue[index] + snapshot.frontMassRed[index]) * 0.5;
  }
}
