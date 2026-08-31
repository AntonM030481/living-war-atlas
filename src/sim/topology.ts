import { CFG, type Side } from './Config';
import { RegionTopology } from './regions';
import { sideAccess as controlSideAccess } from './transport';

export interface SimulationTopologyFields {
  width: number;
  height: number;
  control: Float32Array;
  blocked: Uint8Array;
  riverCrossingX: Float32Array;
  riverCrossingY: Float32Array;
}

export class SimulationTopology {
  constructor(
    private readonly fields: SimulationTopologyFields,
    private readonly regions?: RegionTopology,
  ) {}

  isBlocked(index: number): boolean {
    return this.fields.blocked[index] !== 0;
  }

  sideAccess(side: Side, index: number): number {
    if (this.isBlocked(index)) return 0;
    return controlSideAccess(side, this.fields.control[index]);
  }

  isFront(index: number): boolean {
    if (this.isBlocked(index)) return false;

    const { width, height, control } = this.fields;
    const value = control[index];
    const x = index % width;
    const y = Math.floor(index / width);

    if (Math.abs(value) <= CFG.frontBand) return true;
    if (x > 0 && !this.isBlocked(index - 1) && this.edgeFactor(x, y, -1, 0) > 0 && value * control[index - 1] <= 0) return true;
    if (x + 1 < width && !this.isBlocked(index + 1) && this.edgeFactor(x, y, 1, 0) > 0 && value * control[index + 1] <= 0) return true;
    if (y > 0 && !this.isBlocked(index - width) && this.edgeFactor(x, y, 0, -1) > 0 && value * control[index - width] <= 0) return true;
    if (y + 1 < height && !this.isBlocked(index + width) && this.edgeFactor(x, y, 0, 1) > 0 && value * control[index + width] <= 0) return true;
    return false;
  }

  potentialDemand(index: number): number {
    return !this.isBlocked(index) && this.regions?.isPotentialFront(index)
      ? CFG.potentialFrontDemand
      : 0;
  }

  edgeFactor(x: number, y: number, dx: number, dy: number): number {
    const { width, riverCrossingX, riverCrossingY } = this.fields;
    const index = y * width + x;
    let terrainFactor = 1;
    if (dx === 1) terrainFactor = riverCrossingX[index];
    else if (dx === -1) terrainFactor = riverCrossingX[index - 1];
    else if (dy === 1) terrainFactor = riverCrossingY[index];
    else if (dy === -1) terrainFactor = riverCrossingY[index - width];
    if (terrainFactor <= 0) return 0;

    if (!this.regions) return terrainFactor;
    const neighbor = (y + dy) * width + (x + dx);
    return terrainFactor * this.regions.edgeFactor(index, neighbor);
  }
}
