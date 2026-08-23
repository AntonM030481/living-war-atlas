import type { Side } from './Config';
import type { SideFields } from './sides';

const EPS = 1e-6;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
const FRONT_DEMAND_SMOOTHING_PASSES = 4;
const FRONT_DEMAND_SELF_WEIGHT = 1;
const POTENTIAL_RELAXATION_PASSES = 80;
const POTENTIAL_RELAXATION_OMEGA = 1.6;
const POTENTIAL_RELAXATION_TOLERANCE = 1e-5;

export function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Adapter for the current binary control field. Resource/flow state is generic
 * by side, but control itself is still encoded as +Blue / -Red.
 */
export function sideAccess(side: Side, control: number): number {
  const signedControl = side === 'blue' ? control : -control;
  return smoothstep(-0.10, 0.78, signedControl);
}

export interface TransportConfig {
  dt: number;
  potentialDecay: number;
  baseEdgeCapacityPerSecond: number;
  resourceCellCapacity: number;
  resourceFrontCellCapacity: number;
  resourceCongestionStrength: number;
  resourceFlowResponseSeconds: number;
}

export interface TransportGrid {
  width: number;
  height: number;
  terrainMobility: Float32Array;
  terrainCapacity: Float32Array;
  isFront: (index: number) => boolean;
  access: (index: number) => number;
  edgeFactor: (x: number, y: number, dx: number, dy: number) => number;
}

function cellCapacity(index: number, grid: TransportGrid, config: TransportConfig): number {
  return grid.isFront(index) ? config.resourceFrontCellCapacity : config.resourceCellCapacity;
}

function congestionTransmission(
  index: number,
  war: Float32Array,
  grid: TransportGrid,
  config: TransportConfig,
): number {
  const capacity = cellCapacity(index, grid, config);
  const utilization = Math.max(0, Math.min(1, war[index] / Math.max(capacity, EPS)));
  return 1 - config.resourceCongestionStrength * utilization;
}

function freeCapacity(
  index: number,
  war: Float32Array,
  committed: Float32Array,
  grid: TransportGrid,
  config: TransportConfig,
): number {
  return Math.max(
    0,
    cellCapacity(index, grid, config) - Math.max(committed[index], war[index]),
  );
}

function edgeTransmission(
  index: number,
  neighbor: number,
  x: number,
  y: number,
  dx: number,
  dy: number,
  grid: TransportGrid,
): number {
  const access = Math.min(grid.access(index), grid.access(neighbor));
  if (access <= 0.01) return 0;

  const terrainCapacity = Math.min(
    grid.terrainCapacity[index],
    grid.terrainCapacity[neighbor],
  );
  if (terrainCapacity <= 0) return 0;

  const crossing = grid.edgeFactor(x, y, dx, dy);
  if (crossing <= 0) return 0;

  const mobility = 0.72 + 0.28 * Math.min(
    grid.terrainMobility[index],
    grid.terrainMobility[neighbor],
  );
  return access * terrainCapacity * crossing * mobility;
}

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

/**
 * Smooth front demand only through edges that the transport graph itself can
 * traverse. This keeps demand on separate sides of an impassable barrier from
 * bleeding into each other while still allowing terrain/crossing penalties to
 * weaken the smoothing connection.
 */
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

/**
 * Builds a smooth screened-diffusion potential with front demand as a fixed
 * boundary condition. Unlike max propagation, every connected neighbouring
 * front segment contributes to the field, so small demand changes deform the
 * gradient continuously instead of switching whole regions between winners.
 *
 * potentialDecay is converted to the equivalent discrete reaction term so a
 * straight 1D corridor keeps approximately the same per-cell decay as before.
 */
