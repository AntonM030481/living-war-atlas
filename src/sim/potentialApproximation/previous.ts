import type { PotentialApproximationStrategy } from './types';
import {
  edgeTransmission,
  TRANSPORT_EPS as EPS,
} from '../transportGrid';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
const POTENTIAL_REPAIR_RADIUS = 8;

function repairPotentialTransitions(
  potential: Float32Array,
  currentStatus: Uint8Array,
  previousStatus: Uint8Array,
  grid: Parameters<PotentialApproximationStrategy>[1],
  reaction: number,
): void {
  const pending = new Uint8Array(potential.length);
  const valid = new Uint8Array(potential.length);
  const invalidate = new Uint8Array(potential.length);

  for (let i = 0; i < potential.length; i++) {
    if (currentStatus[i] === previousStatus[i]) continue;
    const cx = i % grid.width;
    const cy = Math.floor(i / grid.width);
    for (let dy = -POTENTIAL_REPAIR_RADIUS; dy <= POTENTIAL_REPAIR_RADIUS; dy++) {
      const y = cy + dy;
      if (y < 0 || y >= grid.height) continue;
      for (let dx = -POTENTIAL_REPAIR_RADIUS; dx <= POTENTIAL_REPAIR_RADIUS; dx++) {
        const x = cx + dx;
        if (x < 0 || x >= grid.width) continue;
        const j = y * grid.width + x;
        if (currentStatus[j] === 1) invalidate[j] = 1;
      }
    }
  }

  for (let i = 0; i < potential.length; i++) {
    if (currentStatus[i] === 0) {
      potential[i] = 0;
      continue;
    }
    if (currentStatus[i] === 2 || !invalidate[i]) {
      valid[i] = 1;
      continue;
    }
    pending[i] = 1;
    potential[i] = 0;
  }

  const queue = new Int32Array(potential.length);
  let head = 0;
  let tail = 0;

  const repairedValue = (i: number): number | null => {
    const x = i % grid.width;
    const y = Math.floor(i / grid.width);
    let weightedPotential = 0;
    let transmissionSum = 0;

    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= grid.width || ny < 0 || ny >= grid.height) continue;
      const j = ny * grid.width + nx;
      if (!valid[j]) continue;
      const transmission = edgeTransmission(i, j, x, y, dx, dy, grid);
      if (transmission <= EPS) continue;
      weightedPotential += potential[j] * transmission;
      transmissionSum += transmission;
    }

    return transmissionSum > EPS
      ? weightedPotential / (transmissionSum + reaction)
      : null;
  };

  const seeds: number[] = [];
  for (let i = 0; i < potential.length; i++) {
    if (!pending[i]) continue;
    const value = repairedValue(i);
    if (value === null) continue;
    seeds.push(i, value);
  }
  for (let k = 0; k < seeds.length; k += 2) {
    const i = seeds[k];
    potential[i] = seeds[k + 1];
    pending[i] = 0;
    valid[i] = 1;
    queue[tail++] = i;
  }

  while (head < tail) {
    const source = queue[head++];
    const sx = source % grid.width;
    const sy = Math.floor(source / grid.width);
    for (const [dx, dy] of DIRS) {
      const nx = sx + dx;
      const ny = sy + dy;
      if (nx < 0 || nx >= grid.width || ny < 0 || ny >= grid.height) continue;
      const i = ny * grid.width + nx;
      if (!pending[i]) continue;
      const value = repairedValue(i);
      if (value === null) continue;
      potential[i] = value;
      pending[i] = 0;
      valid[i] = 1;
      queue[tail++] = i;
    }
  }
}

export const buildPreviousApproximation: PotentialApproximationStrategy = (
  potential,
  grid,
  config,
  context,
) => {
  if (
    config.potentialRepairEnabled !== false &&
    context.previousStatus &&
    context.previousStatus.length === context.currentStatus.length
  ) {
    repairPotentialTransitions(
      potential,
      context.currentStatus,
      context.previousStatus,
      grid,
      context.reaction,
    );
  }
};
