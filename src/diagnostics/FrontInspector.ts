import { CFG } from '../sim/Config';
import type { SimulationSnapshot } from '../sim/types';
import type { FrontRenderer, FrontSample } from '../rendering/FrontRenderer';
import type { FrontDebugInfo, Point } from './types';

export class FrontInspector {
  private selectedIndex: number | null = null;

  constructor(
    private readonly front: Pick<FrontRenderer, 'samples' | 'clearProbe'>,
    private readonly mapScale: () => number,
  ) {}

  get selectedFrontIndex(): number | null {
    return this.selectedIndex;
  }

  inspect(snapshot: SimulationSnapshot, point: Point): FrontDebugInfo | null {
    let best: FrontSample | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const sample of this.front.samples(snapshot)) {
      const distance = Math.hypot(point.x - sample.x, point.y - sample.y);
      if (distance < bestDistance) {
        best = sample;
        bestDistance = distance;
      }
    }

    if (!best || bestDistance > 4.5 * this.mapScale()) {
      this.selectedIndex = null;
      this.front.clearProbe();
      return null;
    }

    const i = best.sampleIndex;
    const radius = CFG.massRadius;
    this.selectedIndex = i;
    return {
      x: best.x,
      y: best.y,
      index: i,
      distance: bestDistance,
      radius,
      availableForceBlue: this.localSum(snapshot, snapshot.warBlue, best.x, best.y, radius),
      availableForceRed: this.localSum(snapshot, snapshot.warRed, best.x, best.y, radius),
      combatMassBlue: snapshot.frontMassBlue[i],
      combatMassRed: snapshot.frontMassRed[i],
      reinforcementBlue: this.localSum(snapshot, snapshot.incomingBlue, best.x, best.y, radius),
      reinforcementRed: this.localSum(snapshot, snapshot.incomingRed, best.x, best.y, radius),
      lossBlue: this.localSum(snapshot, snapshot.drainBlue, best.x, best.y, radius),
      lossRed: this.localSum(snapshot, snapshot.drainRed, best.x, best.y, radius),
      stressBlue: snapshot.stressBlue[i],
      stressRed: snapshot.stressRed[i],
      instabilityBlue: snapshot.instabilityBlue[i],
      instabilityRed: snapshot.instabilityRed[i],
      transportFlowBlue: this.localVectorMagnitudeAverage(snapshot, snapshot.flowBlueX, snapshot.flowBlueY, best.x, best.y, radius),
      transportFlowRed: this.localVectorMagnitudeAverage(snapshot, snapshot.flowRedX, snapshot.flowRedY, best.x, best.y, radius),
      rawFrontDrive: snapshot.rawForcing[i],
      frontDrive: snapshot.forcing[i],
      terrainDefense: this.localAverage(snapshot, snapshot.terrainDefense, best.x, best.y, radius),
      terrainMobility: this.localAverage(snapshot, snapshot.terrainMobility, best.x, best.y, radius),
    };
  }

  clear(): void {
    this.selectedIndex = null;
    this.front.clearProbe();
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
        const distance = Math.hypot(dx, dy);
        if (distance > radius) continue;
        cells.push({
          index: yy * snapshot.width + xx,
          weight: 1 - distance / (radius + 1),
        });
      }
    }
    return cells;
  }
}
