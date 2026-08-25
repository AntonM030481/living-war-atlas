import { RESOURCE_EPS, type Side } from './Config';
import type { SideFields } from './sides';
import {
  edgeTransmission,
  TRANSPORT_EPS as EPS,
  type TransportConfig,
  type TransportGrid,
} from './transportGrid';

export type { PotentialApproximation, TransportConfig, TransportGrid } from './transportGrid';
export {
  buildApproximatePotential,
  rebuildPotential,
  refinePotential,
  smoothFrontDemand,
} from './potential';
export type { ApproximatePotentialResult } from './potential';

const SQRT2 = Math.SQRT2;
const FLOW_DIRS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2],
] as const;

export function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Adapter for the current binary control field. */
export function sideAccess(side: Side, control: number): number {
  const signedControl = side === 'blue' ? control : -control;
  return smoothstep(-0.10, 0.78, signedControl);
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
        // Elimination of all forces on a cell that is no longer accessible.
        war[i] = 0;
        committed[i] = 0;

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

        const potentialGain = potential[j] - potential[i];
        if (!Number.isFinite(potentialGain) || potentialGain <= EPS) continue;

        const projection = (directionX * dx + directionY * dy) / distance;
        if (projection <= EPS) continue;

        const routeTransmission = flowDirectionTransmission(i, x, y, dx, dy, grid);
        if (routeTransmission <= EPS) continue;

        const congestion = Math.min(
          congestionTransmission(i, war, grid, config),
          congestionTransmission(j, war, grid, config),
        );
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

      for (const candidate of candidates) {
        const share = candidate.routeWeight / routeWeightSum;
        const amount = Math.min(reserve * share, candidate.capacity);
        if (amount <= EPS) continue;
        proposals.push({ source: i, destination: candidate.j, amount });
        proposedIncoming[candidate.j] += amount;
      }
    }
  }

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
