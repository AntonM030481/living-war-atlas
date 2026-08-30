import { describe, expect, it } from 'vitest';
import { mapSupportsMode } from '../../src/game/GameMode';
import { MAP_OPTIONS } from '../../src/map/maps';
import { generateMapRegions } from '../../src/map/regionGeneration';
import type { MapDefinition } from '../../src/sim/types';

function simpleMap(): MapDefinition {
  return {
    width: 9,
    height: 5,
    initialFrontX: () => 4.5,
    cities: [
      { id: 'a', name: 'A', x: 1, y: 2, baseProduction: 1, owner: 'blue', integration: 1 },
      { id: 'b', name: 'B', x: 7, y: 2, baseProduction: 1, owner: 'red', integration: 1 },
    ],
    forests: [{ x: 4, y: 2, r: 1.2 }],
    rivers: [[{ x: 4.5, y: 0 }, { x: 4.5, y: 5 }]],
    terrainAt: (x, y) => x === 0 || y === 0 || x === 8 || y === 4 ? 'blocked' : 'open',
    seedInitialResource: false,
  };
}

describe('automatic country regions', () => {
  it('creates one deterministic terrain-aware region per city', () => {
    const first = generateMapRegions(simpleMap(), 12345);
    const second = generateMapRegions(simpleMap(), 12345);

    expect(first.regions).toHaveLength(2);
    for (const city of first.cities) {
      const region = first.regions!.find((candidate) => candidate.cityId === city.id)!;
      expect(first.regionAt!(city.x, city.y)).toBe(region.id);
    }

    for (let y = 0; y < first.height; y++) {
      for (let x = 0; x < first.width; x++) {
        expect(first.regionAt!(x, y)).toBe(second.regionAt!(x, y));
        if ((first.terrainAt?.(x, y) ?? 'open') === 'open') {
          expect(first.regionAt!(x, y)).not.toBeNull();
        } else {
          expect(first.regionAt!(x, y)).toBeNull();
        }
      }
    }
  });

  it('makes every shipped map compatible with Conquest', () => {
    for (const option of MAP_OPTIONS) {
      expect(mapSupportsMode(option.map, 'conquest'), option.id).toBe(true);
      expect(option.map.regions).toHaveLength(option.map.cities.length);
      for (const city of option.map.cities) {
        const region = option.map.regions!.find((candidate) => candidate.cityId === city.id)!;
        expect(option.map.regionAt!(city.x, city.y), `${option.id}:${city.id}`).toBe(region.id);
      }
    }
  });
});