export function rebuildPotential(
  fields: Pick<SideFields, 'need' | 'potential' | 'war'>,
  grid: TransportGrid,
  config: TransportConfig,
): void {
  const { need, potential } = fields;
  const smoothedNeed = smoothFrontDemand(need, grid);
  const decay = Math.max(EPS, Math.min(0.999999, config.potentialDecay));
  const reaction = decay + 1 / decay - 2;
  let maxFrontPotential = 0;

  for (let i = 0; i < potential.length; i++) {
    if (grid.isFront(i) && grid.access(i) > 0.05 && grid.terrainCapacity[i] > 0) {
      potential[i] = 1 + smoothedNeed[i];
      maxFrontPotential = Math.max(maxFrontPotential, potential[i]);
    } else if (grid.access(i) <= 0.01 || grid.terrainCapacity[i] <= 0) {
      potential[i] = 0;
    } else if (!Number.isFinite(potential[i]) || potential[i] < 0) {
      potential[i] = 0;
    }
  }

  if (maxFrontPotential <= EPS) {
    potential.fill(0);
    return;
  }

  for (let pass = 0; pass < POTENTIAL_RELAXATION_PASSES; pass++) {
    const reverse = (pass & 1) === 1;
    let maxDelta = 0;

    for (let step = 0; step < potential.length; step++) {
      const i = reverse ? potential.length - 1 - step : step;
      if (grid.isFront(i) && grid.access(i) > 0.05 && grid.terrainCapacity[i] > 0) {
        potential[i] = 1 + smoothedNeed[i];
        continue;
      }
      const access = grid.access(i);
      if (access <= 0.01 || grid.terrainCapacity[i] <= 0) {
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

interface TransferProposal {
  source: number;
  destination: number;
  amount: number;
}

export function transportResource(
  fields: Pick<SideFields, 'war' | 'committed' | 'potential' | 'delta' | 'incoming' | 'flow'>,
  grid: TransportGrid,
  config: TransportConfig,
): void {
  const { war, committed, potential, delta, incoming, flow } = fields;
  delta.fill(0);
  incoming.fill(0);

  const responseSeconds = Math.max(config.dt, config.resourceFlowResponseSeconds);
  const response = 1 - Math.exp(-config.dt / responseSeconds);
  const proposals: TransferProposal[] = [];
  const proposedIncoming = new Float32Array(war.length);

  // Phase 1: choose direction from strategic potential/terrain only. Flow is a
  // smoothed diagnostic of that choice and does not affect routing or throughput.
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const i = y * grid.width + x;
      const reserve = Math.max(0, war[i] - committed[i]);
      const access = grid.access(i);

      if (reserve <= 0.0001 || access <= 0.01) {
        flow.x[i] += (0 - flow.x[i]) * response;
        flow.y[i] += (0 - flow.y[i]) * response;
        continue;
      }

      const detourDrop = Math.max(1e-5, potential[i] * (1 - config.potentialDecay) * 1.25);
      let routeWeightSum = 0;
      const candidates: Array<{
        j: number;
        dx: number;
        dy: number;
        capacity: number;
        routeWeight: number;
      }> = [];

      for (const [dx, dy] of DIRS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= grid.width || ny < 0 || ny >= grid.height) continue;
        const j = ny * grid.width + nx;
        const neighborAccess = grid.access(j);
        if (neighborAccess <= 0.01) continue;

        const potentialDelta = potential[j] - potential[i];
        if (potentialDelta < -detourDrop) continue;

        const conductivity = Math.min(access, neighborAccess);
        const terrainCap = Math.min(grid.terrainCapacity[i], grid.terrainCapacity[j]);
        const crossing = grid.edgeFactor(x, y, dx, dy);
        const routeTransmission = terrainCap * crossing * conductivity;
        if (routeTransmission <= 0) continue;

        const congestion = Math.min(
          congestionTransmission(i, war, grid, config),
          congestionTransmission(j, war, grid, config),
        );
        const capacity = config.baseEdgeCapacityPerSecond * routeTransmission *
          congestion * config.dt;
        if (capacity <= 0) continue;

        const progressWeight = Math.max(0.05 * detourDrop, potentialDelta + detourDrop);
        const routeWeight = progressWeight * routeTransmission;
        if (routeWeight <= EPS) continue;

        routeWeightSum += routeWeight;
        candidates.push({ j, dx, dy, capacity, routeWeight });
      }

      if (routeWeightSum <= EPS || candidates.length === 0) {
        flow.x[i] += (0 - flow.x[i]) * response;
        flow.y[i] += (0 - flow.y[i]) * response;
        continue;
      }

      const desiredRate = reserve / Math.max(config.dt, EPS);
      let targetFlowX = 0;
      let targetFlowY = 0;
      for (const candidate of candidates) {
        const share = candidate.routeWeight / routeWeightSum;
        targetFlowX += desiredRate * share * candidate.dx;
        targetFlowY += desiredRate * share * candidate.dy;
      }

      flow.x[i] += (targetFlowX - flow.x[i]) * response;
      flow.y[i] += (targetFlowY - flow.y[i]) * response;

      // Every unit of uncommitted resource may attempt to move this tick.
      // Actual movement is constrained only by route share, edge throughput,
      // and destination capacity in phase 2.
      for (const candidate of candidates) {
        const share = candidate.routeWeight / routeWeightSum;
        const amount = Math.min(reserve * share, candidate.capacity);
        if (amount <= EPS) continue;
        proposals.push({ source: i, destination: candidate.j, amount });
        proposedIncoming[candidate.j] += amount;
      }
    }
  }

  // Phase 2: destinations accept proposals simultaneously. Cell free capacity
  // constrains accepted mass here, rather than feeding back into route choice.
  for (const proposal of proposals) {
    const destinationFreeCapacity = freeCapacity(
      proposal.destination,
      war,
      committed,
      grid,
      config,
    );
    const totalProposed = proposedIncoming[proposal.destination];
    const destinationScale = totalProposed > EPS
      ? Math.min(1, destinationFreeCapacity / totalProposed)
      : 0;
    const moved = proposal.amount * destinationScale;
    if (moved <= EPS) continue;

    delta[proposal.source] -= moved;
    delta[proposal.destination] += moved;
    incoming[proposal.destination] += moved / config.dt;
  }

  for (let i = 0; i < war.length; i++) {
    war[i] = Math.max(committed[i], war[i] + delta[i]);
  }
}
