export interface ShortestPathGrid {
  width: number;
  height: number;
  status: Uint8Array;
  edgeCost: (x: number, y: number, dx: number, dy: number) => number;
}

export interface ShortestPathResult {
  distances: Float64Array;
  sources: Int32Array;
}

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
 * Computes distances to the nearest status=2 source and remembers which source
 * won each cell. Source payload is deliberately not part of the path cost.
 */
export function solveMultiSourceDijkstra(grid: ShortestPathGrid): ShortestPathResult {
  const size = grid.width * grid.height;
  const distances = new Float64Array(size);
  const sources = new Int32Array(size);
  distances.fill(Number.POSITIVE_INFINITY);
  sources.fill(-1);
  const heap = new MinHeap();

  for (let i = 0; i < size; i++) {
    if (grid.status[i] !== 2) continue;
    distances[i] = 0;
    sources[i] = i;
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
      if (grid.status[neighbor] === 0) continue;

      const stepCost = grid.edgeCost(x, y, dx, dy);
      if (!Number.isFinite(stepCost) || stepCost <= 0) continue;

      const candidate = current.cost + stepCost;
      if (candidate >= distances[neighbor]) continue;
      distances[neighbor] = candidate;
      sources[neighbor] = sources[current.index];
      heap.push(neighbor, candidate);
    }
  }

  return { distances, sources };
}
