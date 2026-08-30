import type { MapDefinition, MapId } from '../sim/types';
import { islandMap } from './islandMap';
import { linearMap } from './linearMap';
import { generateMapRegions } from './regionGeneration';
import { testMap } from './testMap';

export interface MapOption {
  id: MapId;
  name: string;
  description: string;
  map: MapDefinition;
}

function seedFromMapId(id: MapId): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

const RAW_MAP_OPTIONS: readonly MapOption[] = [
  {
    id: 'theatre',
    name: 'Full playground map',
    description: '256x160 map with 10 cities, river and forests.',
    map: testMap,
  },
  {
    id: 'island',
    name: 'Mountain theatre',
    description: '256x160 map with 10 cities, mountains, foothill forests and a branched river network.',
    map: islandMap,
  },
  {
    id: 'linear',
    name: 'Linear test map',
    description: '256x24 map with 2 cities and no obstacles.',
    map: linearMap,
  },
];

export const MAP_OPTIONS: readonly MapOption[] = RAW_MAP_OPTIONS.map((option) => ({
  ...option,
  map: generateMapRegions(option.map, seedFromMapId(option.id)),
}));

export function isMapId(value: string): value is MapId {
  return MAP_OPTIONS.some((option) => option.id === value);
}

export function getMapOption(id: MapId): MapOption {
  const option = MAP_OPTIONS.find((candidate) => candidate.id === id);
  if (!option) throw new Error(`Unknown map: ${id}`);
  return option;
}

export function getMapDefinition(id: MapId): MapDefinition {
  return getMapOption(id).map;
}
