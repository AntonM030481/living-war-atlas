import { CFG } from '../sim/Config';
import type { MapDefinition } from '../sim/types';
import { blockedPerimeter } from './terrain';

const S = CFG.spatialScale;
const sc = (value: number): number => value * S;
const width = CFG.width;
const height = sc(12);

export const linearMap: MapDefinition = {
  width,
  height,
  initialFrontX: () => width * 0.5,
  rivers: [],
  forests: [],
  terrainAt: blockedPerimeter(width, height),
  seedInitialResource: false,
  cities: [
    { id: 'b1', name: 'Blue', x: sc(20), y: sc(6), baseProduction: 6, owner: 'blue', integration: 1 },
    { id: 'r1', name: 'Red', x: sc(108), y: sc(6), baseProduction: 6, owner: 'red', integration: 1 },
  ],
  regions: [
    { id: 'blue-country', cityId: 'b1' },
    { id: 'red-country', cityId: 'r1' },
  ],
  regionAt: (x) => x < width * 0.5 ? 'blue-country' : 'red-country',
};