import type { FinePotentialContext } from './potential';
import {
  edgeTransmission,
  TRANSPORT_EPS as EPS,
  type TransportConfig,
  type TransportGrid,
} from './transportGrid';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
const DEFAULT_COARSE_SCALE = 2;
const DEFAULT_COARSE_RELAXATION_PASSES = 24;
const POTENTIAL_RELAXATION_TOLERANCE = 1e-5;
const POTENTIAL_REPAIR_RADIUS = 8;

function reactionForDecay(decay: number): number {
  const safeDecay = Math.max(EPS, Math.min(0.999999, decay));
  return safeDecay + 1 / safeDecay - 2;
}

function repairPotentialTransitions(
  potential: Float32Array,
  currentStatus: Uint8Array,
  previousStatus: Uint8Array,
  grid: TransportGrid,
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

function buildPreviousApproximation(
  potential: Float32Array,
  grid: TransportGrid,
  config: TransportConfig,
  context: FinePotentialContext,
): void {
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
}

interface CoarseGrid {
  width: number;
  height: number;
  scale: number;
  status: Uint8Array;
  boundaryPotential: Float32Array;
  rightTransmission: Float32Array;
  downTransmission: Float32Array;
}

function fineBoundaryTransmission(
  cx: number,
  cy: number,
  dx: number,
  dy: number,
  coarseWidth: number,
  coarseHeight: number,
  scale: number,
  grid: TransportGrid,
): number {
  if (cx < 0 || cx >= coarseWidth || cy < 0 || cy >= coarseHeight) return 0;
  const x0 = cx * scale;
  const x1 = Math.min(grid.width, (cx + 1) * scale);
  const y0 = cy * scale;
  const y1 = Math.min(grid.height, (cy + 1) * scale);
  let sum = 0;
  let count = 0;

  if (dx === 1) {
    const x = x1 - 1;
    if (x + 1 >= grid.width) return 0;
    for (let y = y0; y < y1; y++) {
      const i = y * grid.width + x;
      sum += edgeTransmission(i, i + 1, x, y, 1, 0, grid);
      count++;
    }
  } else if (dy === 1) {
    const y = y1 - 1;
    if (y + 1 >= grid.height) return 0;
    for (let x = x0; x < x1; x++) {
      const i = y * grid.width + x;
      sum += edgeTransmission(i, i + grid.width, x, y, 0, 1, grid);
      count++;
    }
  }

  return count > 0 ? sum / count : 0;
}

function buildCoarseGrid(
  grid: TransportGrid,
  context: FinePotentialContext,
  scale: number,
): CoarseGrid {
  const width = Math.ceil(grid.width / scale);
  const height = Math.ceil(grid.height / scale);
  const status = new Uint8Array(width * height);
  const boundaryPotential = new Float32Array(width * height);
  const rightTransmission = new Float32Array(width * height);
  const downTransmission = new Float32Array(width * height);

  for (let cy = 0; cy < height; cy++) {
    for (let cx = 0; cx < width; cx++) {
      const ci = cy * width + cx;
      let traversable = 0;
      let frontCount = 0;
      let frontPotentialSum = 0;
      const xEnd = Math.min(grid.width, (cx + 1) * scale);
      const yEnd = Math.min(grid.height, (cy + 1) * scale);

      for (let y = cy * scale; y < yEnd; y++) {
        for (let x = cx * scale; x < xEnd; x++) {
          const i = y * grid.width + x;
          if (context.currentStatus[i] === 0) continue;
          traversable++;
          if (context.currentStatus[i] === 2) {
            frontCount++;
            frontPotentialSum += 1 + context.smoothedNeed[i];
          }
        }
      }

      if (traversable === 0) continue;
      if (frontCount > 0) {
        status[ci] = 2;
        boundaryPotential[ci] = frontPotentialSum / frontCount;
      } else {
        status[ci] = 1;
      }
    }
  }

  for (let cy = 0; cy < height; cy++) {
    for (let cx = 0; cx < width; cx++) {
      const ci = cy * width + cx;
      if (status[ci] === 0) continue;
      if (cx + 1 < width && status[ci + 1] !== 0) {
        rightTransmission[ci] = fineBoundaryTransmission(
          cx, cy, 1, 0, width, height, scale, grid,
        );
      }
      if (cy + 1 < height && status[ci + width] !== 0) {
        downTransmission[ci] = fineBoundaryTransmission(
          cx, cy, 0, 1, width, height, scale, grid,
        );
      }
    }
  }

  return {
    width,
    height,
    scale,
    status,
    boundaryPotential,
    rightTransmission,
    downTransmission,
  };
}

function coarseEdgeTransmission(
  x: number,
  y: number,
  dx: number,
  dy: number,
  coarse: CoarseGrid,
): number {
  const i = y * coarse.width + x;
  if (dx === 1) return coarse.rightTransmission[i];
  if (dx === -1) return x > 0 ? coarse.rightTransmission[i - 1] : 0;
  if (dy === 1) return coarse.downTransmission[i];
  if (dy === -1) return y > 0 ? coarse.downTransmission[i - coarse.width] : 0;
  return 0;
}

function solveCoarsePotential(
  coarse: CoarseGrid,
  decay: number,
  passes: number,
): Float32Array {
  const potential = new Float32Array(coarse.width * coarse.height);
  const coarseDecay = Math.pow(Math.max(EPS, Math.min(0.999999, decay)), coarse.scale);
  const reaction = reactionForDecay(coarseDecay);
  let maxFrontPotential = 0;

  for (let i = 0; i < potential.length; i++) {
    if (coarse.status[i] !== 2) continue;
    potential[i] = coarse.boundaryPotential[i];
    maxFrontPotential = Math.max(maxFrontPotential, potential[i]);
  }
  if (maxFrontPotential <= EPS) return potential;

  for (let pass = 0; pass < passes; pass++) {
    const reverse = (pass & 1) === 1;
    let maxDelta = 0;
    for (let step = 0; step < potential.length; step++) {
      const i = reverse ? potential.length - 1 - step : step;
      if (coarse.status[i] === 2) {
        potential[i] = coarse.boundaryPotential[i];
        continue;
      }
      if (coarse.status[i] === 0) {
        potential[i] = 0;
        continue;
      }

      const x = i % coarse.width;
      const y = Math.floor(i / coarse.width);
      let weightedPotential = 0;
      let transmissionSum = 0;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= coarse.width || ny < 0 || ny >= coarse.height) continue;
        const j = ny * coarse.width + nx;
        if (coarse.status[j] === 0) continue;
        const transmission = coarseEdgeTransmission(x, y, dx, dy, coarse);
        if (transmission <= EPS) continue;
        weightedPotential += potential[j] * transmission;
        transmissionSum += transmission;
      }

      const target = transmissionSum > EPS
        ? weightedPotential / (transmissionSum + reaction)
        : 0;
      const before = potential[i];
      potential[i] = Math.max(0, Math.min(maxFrontPotential, target));
      maxDelta = Math.max(maxDelta, Math.abs(potential[i] - before));
    }
    if (maxDelta < POTENTIAL_RELAXATION_TOLERANCE) break;
  }
  return potential;
}

