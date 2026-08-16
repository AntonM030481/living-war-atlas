import { CFG } from '../sim/Config';
import type { MapDefinition } from '../sim/types';

// One deliberately asymmetric theatre: a northern salient, a central river
// crossing and a southern constriction. It is meant to expose different kinds
// of front behaviour on the same screen rather than look procedurally neutral.
export const testMap: MapDefinition = {
  width: CFG.width,
  height: CFG.height,
  initialFrontX: (y) => {
    const base = CFG.width * 0.50;
    const northernSalient = 6.5 * Math.exp(-(((y - 17) / 8.5) ** 2));
    const centralDent = -5.0 * Math.exp(-(((y - 41) / 7.0) ** 2));
    const southernSalient = 4.0 * Math.exp(-(((y - 64) / 8.0) ** 2));
    const texture = 1.2 * Math.sin(y / 5.8) - 0.7 * Math.sin(y / 2.9);
    return base + northernSalient + centralDent + southernSalient + texture;
  },
  riverX: (y) =>
    CFG.width * 0.535
    + 4.8 * Math.sin(y / 13.0 + 0.4)
    - 2.2 * Math.exp(-(((y - 43) / 8.0) ** 2)),
  mountains: [
    { x: 49, y: 18, r: 8 },
    { x: 52, y: 67, r: 9 },
    { x: 78, y: 25, r: 8 },
    { x: 86, y: 61, r: 10 },
  ],
  cities: [
    { id: 'b1', name: 'Arden',  x: 14, y: 14, baseProduction: 3.0, owner: 'blue', integration: 1 },
    { id: 'b2', name: 'Mirov',  x: 34, y: 36, baseProduction: 4.8, owner: 'blue', integration: 1 },
    { id: 'b3', name: 'Velin',  x: 17, y: 64, baseProduction: 3.2, owner: 'blue', integration: 1 },
    { id: 'b4', name: 'Karsk',  x: 51, y: 11, baseProduction: 2.3, owner: 'blue', integration: 1 },
    { id: 'b5', name: 'Dorna',  x: 49, y: 59, baseProduction: 5.4, owner: 'blue', integration: 1 },

    { id: 'r1', name: 'Orlov',  x: 113, y: 12, baseProduction: 3.7, owner: 'red', integration: 1 },
    { id: 'r2', name: 'Tarna',  x: 101, y: 36, baseProduction: 5.0, owner: 'red', integration: 1 },
    { id: 'r3', name: 'Sevra',  x: 113, y: 67, baseProduction: 3.1, owner: 'red', integration: 1 },
    { id: 'r4', name: 'Belgor', x: 80, y: 15, baseProduction: 2.8, owner: 'red', integration: 1 },
    { id: 'r5', name: 'Radin',  x: 84, y: 58, baseProduction: 4.3, owner: 'red', integration: 1 },
  ],
};
