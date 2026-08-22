import type { SimulationSnapshot } from '../sim/types';
import type { FrontRenderer } from '../rendering/FrontRenderer';
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
    let best = null as ReturnType<FrontRenderer['samples']>[number] | null;
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
    const radius = Math.round(5 * this.mapScale());
    this.selectedIndex = i;
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
