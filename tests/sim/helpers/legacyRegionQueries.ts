// Frozen pre-cache query implementation for exact equivalence checks.
// Keep independent of the numeric caches in production RegionTopology.
import type { RegionTopology } from '../../../src/sim/regions';
import type { MapDefinition, RegionId } from '../../../src/sim/types';

const CARDINAL_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
function borderKey(first: RegionId, second: RegionId): string {
  return first < second ? `${first}\u0000${second}` : `${second}\u0000${first}`;
}
type LegacyFields = {
  map: MapDefinition;
  openBorderKeys: Set<string>;
  regionIdAt(index: number): RegionId | null;
};
export function legacyEdgeFactor(this: RegionTopology, index: number, neighbor: number): number {
  const fields = this as unknown as LegacyFields;
  const first = this.regionIdAt(index);
  const second = this.regionIdAt(neighbor);
  if (first === null || second === null || first === second) return 1;
  return fields.openBorderKeys.has(borderKey(first, second)) ? 1 : 0;
}

export function legacyPotentialFront(this: RegionTopology, index: number): boolean {
  const fields = this as unknown as LegacyFields;
  const regionId = this.regionIdAt(index);
  if (regionId === null) return false;
  const x = index % fields.map.width;
  const y = Math.floor(index / fields.map.width);

  for (const [dx, dy] of CARDINAL_DIRS) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || nx >= fields.map.width || ny < 0 || ny >= fields.map.height) continue;
    const neighborId = this.regionIdAt(ny * fields.map.width + nx);
    if (neighborId === null || neighborId === regionId) continue;
    if (!fields.openBorderKeys.has(borderKey(regionId, neighborId))) return true;
  }
  return false;
}
