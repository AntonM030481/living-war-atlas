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
  resourceMoveFraction: number;
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

export function rebuildPotential(
  fields: Pick<SideFields, 'need' | 'potential'>,
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

export function transportResource(
  fields: Pick<SideFields, 'war' | 'committed' | 'potential' | 'delta' | 'incoming' | 'flow'>,
  grid: TransportGrid,
  config: TransportConfig,
): void {
  const { war, committed, potential, delta, incoming, flow } = fields;
  delta.fill(0);
  incoming.fill(0);
  flow.x.fill(0);
  flow.y.fill(0);

  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const i = y * grid.width + x;
      const reserve = Math.max(0, war[i] - committed[i]);
      if (reserve <= 0.0001) continue;
      const access = grid.access(i);
      if (access <= 0.01) continue;

      let gradientSum = 0;
      const candidates: Array<{ j: number; dx: number; dy: number; gradient: number; capacity: number }> = [];
      for (const [dx, dy] of DIRS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= grid.width || ny < 0 || ny >= grid.height) continue;
        const j = ny * grid.width + nx;
        const neighborAccess = grid.access(j);
        if (neighborAccess <= 0.01) continue;
        const gradient = potential[j] - potential[i];
        if (gradient <= 1e-5) continue;

        const conductivity = Math.min(access, neighborAccess);
        const terrainCap = Math.min(grid.terrainCapacity[i], grid.terrainCapacity[j]);
        const crossing = grid.edgeFactor(x, y, dx, dy);
        const capacity = config.baseEdgeCapacityPerSecond * terrainCap * crossing * conductivity * config.dt;
        if (capacity <= 0) continue;
        gradientSum += gradient;
        candidates.push({ j, dx, dy, gradient, capacity });
      }

      if (gradientSum <= 0 || candidates.length === 0) continue;
      const movable = reserve * config.resourceMoveFraction;
      let sent = 0;
      for (const candidate of candidates) {
        const desired = movable * (candidate.gradient / gradientSum);
        const moved = Math.min(desired, candidate.capacity, reserve - sent);
        if (moved <= 0) continue;
        delta[i] -= moved;
        delta[candidate.j] += moved;
        incoming[candidate.j] += moved / config.dt;
        flow.x[i] += (moved / config.dt) * candidate.dx;
        flow.y[i] += (moved / config.dt) * candidate.dy;
        sent += moved;
        if (sent >= reserve - EPS) break;
      }
    }
  }

  for (let i = 0; i < war.length; i++) {
    war[i] = Math.max(committed[i], war[i] + delta[i]);
  }
}
