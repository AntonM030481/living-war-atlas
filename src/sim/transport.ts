import type { Side } from './Config';
import type { SideFields } from './sides';

const EPS = 1e-6;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

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

export function rebuildPotential(
  fields: Pick<SideFields, 'need' | 'potential' | 'war'>,
  grid: TransportGrid,
  config: TransportConfig,
): void {
  const { need, potential } = fields;
  potential.fill(0);
  const heapIndex: number[] = [];
  const heapValue: number[] = [];

  const push = (index: number, value: number): void => {
    let node = heapIndex.length;
    heapIndex.push(index);
    heapValue.push(value);
    while (node > 0) {
      const parent = (node - 1) >> 1;
      if (heapValue[parent] >= value) break;
      heapIndex[node] = heapIndex[parent];
      heapValue[node] = heapValue[parent];
      node = parent;
    }
    heapIndex[node] = index;
    heapValue[node] = value;
  };

  const pop = (): { index: number; value: number } | null => {
    if (heapIndex.length === 0) return null;
    const index = heapIndex[0];
    const value = heapValue[0];
    const lastIndex = heapIndex.pop()!;
    const lastValue = heapValue.pop()!;
    if (heapIndex.length > 0) {
      let node = 0;
      while (true) {
        const left = node * 2 + 1;
        const right = left + 1;
        if (left >= heapIndex.length) break;
        const child = right < heapIndex.length && heapValue[right] > heapValue[left] ? right : left;
        if (heapValue[child] <= lastValue) break;
        heapIndex[node] = heapIndex[child];
        heapValue[node] = heapValue[child];
        node = child;
      }
      heapIndex[node] = lastIndex;
      heapValue[node] = lastValue;
    }
    return { index, value };
  };

  for (let i = 0; i < potential.length; i++) {
    if (grid.isFront(i) && grid.access(i) > 0.05) {
      const value = 1 + need[i];
      potential[i] = value;
      push(i, value);
    }
  }

  while (true) {
    const entry = pop();
    if (!entry) break;
    if (entry.value < potential[entry.index] - 1e-7) continue;
    const x = entry.index % grid.width;
    const y = Math.floor(entry.index / grid.width);

    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= grid.width || ny < 0 || ny >= grid.height) continue;
      const j = ny * grid.width + nx;
      const access = grid.access(j);
      if (access <= 0.01) continue;
      const terrainTransmission = 0.72 + 0.28 * grid.terrainMobility[j];
      const nextValue = entry.value * config.potentialDecay *
        grid.edgeFactor(x, y, dx, dy) * access * terrainTransmission;
      if (nextValue <= potential[j] + 1e-7) continue;
      potential[j] = nextValue;
      push(j, nextValue);
    }
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

  // Phase 1: build transfer proposals from the immutable state at the start of the tick.
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

      const currentFlowMagnitude = Math.hypot(flow.x[i], flow.y[i]);
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
        const congestion = Math.min(
          congestionTransmission(i, war, grid, config),
          congestionTransmission(j, war, grid, config),
        );
        const capacity = config.baseEdgeCapacityPerSecond * terrainCap * crossing *
          conductivity * congestion * config.dt;
        if (capacity <= 0) continue;

        const freeCapacity = Math.max(
          0,
          cellCapacity(j, grid, config) - Math.max(committed[j], war[j]),
        );
        if (freeCapacity <= EPS) continue;

        const progressWeight = Math.max(0.05 * detourDrop, potentialDelta + detourDrop);
        let directionBias = 1;
        if (currentFlowMagnitude > EPS) {
          const alignment = (flow.x[i] * dx + flow.y[i] * dy) / currentFlowMagnitude;
          directionBias = Math.max(0.05, 1 + alignment);
        }
        const routeWeight = progressWeight * capacity * freeCapacity * directionBias;
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

      const movable = Math.min(reserve, Math.max(
        Math.hypot(flow.x[i], flow.y[i]) * config.dt,
        reserve * response,
      ));

      for (const candidate of candidates) {
        const share = candidate.routeWeight / routeWeightSum;
        const amount = Math.min(movable * share, candidate.capacity);
        if (amount <= EPS) continue;
        proposals.push({ source: i, destination: candidate.j, amount });
        proposedIncoming[candidate.j] += amount;
      }
    }
  }

  // Phase 2: destinations accept all proposals simultaneously, scaled only by
  // their free capacity. No source can benefit from array traversal order.
  for (const proposal of proposals) {
    const freeCapacity = Math.max(
      0,
      cellCapacity(proposal.destination, grid, config) -
        Math.max(committed[proposal.destination], war[proposal.destination]),
    );
    const totalProposed = proposedIncoming[proposal.destination];
    const destinationScale = totalProposed > EPS
      ? Math.min(1, freeCapacity / totalProposed)
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
