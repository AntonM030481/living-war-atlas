import { CFG, type Side } from './Config';
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
  constructor(private readonly fields: SimulationTopologyFields) {}

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
    if (x > 0 && !this.isBlocked(index - 1) && value * control[index - 1] <= 0) return true;
    if (x + 1 < width && !this.isBlocked(index + 1) && value * control[index + 1] <= 0) return true;
    if (y > 0 && !this.isBlocked(index - width) && value * control[index - width] <= 0) return true;
    if (y + 1 < height && !this.isBlocked(index + width) && value * control[index + width] <= 0) return true;
    return false;
  }

  edgeFactor(x: number, y: number, dx: number, dy: number): number {
    const { width, riverCrossingX, riverCrossingY } = this.fields;
    const index = y * width + x;
    if (dx === 1) return riverCrossingX[index];
    if (dx === -1) return riverCrossingX[index - 1];
    if (dy === 1) return riverCrossingY[index];
    if (dy === -1) return riverCrossingY[index - width];
    return 1;
  }
}
