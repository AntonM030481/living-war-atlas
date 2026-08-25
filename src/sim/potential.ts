import type { SideFields } from './sides';
import { applyApproximatePotential } from './potentialApproximation';
import {
  edgeTransmission,
  TRANSPORT_EPS as EPS,
  type TransportConfig,
  type TransportGrid,
} from './transportGrid';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
const FRONT_DEMAND_SMOOTHING_PASSES = 4;
const FRONT_DEMAND_SELF_WEIGHT = 1;
const DEFAULT_FINE_RELAXATION_PASSES = 6;
const POTENTIAL_RELAXATION_OMEGA = 1.0;
const POTENTIAL_RELAXATION_TOLERANCE = 1e-5;
const potentialStatusByField = new WeakMap<Float32Array, Uint8Array>();

function frontEdgeTransmission(
  index: number,
  neighbor: number,
  x: number,
  y: number,
  dx: number,
  dy: number,
  grid: TransportGrid,
): number {
  if (!grid.isFront(neighbor)) return 0;
  return edgeTransmission(index, neighbor, x, y, dx, dy, grid);
}

export function smoothFrontDemand(
  need: Float32Array,
  grid: TransportGrid,
  passes = FRONT_DEMAND_SMOOTHING_PASSES,
): Float32Array {
  let current = new Float32Array(need.length);
  for (let i = 0; i < need.length; i++) {
    if (grid.isFront(i) && grid.access(i) > 0.01) current[i] = need[i];
  }

  for (let pass = 0; pass < passes; pass++) {
    const next = new Float32Array(need.length);
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const i = y * grid.width + x;
        if (!grid.isFront(i) || grid.access(i) <= 0.01) continue;

        let weightedDemand = current[i] * FRONT_DEMAND_SELF_WEIGHT;
        let weightSum = FRONT_DEMAND_SELF_WEIGHT;
        for (const [dx, dy] of DIRS) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= grid.width || ny < 0 || ny >= grid.height) continue;
          const j = ny * grid.width + nx;
          const transmission = frontEdgeTransmission(i, j, x, y, dx, dy, grid);
          if (transmission <= EPS) continue;
          weightedDemand += current[j] * transmission;
          weightSum += transmission;
        }
        next[i] = weightedDemand / weightSum;
      }
    }
    current = next;
  }
  return current;
}

function potentialStatus(index: number, grid: TransportGrid): number {
  const access = grid.access(index);
  if (access <= 0.01 || grid.terrainCapacity[index] <= 0) return 0;
  if (grid.isFront(index) && access > 0.05) return 2;
  return 1;
}

function reactionForDecay(decay: number): number {
  const safeDecay = Math.max(EPS, Math.min(0.999999, decay));
  return safeDecay + 1 / safeDecay - 2;
}

export interface ApproximatePotentialResult {
  smoothedNeed: Float32Array;
  currentStatus: Uint8Array;
  reaction: number;
  maxFrontPotential: number;
}

export interface FinePotentialContext extends ApproximatePotentialResult {
  previousStatus?: Uint8Array;
}

function prepareFinePotential(
  fields: Pick<SideFields, 'need' | 'potential'>,
  grid: TransportGrid,
  config: TransportConfig,
): FinePotentialContext {
  const { need, potential } = fields;
  const smoothedNeed = smoothFrontDemand(need, grid);
  const reaction = reactionForDecay(config.potentialDecay);
  const previousStatus = potentialStatusByField.get(potential);
  const currentStatus = new Uint8Array(potential.length);
  let maxFrontPotential = 0;

  for (let i = 0; i < potential.length; i++) {
    const status = potentialStatus(i, grid);
    currentStatus[i] = status;
    if (status === 2) {
      potential[i] = 1 + smoothedNeed[i];
      maxFrontPotential = Math.max(maxFrontPotential, potential[i]);
    } else if (status === 0) {
      potential[i] = 0;
    } else if (!Number.isFinite(potential[i]) || potential[i] < 0) {
      potential[i] = 0;
    }
  }

  return { smoothedNeed, currentStatus, reaction, maxFrontPotential, previousStatus };
}

export function buildApproximatePotential(
  fields: Pick<SideFields, 'need' | 'potential'>,
  grid: TransportGrid,
  config: TransportConfig,
): ApproximatePotentialResult {
  const context = prepareFinePotential(fields, grid, config);
  const { potential } = fields;

  if (context.maxFrontPotential <= EPS) {
    potential.fill(0);
  } else {
    applyApproximatePotential(potential, grid, config, context);
  }

  potentialStatusByField.set(potential, context.currentStatus);
  return context;
}

export function refinePotential(
  potential: Float32Array,
  grid: TransportGrid,
  approximate: ApproximatePotentialResult,
  passes = DEFAULT_FINE_RELAXATION_PASSES,
): void {
  const { smoothedNeed, currentStatus, reaction, maxFrontPotential } = approximate;
  if (maxFrontPotential <= EPS) return;

  for (let pass = 0; pass < passes; pass++) {
    const reverse = (pass & 1) === 1;
    let maxDelta = 0;
    for (let step = 0; step < potential.length; step++) {
      const i = reverse ? potential.length - 1 - step : step;
      if (currentStatus[i] === 2) {
        potential[i] = 1 + smoothedNeed[i];
        continue;
      }
      if (currentStatus[i] === 0) {
        potential[i] = 0;
        continue;
      }

      const x = i % grid.width;
      const y = Math.floor(i / grid.width);
      let weightedPotential = 0;
      let transmissionSum = 0;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= grid.width || ny < 0 || ny >= grid.height) continue;
        const j = ny * grid.width + nx;
        const transmission = edgeTransmission(i, j, x, y, dx, dy, grid);
        if (transmission <= EPS) continue;
        weightedPotential += potential[j] * transmission;
        transmissionSum += transmission;
      }

      const target = transmissionSum > EPS
        ? weightedPotential / (transmissionSum + reaction)
        : 0;
      const before = potential[i];
      const relaxed = before + (target - before) * POTENTIAL_RELAXATION_OMEGA;
      potential[i] = Math.max(0, Math.min(maxFrontPotential, relaxed));
      maxDelta = Math.max(maxDelta, Math.abs(potential[i] - before));
    }
    if (maxDelta < POTENTIAL_RELAXATION_TOLERANCE) break;
  }
}

export function rebuildPotential(
  fields: Pick<SideFields, 'need' | 'potential' | 'war'>,
  grid: TransportGrid,
  config: TransportConfig,
): void {
  const approximate = buildApproximatePotential(fields, grid, config);
  refinePotential(
    fields.potential,
    grid,
    approximate,
    Math.max(1, Math.round(config.potentialFinePasses ?? DEFAULT_FINE_RELAXATION_PASSES)),
  );
}
