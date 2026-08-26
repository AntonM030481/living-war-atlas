import type { MapDefinition } from '../sim/types';
import { blockedPerimeter } from './terrain';

const width = 48;
const height = 24;

export const smallLinearMap: MapDefinition = {
  width,
  height,
  initialFrontX: () => width * 0.5,
  rivers: [],
  forests: [],
  terrainAt: blockedPerimeter(width, height),
  seedInitialResource: false,
  cities: [
    { id: 'b1', name: 'Blue', x: 8, y: 12, baseProduction: 6, owner: 'blue', integration: 1 },
    { id: 'r1', name: 'Red', x: 39, y: 12, baseProduction: 6, owner: 'red', integration: 1 },
  ],
};