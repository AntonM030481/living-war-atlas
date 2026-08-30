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

const theatreWithRegions = generateMapRegions(testMap, 0x41a7c2d1);
const islandWithRegions = generateMapRegions(islandMap, 0x73b51e29);
const linearWithRegions = generateMapRegions(linearMap, 0x19f24bc3);

export const MAP_OPTIONS: readonly MapOption[] = [
  {
    id: 'theatre',
    name: 'Full playground map',
    description: '256x160 map with 10 cities, river and forests.',
    map: theatreWithRegions,
  },
  {
    id: 'island',
    name: 'Mountain theatre',
    description: '256x160 map with 10 cities, mountains, foothill forests and a branched river network.',
    map: islandWithRegions,
  },
  {
    id: 'linear',
    name: 'Linear test map',
    description: '256x24 map with 2 cities and no obstacles.',
    map: linearWithRegions,
  },
];

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
