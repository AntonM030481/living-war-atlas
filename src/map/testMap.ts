import { CFG } from '../sim/Config';
import type { MapDefinition } from '../sim/types';

const S = CFG.spatialScale;
const sc = (value: number): number => value * S;

// One deliberately asymmetric theatre: a northern salient, a central river
// crossing and a southern constriction. It is meant to expose different kinds
// of front behaviour on the same screen rather than look procedurally neutral.
export const testMap: MapDefinition = {
  width: CFG.width,
  height: CFG.height,
  initialFrontX: (y) => {
    const yy = y / S;
    const base = CFG.width * 0.50;
    const northernSalient = sc(6.5) * Math.exp(-(((yy - 17) / 8.5) ** 2));
    const centralDent = sc(-5.0) * Math.exp(-(((yy - 41) / 7.0) ** 2));
    const southernSalient = sc(4.0) * Math.exp(-(((yy - 64) / 8.0) ** 2));
    const texture = sc(1.2) * Math.sin(yy / 5.8) - sc(0.7) * Math.sin(yy / 2.9);
    return base + northernSalient + centralDent + southernSalient + texture;
  },
  riverX: (y) => {
    const yy = y / S;
    return (
    CFG.width * 0.535
    + sc(4.8) * Math.sin(yy / 13.0 + 0.4)
    - sc(2.2) * Math.exp(-(((yy - 43) / 8.0) ** 2))
    );
  },
  mountains: [
    { x: sc(49), y: sc(18), r: sc(8) },
    { x: sc(52), y: sc(67), r: sc(9) },
    { x: sc(78), y: sc(25), r: sc(8) },
    { x: sc(86), y: sc(61), r: sc(10) },
  ],
  cities: [
    { id: 'b1', name: 'Arden',  x: sc(14), y: sc(14), baseProduction: 3.0, owner: 'blue', integration: 1 },
    { id: 'b2', name: 'Mirov',  x: sc(34), y: sc(36), baseProduction: 4.8, owner: 'blue', integration: 1 },
    { id: 'b3', name: 'Velin',  x: sc(17), y: sc(64), baseProduction: 3.2, owner: 'blue', integration: 1 },
    { id: 'b4', name: 'Karsk',  x: sc(51), y: sc(11), baseProduction: 2.3, owner: 'blue', integration: 1 },
    { id: 'b5', name: 'Dorna',  x: sc(49), y: sc(59), baseProduction: 5.4, owner: 'blue', integration: 1 },

    { id: 'r1', name: 'Orlov',  x: sc(113), y: sc(12), baseProduction: 3.7, owner: 'red', integration: 1 },
    { id: 'r2', name: 'Tarna',  x: sc(101), y: sc(36), baseProduction: 5.0, owner: 'red', integration: 1 },
    { id: 'r3', name: 'Sevra',  x: sc(113), y: sc(67), baseProduction: 3.1, owner: 'red', integration: 1 },
    { id: 'r4', name: 'Belgor', x: sc(80), y: sc(15), baseProduction: 2.8, owner: 'red', integration: 1 },
    { id: 'r5', name: 'Radin',  x: sc(84), y: sc(58), baseProduction: 4.3, owner: 'red', integration: 1 },
  ],
};
