import type { PotentialApproximationStrategy } from './types';
import {
  edgeTransmission,
  TRANSPORT_EPS as EPS,
} from '../transportGrid';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

class MinHeap {
  private readonly indices: number[] = [];
  private readonly costs: number[] = [];

  get size(): number {
    return this.indices.length;
  }

  push(index: number, cost: number): void {
    let position = this.indices.length;
    this.indices.push(index);
    this.costs.push(cost);

    while (position > 0) {
      const parent = (position - 1) >> 1;
      if (this.costs[parent] <= cost) break;
      this.indices[position] = this.indices[parent];
      this.costs[position] = this.costs[parent];
      position = parent;
    }

    this.indices[position] = index;
    this.costs[position] = cost;
  }

  pop(): { index: number; cost: number } | null {
    if (this.indices.length === 0) return null;

    const index = this.indices[0];
    const cost = this.costs[0];
    const lastIndex = this.indices.pop()!;
    const lastCost = this.costs.pop()!;

    if (this.indices.length > 0) {
      let position = 0;
      while (true) {
        const left = position * 2 + 1;
        if (left >= this.indices.length) break;
        const right = left + 1;
        const child = right < this.indices.length && this.costs[right] < this.costs[left]
          ? right
          : left;
        if (this.costs[child] >= lastCost) break;
        this.indices[position] = this.indices[child];
        this.costs[position] = this.costs[child];
        position = child;
      }
      this.indices[position] = lastIndex;
      this.costs[position] = lastCost;
    }

    return { index, cost };
  }
}

/**
 * Converts edge transmission to an effective path length. For screened
 * diffusion, attenuation grows approximately with the square root of resistance,
 * so 1/sqrt(transmission) is a useful cheap distance proxy without making low-
 * capacity terrain dominate as aggressively as 1/transmission.
 */
function edgeDistance(transmission: number): number {
  return 1 / Math.sqrt(Math.max(transmission, EPS));
}

/**
 * Builds only the global geometric shape of the field. All front cells are
 * equal-distance sources; their individual need values remain boundary
 * conditions for fine relaxation instead of being propagated through Voronoi
 * regions by Dijkstra.
 */
export const buildDijkstraApproximation: PotentialApproximationStrategy = (
  potential,
  grid,
  config,
  context,
) => {
  const safeDecay = Math.max(EPS, Math.min(0.999999, config.potentialDecay));
  const logDecay = Math.log(safeDecay);
  const distances = new Float64Array(potential.length);
  distances.fill(Number.POSITIVE_INFINITY);
  const heap = new MinHeap();

  for (let i = 0; i < potential.length; i++) {
    if (context.currentStatus[i] !== 2) continue;
    distances[i] = 0;
    heap.push(i, 0);
  }

  while (heap.size > 0) {
    const current = heap.pop()!;
    if (current.cost !== distances[current.index]) continue;

    const x = current.index % grid.width;
    const y = Math.floor(current.index / grid.width);
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= grid.width || ny < 0 || ny >= grid.height) continue;
      const neighbor = ny * grid.width + nx;
      if (context.currentStatus[neighbor] === 0) continue;

      const transmission = edgeTransmission(
        current.index,
        neighbor,
        x,
        y,
        dx,
        dy,
        grid,
      );
      if (transmission <= EPS) continue;

      const candidate = current.cost + edgeDistance(transmission);
      if (candidate >= distances[neighbor]) continue;
      distances[neighbor] = candidate;
      heap.push(neighbor, candidate);
    }
  }

  for (let i = 0; i < potential.length; i++) {
    if (context.currentStatus[i] === 0 || !Number.isFinite(distances[i])) {
      potential[i] = 0;
    } else if (context.currentStatus[i] === 2) {
      potential[i] = 1 + context.smoothedNeed[i];
    } else {
      potential[i] = Math.max(
        0,
        Math.min(
          context.maxFrontPotential,
          context.maxFrontPotential * Math.exp(logDecay * distances[i]),
        ),
      );
    }
  }
};
