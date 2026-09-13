import type { MapDefinition, RegionId } from './types';

function borderKey(first: RegionId, second: RegionId): string {
  return first < second ? `${first}\u0000${second}` : `${second}\u0000${first}`;
}

export class RegionTopology {
  private readonly cellRegions: Int32Array;
  private readonly idByIndex: RegionId[] = [];
  private readonly indexById = new Map<RegionId, number>();
  private readonly adjacency = new Map<RegionId, Set<RegionId>>();
  private readonly openBorderKeys = new Set<string>();
  // Numeric lookup in the hot path; string keys remain the serialization API.
  private readonly openByRegion: Uint8Array;
  private readonly potentialFront: Uint8Array;
  private potentialFrontDirty = false;

  constructor(private readonly map: MapDefinition) {
    this.cellRegions = new Int32Array(map.width * map.height);
    this.cellRegions.fill(-1);

    const regions = map.regions ?? [];
    this.openByRegion = new Uint8Array(regions.length * regions.length);
    this.potentialFront = new Uint8Array(this.cellRegions.length);
    if (regions.length === 0) {
      if (map.regionAt) throw new Error('Map regionAt requires region definitions');
      return;
    }
    if (!map.regionAt) throw new Error('Map regions require regionAt');

    const cityIds = new Set(map.cities.map((city) => city.id));
    const usedCityIds = new Set<string>();
    for (const region of regions) {
      if (this.indexById.has(region.id)) throw new Error(`Duplicate region id: ${region.id}`);
      if (!cityIds.has(region.cityId)) throw new Error(`Unknown city ${region.cityId} for region ${region.id}`);
      if (usedCityIds.has(region.cityId)) throw new Error(`City ${region.cityId} belongs to multiple regions`);
      usedCityIds.add(region.cityId);
      this.indexById.set(region.id, this.idByIndex.length);
      this.idByIndex.push(region.id);
      this.adjacency.set(region.id, new Set());
    }

    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const regionId = map.regionAt(x, y);
        if (regionId === null) continue;
        const regionIndex = this.indexById.get(regionId);
        if (regionIndex === undefined) throw new Error(`regionAt returned unknown region: ${regionId}`);
        this.cellRegions[y * map.width + x] = regionIndex;
      }
    }

    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const index = y * map.width + x;
        if (x + 1 < map.width) this.registerAdjacency(index, index + 1);
        if (y + 1 < map.height) this.registerAdjacency(index, index + map.width);
      }
    }
  }

  hasRegions(): boolean {
    return this.idByIndex.length > 0;
  }

  regionIdAt(index: number): RegionId | null {
    if (index < 0 || index >= this.cellRegions.length) return null;
    const regionIndex = this.cellRegions[index];
    return regionIndex >= 0 ? this.idByIndex[regionIndex] : null;
  }

  neighbors(regionId: RegionId): readonly RegionId[] {
    this.requireRegion(regionId);
    return [...(this.adjacency.get(regionId) ?? [])].sort();
  }

  setBorderOpen(first: RegionId, second: RegionId, open: boolean): boolean {
    this.requireAdjacent(first, second);
    const key = borderKey(first, second);
    const before = this.openBorderKeys.has(key);
    if (open) this.openBorderKeys.add(key);
    else this.openBorderKeys.delete(key);
    const a = this.indexById.get(first)!;
    const b = this.indexById.get(second)!;
    const count = this.idByIndex.length;
    this.openByRegion[a * count + b] = open ? 1 : 0;
    this.openByRegion[b * count + a] = open ? 1 : 0;
    if (before !== open) this.potentialFrontDirty = true;
    return before !== open;
  }

  isBorderOpen(first: RegionId, second: RegionId): boolean {
    this.requireAdjacent(first, second);
    return this.openBorderKeys.has(borderKey(first, second));
  }

  edgeFactor(index: number, neighbor: number): number {
    const first = this.cellRegions[index];
    const second = this.cellRegions[neighbor];
    if (first === undefined || second === undefined || first < 0 || second < 0 || first === second) return 1;
    return this.openByRegion[first * this.idByIndex.length + second];
  }

  isPotentialFront(index: number): boolean {
    if (this.potentialFrontDirty) this.rebuildPotentialFront();
    return this.potentialFront[index] === 1;
  }

  openBorders(): Array<[RegionId, RegionId]> {
    const result: Array<[RegionId, RegionId]> = [];
    for (const first of this.idByIndex) {
      for (const second of this.adjacency.get(first) ?? []) {
        if (first >= second) continue;
        if (this.openBorderKeys.has(borderKey(first, second))) result.push([first, second]);
      }
    }
    return result;
  }

  restoreOpenBorders(borders: readonly (readonly [RegionId, RegionId])[]): void {
    this.openBorderKeys.clear();
    this.openByRegion.fill(0);
    this.potentialFrontDirty = true;
    for (const [first, second] of borders) this.setBorderOpen(first, second, true);
  }

  private rebuildPotentialFront(): void {
    this.potentialFront.fill(0);
    const { width, height } = this.map;
    // Political changes are rare and often batched. Scan once on first demand
    // query after a change, rather than scanning four neighbors on every query.
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        if (x + 1 < width && this.edgeFactor(index, index + 1) === 0) {
          this.potentialFront[index] = this.potentialFront[index + 1] = 1;
        }
        if (y + 1 < height && this.edgeFactor(index, index + width) === 0) {
          this.potentialFront[index] = this.potentialFront[index + width] = 1;
        }
      }
    }
    this.potentialFrontDirty = false;
  }

  private registerAdjacency(firstIndex: number, secondIndex: number): void {
    const first = this.regionIdAt(firstIndex);
    const second = this.regionIdAt(secondIndex);
    if (first === null || second === null || first === second) return;
    this.adjacency.get(first)?.add(second);
    this.adjacency.get(second)?.add(first);
    // Regions are passive geography. Political closure is imposed by a meta-game.
    this.setBorderOpen(first, second, true);
  }

  private requireRegion(regionId: RegionId): void {
    if (!this.indexById.has(regionId)) throw new Error(`Unknown region: ${regionId}`);
  }

  private requireAdjacent(first: RegionId, second: RegionId): void {
    this.requireRegion(first);
    this.requireRegion(second);
    if (first === second || !this.adjacency.get(first)?.has(second)) {
      throw new Error(`Regions are not adjacent: ${first}, ${second}`);
    }
  }
}
