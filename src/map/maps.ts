import type { MapDefinition, MapId } from '../sim/types';
import { islandMap } from './islandMap';
import { linearMap } from './linearMap';
import { testMap } from './testMap';

export interface MapOption {
  id: MapId;
  name: string;
  description: string;
  map: MapDefinition;
}

export const MAP_OPTIONS: readonly MapOption[] = [
  {
    id: 'theatre',
    name: 'Full playground map',
    description: '256x160 map with 10 cities, river and forests.',
    map: testMap,
  },
  {
    id: 'island',
    name: 'Mountain theatre',
    description: '256x160 map with 10 cities, a thin sea boundary and impassable mountain massifs.',
    map: islandMap,
  },
  {
    id: 'linear',
    name: 'Linear test map',
    description: '256x24 map with 2 cities and no obstacles.',
    map: linearMap,
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
