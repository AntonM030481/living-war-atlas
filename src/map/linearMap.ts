import { CFG } from '../sim/Config';
import type { MapDefinition } from '../sim/types';

const S = CFG.spatialScale;
const sc = (value: number): number => value * S;

// A deliberately narrow, obstacle-free theatre for fast checks of resource
// transport and front behaviour. The small height makes it close to 1D while
// still exercising the normal 2D simulation and renderer.
export const linearMap: MapDefinition = {
  width: CFG.width,
  height: sc(12),
  initialFrontX: () => CFG.width * 0.5,
  riverX: () => -sc(100),
  forests: [],
  seedInitialResource: false,
  cities: [
    { id: 'b1', name: 'Blue', x: sc(20), y: sc(6), baseProduction: 6, owner: 'blue', integration: 1 },
    { id: 'r1', name: 'Red', x: sc(108), y: sc(6), baseProduction: 6, owner: 'red', integration: 1 },
  ],
};
