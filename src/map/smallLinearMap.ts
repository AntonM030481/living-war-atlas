import type { MapDefinition } from '../sim/types';
import { blockedPerimeter } from './terrain';

const width = 48;
const height = 12;

// Small, valid authored map for fast Simulation integration tests.
export const smallLinearMap: MapDefinition = {
  width,
  height,
  initialFrontX: () => width * 0.5,
  riverX: () => -100,
  forests: [],
  terrainAt: blockedPerimeter(width, height),
  seedInitialResource: false,
  cities: [
    { id: 'b1', name: 'Blue', x: 8, y: 6, baseProduction: 6, owner: 'blue', integration: 1 },
    { id: 'r1', name: 'Red', x: 39, y: 6, baseProduction: 6, owner: 'red', integration: 1 },
  ],
};
