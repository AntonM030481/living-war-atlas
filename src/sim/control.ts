import { CFG } from './Config';
import { clamp } from './combat';

const EPS = 1e-6;

export interface ControlGrid {
  width: number;
  height: number;
  terrainMobility: Float32Array;
  isBlocked: (index: number) => boolean;
  edgeFactor: (x: number, y: number, dx: number, dy: number) => number;
}

export function updateControlField(
  control: Float32Array,
  nextControl: Float32Array,
  forcingField: Float32Array,
  grid: ControlGrid,
): void {
  const { width, height, terrainMobility, isBlocked, edgeFactor } = grid;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const value = control[i];
      if (isBlocked(i)) {
        nextControl[i] = value;
        continue;
      }

      const leftIndex = i - 1;
      const rightIndex = i + 1;
      const upIndex = i - width;
      const downIndex = i + width;
      const hasLeft = x > 0 && !isBlocked(leftIndex);
      const hasRight = x + 1 < width && !isBlocked(rightIndex);
      const hasUp = y > 0 && !isBlocked(upIndex);
      const hasDown = y + 1 < height && !isBlocked(downIndex);
      const wl = hasLeft ? edgeFactor(x, y, -1, 0) : 0;
      const wr = hasRight ? edgeFactor(x, y, 1, 0) : 0;
      const wu = hasUp ? edgeFactor(x, y, 0, -1) : 0;
      const wd = hasDown ? edgeFactor(x, y, 0, 1) : 0;
      const left = hasLeft ? control[leftIndex] : value;
      const right = hasRight ? control[rightIndex] : value;
      const up = hasUp ? control[upIndex] : value;
      const down = hasDown ? control[downIndex] : value;
      const weightSum = wl + wr + wu + wd + EPS;
      const lap = (wl * left + wr * right + wu * up + wd * down) - weightSum * value;
      const interfaceWeight = Math.max(0, 1 - value * value);
      const mobility = terrainMobility[i];
      const smoothing = CFG.controlSmooth * lap * mobility;
      const restoring = CFG.controlRestore * value * interfaceWeight;
      const forcing = CFG.controlForce * forcingField[i] * interfaceWeight * mobility;
      nextControl[i] = clamp(
        value + (smoothing + restoring + forcing) * CFG.dt,
        -CFG.controlClamp,
        CFG.controlClamp,
      );
    }
  }

  control.set(nextControl);
}
