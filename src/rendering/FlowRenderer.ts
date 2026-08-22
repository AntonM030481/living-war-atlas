import { Graphics } from 'pixi.js';
import type { City, SimulationSnapshot } from '../sim/types';
import type { Point } from './coordinates';

const BLUE_DARK = 0x164f91;
const RED_DARK = 0xb12620;

interface FlowTrace {
  points: Point[];
  averageMagnitude: number;
  maxMagnitude: number;
}

export class FlowRenderer {
  constructor(readonly graphics: Graphics) {}

  clear(): void {
    this.graphics.clear();
  }

  draw(snapshot: SimulationSnapshot): void {
    const g = this.graphics;
    g.clear();

    for (const city of snapshot.cities) {
      if (city.enabled === false || city.integration < 0.08) continue;
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

      g.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i++) g.lineTo(path[i].x, path[i].y);
      g.stroke({ color, width: underlayWidth, alpha: 0.09 + strength * 0.18 });

      this.drawDashedPath(g, path, snapshot.gameTime * phaseSpeed);
      g.stroke({ color, width: routeWidth, alpha: routeAlpha });
      this.drawArrowHead(g, path, color, strength);
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
        x += (city.owner === 'blue' ? 1 : -1) * 0.42;
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
        next.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
        next.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
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
      return [{ x: a.x + dx * t, y: a.y + dy * t }, ...points.slice(i)];
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
}
