import { RESOURCE_EPS, type Side } from './Config';
import type { SideFields } from './sides';

const EPS = 1e-6;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
const SQRT2 = Math.SQRT2;
const FLOW_DIRS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2],
] as const;
const FRONT_DEMAND_SMOOTHING_PASSES = 4;
const FRONT_DEMAND_SELF_WEIGHT = 1;
const POTENTIAL_RELAXATION_PASSES = 6;
const POTENTIAL_RELAXATION_OMEGA = 1.0;
const POTENTIAL_RELAXATION_TOLERANCE = 1e-5;
const POTENTIAL_REPAIR_RADIUS = 8;
const potentialStatusByField = new WeakMap<Float32Array, Uint8Array>();

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
  potentialRepairEnabled?: boolean;
  baseEdgeCapacityPerSecond: number;
  resourceCellCapacity: number;
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

function cellCapacity(config: TransportConfig): number {
  return config.resourceCellCapacity;
}

function congestionTransmission(
  index: number,
  war: Float32Array,
  grid: TransportGrid,
  config: TransportConfig,
): number {
  const capacity = cellCapacity(config);
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
    cellCapacity(config) - Math.max(committed[index], war[index]),
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

function flowDirectionTransmission(
  index: number,
  x: number,
  y: number,
  dx: number,
  dy: number,
  grid: TransportGrid,
): number {
  const nx = x + dx;
  const ny = y + dy;
  if (nx < 0 || nx >= grid.width || ny < 0 || ny >= grid.height) return 0;
  const destination = ny * grid.width + nx;

  if (dx === 0 || dy === 0) {
    return edgeTransmission(index, destination, x, y, dx, dy, grid);
  }

  // A diagonal is only available when both orthogonal two-edge paths are
  // traversable, so diagonal flow cannot cut across an impassable corner.
  const xMid = y * grid.width + (x + dx);
  const yMid = (y + dy) * grid.width + x;
  const pathX = Math.min(
    edgeTransmission(index, xMid, x, y, dx, 0, grid),
    edgeTransmission(xMid, destination, x + dx, y, 0, dy, grid),
  );
  const pathY = Math.min(
    edgeTransmission(index, yMid, x, y, 0, dy, grid),
    edgeTransmission(yMid, destination, x, y + dy, dx, 0, grid),
  );
  return Math.min(pathX, pathY);
}

function gradientComponent(
  potential: Float32Array,
  index: number,
  x: number,
  y: number,
  dx: number,
  dy: number,
  grid: TransportGrid,
): number {
  const px = x + dx;
  const py = y + dy;
  const mx = x - dx;
  const my = y - dy;

  let plus: number | null = null;
  let minus: number | null = null;

  if (px >= 0 && px < grid.width && py >= 0 && py < grid.height) {
    const j = py * grid.width + px;
    if (edgeTransmission(index, j, x, y, dx, dy, grid) > EPS) plus = potential[j];
  }
  if (mx >= 0 && mx < grid.width && my >= 0 && my < grid.height) {
    const j = my * grid.width + mx;
    if (edgeTransmission(index, j, x, y, -dx, -dy, grid) > EPS) minus = potential[j];
  }

  if (plus !== null && minus !== null) return (plus - minus) * 0.5;
  if (plus !== null) return plus - potential[index];
  if (minus !== null) return potential[index] - minus;
  return 0;
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

function potentialStatus(index: number, grid: TransportGrid): number {
  const access = grid.access(index);
  if (access <= 0.01 || grid.terrainCapacity[index] <= 0) return 0;
  if (grid.isFront(index) && access > 0.05) return 2;
  return 1;
}

/**
 * Re-seed the moving-front neighbourhood instead of trusting stale warm-start
 * values there. The repair halo removes the old peak's spatial footprint, then
 * the whole invalidated region is filled outward from the current front and
 * unchanged valid cells before the normal relaxation sweeps continue.
 */
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

  // Any cell whose domain role changed invalidates an eight-cell halo around it.
  // Front cells themselves remain fixed boundary values; only interior cells are
  // re-seeded. A square halo is deliberately simple and cheap on this grid size.
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
    if (currentStatus[i] === 2) {
      valid[i] = 1;
      continue;
    }
    if (!invalidate[i]) {
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

  // Seed the wave from the current front and unchanged field around the halo.
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

  // Propagate through any number of adjacent invalidated layers.
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

export interface ApproximatePotentialResult {
  smoothedNeed: Float32Array;
  currentStatus: Uint8Array;
  reaction: number;
  maxFrontPotential: number;
}

/**
 * Builds the global approximate potential used as the starting point for fine
 * refinement. The current strategy reuses the previous solution and, when
 * enabled, repairs neighbourhoods whose domain/front status changed.
 */
export function buildApproximatePotential(
  fields: Pick<SideFields, 'need' | 'potential'>,
  grid: TransportGrid,
  config: TransportConfig,
): ApproximatePotentialResult {
  const { need, potential } = fields;
  const smoothedNeed = smoothFrontDemand(need, grid);
  const decay = Math.max(EPS, Math.min(0.999999, config.potentialDecay));
  const reaction = decay + 1 / decay - 2;
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

  if (maxFrontPotential <= EPS) {
    potential.fill(0);
    potentialStatusByField.set(potential, currentStatus);
    return { smoothedNeed, currentStatus, reaction, maxFrontPotential };
  }

  if (
    config.potentialRepairEnabled !== false &&
    previousStatus &&
    previousStatus.length === currentStatus.length
  ) {
    repairPotentialTransitions(potential, currentStatus, previousStatus, grid, reaction);
  }
  potentialStatusByField.set(potential, currentStatus);

  return { smoothedNeed, currentStatus, reaction, maxFrontPotential };
}

/**
 * Refines an approximate potential on the full-resolution grid. This is kept as
 * a separate stage so the approximation strategy and refinement implementation
 * can evolve independently (for example, a different global solver or GPU
 * refinement) without changing transport semantics.
 */
export function refinePotential(
  potential: Float32Array,
  grid: TransportGrid,
  approximate: ApproximatePotentialResult,
): void {
  const { smoothedNeed, currentStatus, reaction, maxFrontPotential } = approximate;
  if (maxFrontPotential <= EPS) return;

  for (let pass = 0; pass < POTENTIAL_RELAXATION_PASSES; pass++) {
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

/**
 * Builds a smooth screened-diffusion potential with front demand as a fixed
 * boundary condition. The build is deliberately split into a global approximate
 * solution followed by full-resolution fine refinement.
 */
export function rebuildPotential(
  fields: Pick<SideFields, 'need' | 'potential' | 'war'>,
  grid: TransportGrid,
  config: TransportConfig,
): void {
  const approximate = buildApproximatePotential(fields, grid, config);
  refinePotential(fields.potential, grid, approximate);
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

  // Phase 1: derive one continuous local gradient, then project that direction
  // onto traversable grid edges. Diagonals reduce grid anisotropy but pay their
  // geometric sqrt(2) distance cost and cannot cut impassable corners.
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const i = y * grid.width + x;
      const reserve = Math.max(0, war[i] - committed[i]);
      const access = grid.access(i);

      if (reserve <= RESOURCE_EPS) {
        if (committed[i] <= RESOURCE_EPS) {
          war[i] = 0;
          committed[i] = 0;
        } else {
          war[i] = committed[i];
        }
        flow.x[i] += (0 - flow.x[i]) * response;
        flow.y[i] += (0 - flow.y[i]) * response;
        continue;
      }
      if (access <= 0.01) {
        flow.x[i] += (0 - flow.x[i]) * response;
        flow.y[i] += (0 - flow.y[i]) * response;
        continue;
      }

      const gradientX = gradientComponent(potential, i, x, y, 1, 0, grid);
      const gradientY = gradientComponent(potential, i, x, y, 0, 1, grid);
      const gradientMagnitude = Math.hypot(gradientX, gradientY);
      if (gradientMagnitude <= EPS) {
        flow.x[i] += (0 - flow.x[i]) * response;
        flow.y[i] += (0 - flow.y[i]) * response;
        continue;
      }
      const directionX = gradientX / gradientMagnitude;
      const directionY = gradientY / gradientMagnitude;

      let routeWeightSum = 0;
      const candidates: Array<{
        j: number;
        dx: number;
        dy: number;
        distance: number;
        capacity: number;
        routeWeight: number;
      }> = [];

      for (const [dx, dy, distance] of FLOW_DIRS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= grid.width || ny < 0 || ny >= grid.height) continue;
        const j = ny * grid.width + nx;

        // Never move downhill in the actual discrete potential. The continuous
        // gradient is only used to distribute flow among genuinely uphill edges.
        const potentialGain = potential[j] - potential[i];
        if (!Number.isFinite(potentialGain) || potentialGain <= EPS) continue;

        // Project the continuous direction onto this edge's unit vector.
        const projection = (directionX * dx + directionY * dy) / distance;
        if (projection <= EPS) continue;

        const routeTransmission = flowDirectionTransmission(i, x, y, dx, dy, grid);
        if (routeTransmission <= EPS) continue;

        const congestion = Math.min(
          congestionTransmission(i, war, grid, config),
          congestionTransmission(j, war, grid, config),
        );
        // A diagonal edge spans sqrt(2) cells, so both throughput and routing
        // preference are reduced by the geometric distance factor.
        const distanceFactor = 1 / distance;
        const capacity = config.baseEdgeCapacityPerSecond * routeTransmission *
          congestion * config.dt * distanceFactor;
        if (capacity <= EPS) continue;

        const routeWeight = projection * routeTransmission * distanceFactor;
        if (routeWeight <= EPS) continue;

        routeWeightSum += routeWeight;
        candidates.push({ j, dx, dy, distance, capacity, routeWeight });
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
        targetFlowX += desiredRate * share * candidate.dx / candidate.distance;
        targetFlowY += desiredRate * share * candidate.dy / candidate.distance;
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
    const nextWar = Math.max(committed[i], war[i] + delta[i]);
    if (nextWar <= RESOURCE_EPS) {
      war[i] = 0;
      committed[i] = 0;
    } else {
      war[i] = nextWar;
      if (committed[i] <= RESOURCE_EPS) committed[i] = 0;
    }
  }
}