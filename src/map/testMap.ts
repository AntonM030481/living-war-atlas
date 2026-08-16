import { CFG } from '../sim/Config';
import type { MapDefinition } from '../sim/types';

export const testMap: MapDefinition = {
  width: CFG.width,
  height: CFG.height,
  initialFrontX: (y) =>
    CFG.width * 0.50
    + 4.4 * Math.sin(y / 10.5)
    - 2.7 * Math.sin(y / 4.8),
  riverX: (y) => CFG.width * 0.53 + 6 * Math.sin(y / 12.5 + 0.5),
  mountains: [
    { x: 35, y: 18, r: 9 },
    { x: 44, y: 66, r: 10 },
    { x: 91, y: 20, r: 10 },
    { x: 101, y: 62, r: 11 },
  ],
  cities: [
    { id: 'b1', name: 'Arden',   x: 15, y: 15, baseProduction: 3.0, owner: 'blue', integration: 1 },
    { id: 'b2', name: 'Mirov',   x: 30, y: 35, baseProduction: 4.6, owner: 'blue', integration: 1 },
    { id: 'b3', name: 'Velin',   x: 18, y: 61, baseProduction: 3.5, owner: 'blue', integration: 1 },
    { id: 'b4', name: 'Karsk',   x: 47, y: 13, baseProduction: 2.2, owner: 'blue', integration: 1 },
    { id: 'b5', name: 'Dorna',   x: 43, y: 57, baseProduction: 5.4, owner: 'blue', integration: 1 },

    { id: 'r1', name: 'Orlov',   x: 113, y: 13, baseProduction: 3.8, owner: 'red', integration: 1 },
    { id: 'r2', name: 'Tarna',   x: 99, y: 35, baseProduction: 5.0, owner: 'red', integration: 1 },
    { id: 'r3', name: 'Sevra',   x: 112, y: 66, baseProduction: 3.0, owner: 'red', integration: 1 },
    { id: 'r4', name: 'Belgor',  x: 80, y: 14, baseProduction: 2.6, owner: 'red', integration: 1 },
    { id: 'r5', name: 'Radin',   x: 85, y: 59, baseProduction: 4.4, owner: 'red', integration: 1 },
  ],
};