function coarseSample(
  potential: Float32Array,
  coarse: CoarseGrid,
  fineX: number,
  fineY: number,
): number {
  const gx = Math.max(0, Math.min(coarse.width - 1, (fineX + 0.5) / coarse.scale - 0.5));
  const gy = Math.max(0, Math.min(coarse.height - 1, (fineY + 0.5) / coarse.scale - 0.5));
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const x1 = Math.min(coarse.width - 1, x0 + 1);
  const y1 = Math.min(coarse.height - 1, y0 + 1);
  const tx = gx - x0;
  const ty = gy - y0;
  const p00 = potential[y0 * coarse.width + x0];
  const p10 = potential[y0 * coarse.width + x1];
  const p01 = potential[y1 * coarse.width + x0];
  const p11 = potential[y1 * coarse.width + x1];
  const top = p00 + (p10 - p00) * tx;
  const bottom = p01 + (p11 - p01) * tx;
  return top + (bottom - top) * ty;
}

function buildCoarseApproximation(
  potential: Float32Array,
  grid: TransportGrid,
  config: TransportConfig,
  context: FinePotentialContext,
): void {
  const scale = Math.max(2, Math.round(config.potentialCoarseScale ?? DEFAULT_COARSE_SCALE));
  const passes = Math.max(1, Math.round(
    config.potentialCoarsePasses ?? DEFAULT_COARSE_RELAXATION_PASSES,
  ));
  const coarse = buildCoarseGrid(grid, context, scale);
  const coarsePotential = solveCoarsePotential(coarse, config.potentialDecay, passes);

  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const i = y * grid.width + x;
      if (context.currentStatus[i] === 0) {
        potential[i] = 0;
      } else if (context.currentStatus[i] === 2) {
        potential[i] = 1 + context.smoothedNeed[i];
      } else {
        potential[i] = Math.max(
          0,
          Math.min(context.maxFrontPotential, coarseSample(coarsePotential, coarse, x, y)),
        );
      }
    }
  }
}

export function applyApproximatePotential(
  potential: Float32Array,
  grid: TransportGrid,
  config: TransportConfig,
  context: FinePotentialContext,
): void {
  const approximation = config.potentialApproximation ?? 'coarse';
  if (approximation === 'previous') {
    buildPreviousApproximation(potential, grid, config, context);
    return;
  }
  buildCoarseApproximation(potential, grid, config, context);
}
