import { rasterizeRivers } from '../sim/rivers';
import type { MapDefinition, MapRegion, RegionId } from '../sim/types';
import { rasterizeTerrainRegions } from './terrain';

const FOREST_COST = 0.18;
const RIVER_CROSSING_COST = 2.5;
const NOISE_STRENGTH = 0.12;
const NOISE_SCALE = 24;
const EPSILON = 1e-9;

class MinHeap {
  private readonly nodes: number[] = [];
  private readonly priorities: number[] = [];

  get size(): number { return this.nodes.length; }

  push(node: number, priority: number): void {
    let index = this.nodes.length;
    this.nodes.push(node);
    this.priorities.push(priority);

    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.priorities[parent] <= priority) break;
      this.nodes[index] = this.nodes[parent];
      this.priorities[index] = this.priorities[parent];
      index = parent;
    }
    this.nodes[index] = node;
    this.priorities[index] = priority;
  }

  pop(): { node: number; priority: number } | null {
    if (this.nodes.length === 0) return null;

    const node = this.nodes[0];
    const priority = this.priorities[0];
    const lastNode = this.nodes.pop()!;
    const lastPriority = this.priorities.pop()!;
    if (this.nodes.length === 0) return { node, priority };

    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      if (left >= this.nodes.length) break;
      const right = left + 1;
      let child = left;
      if (right < this.nodes.length && this.priorities[right] < this.priorities[left]) child = right;
      if (this.priorities[child] >= lastPriority) break;
      this.nodes[index] = this.nodes[child];
      this.priorities[index] = this.priorities[child];
      index = child;
    }
    this.nodes[index] = lastNode;
    this.priorities[index] = lastPriority;
    return { node, priority };
  }
}

function hash01(x: number, y: number, seed: number): number {
  let value = seed ^ Math.imul(x, 0x1f123bb5) ^ Math.imul(y, 0x5f356495);
  value = Math.imul(value ^ (value >>> 15), 0x2c1b3c6d);
  value = Math.imul(value ^ (value >>> 12), 0x297a2d39);
  value ^= value >>> 15;
  return (value >>> 0) / 0xffffffff;
}

function smoothstep(value: number): number {
  return value * value * (3 - 2 * value);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothNoise(x: number, y: number, seed: number): number {
  const sx = x / NOISE_SCALE;
  const sy = y / NOISE_SCALE;
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const tx = smoothstep(sx - x0);
  const ty = smoothstep(sy - y0);
  const top = lerp(hash01(x0, y0, seed), hash01(x0 + 1, y0, seed), tx);
  const bottom = lerp(hash01(x0, y0 + 1, seed), hash01(x0 + 1, y0 + 1, seed), tx);
  return lerp(top, bottom, ty) * 2 - 1;
}

function crossingFactor(
  from: number,
  to: number,
  width: number,
  riverX: Float32Array,
  riverY: Float32Array,
): number {
  if (to === from + 1) return riverX[from];
  if (to === from - 1) return riverX[to];
  if (to === from + width) return riverY[from];
  if (to === from - width) return riverY[to];
  return 1;
}

function regionId(cityId: string): RegionId {
  return `region:${cityId}`;
}

/**
 * Builds one connected graph-Voronoi region around every city/capital.
 * Distances follow passable terrain instead of straight lines, so rivers and
 * forests can bend borders. A small smooth seeded noise term keeps the result
 * from looking mechanically geometric while remaining deterministic.
 */
export function generateMapRegions(map: MapDefinition, seed: number): MapDefinition {
  const { width, height } = map;
  const size = width * height;
  if (map.cities.length === 0) return { ...map, regions: [], regionAt: undefined };

  const blocked = new Uint8Array(size);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if ((map.terrainAt?.(x, y) ?? 'open') !== 'open') blocked[y * width + x] = 1;
    }
  }

  const forest = rasterizeTerrainRegions(width, height, map.forests);
  const rivers = rasterizeRivers(width, height, map.rivers);
  const noiseFactor = new Float32Array(size);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      noiseFactor[index] = 1 + NOISE_STRENGTH * smoothNoise(x + 0.5, y + 0.5, seed);
    }
  }

  const regions: MapRegion[] = map.cities.map((city) => ({ id: regionId(city.id), cityId: city.id }));
  const owner = new Int32Array(size);
  owner.fill(-1);
  const distance = new Float64Array(size);
  distance.fill(Number.POSITIVE_INFINITY);
  const heap = new MinHeap();

  for (let regionIndex = 0; regionIndex < map.cities.length; regionIndex++) {
    const city = map.cities[regionIndex];
    const x = Math.floor(city.x);
    const y = Math.floor(city.y);
    if (x < 0 || x >= width || y < 0 || y >= height) throw new Error(`City ${city.id} is outside the map`);
    const index = y * width + x;
    if (blocked[index]) throw new Error(`City ${city.id} is on blocked terrain`);
    if (owner[index] >= 0) throw new Error(`Cities ${map.cities[owner[index]].id} and ${city.id} share a cell`);
    owner[index] = regionIndex;
    distance[index] = 0;
    heap.push(index, 0);
  }

  const relax = (from: number, to: number): void => {
    if (blocked[to]) return;
    const fromRegion = owner[from];
    if (fromRegion < 0) return;

    const forestShare = (forest[from] + forest[to]) * 0.5;
    const riverFactor = crossingFactor(from, to, width, rivers.crossingX, rivers.crossingY);
    const geographyCost = 1 + FOREST_COST * forestShare + RIVER_CROSSING_COST * (1 - riverFactor);
    const stepCost = geographyCost * (noiseFactor[from] + noiseFactor[to]) * 0.5;
    const candidate = distance[from] + stepCost;
    const betterDistance = candidate + EPSILON < distance[to];
    const deterministicTie = Math.abs(candidate - distance[to]) <= EPSILON
      && (owner[to] < 0 || fromRegion < owner[to]);
    if (!betterDistance && !deterministicTie) return;

    distance[to] = candidate;
    owner[to] = fromRegion;
    heap.push(to, candidate);
  };

  while (heap.size > 0) {
    const current = heap.pop()!;
    if (current.priority > distance[current.node] + EPSILON) continue;
    const x = current.node % width;
    const y = Math.floor(current.node / width);
    if (x > 0) relax(current.node, current.node - 1);
    if (x + 1 < width) relax(current.node, current.node + 1);
    if (y > 0) relax(current.node, current.node - width);
    if (y + 1 < height) relax(current.node, current.node + width);
  }

  const regionAt = (x: number, y: number): RegionId | null => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || ix >= width || iy < 0 || iy >= height) return null;
    const regionIndex = owner[iy * width + ix];
    return regionIndex >= 0 ? regions[regionIndex].id : null;
  };

  return { ...map, regions, regionAt };
}
