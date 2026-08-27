import { CFG } from '../sim/Config';
import type { MapDefinition, TerrainRegion, TerrainType } from '../sim/types';
import { pointInTerrainRegion } from './terrain';

const width = CFG.width;
const height = CFG.height;

const mountains: TerrainRegion[] = [
  { x: 36, y: 18, r: 16 }, { x: 52, y: 42, r: 12 }, { x: 23, y: 66, r: 11 },
  { x: 84, y: 14, r: 10 }, { x: 110, y: 62, r: 9 }, { x: 166, y: 28, r: 11 },
  { x: 212, y: 52, r: 14 }, { x: 238, y: 101, r: 12 }, { x: 190, y: 124, r: 10 },
  { x: 139, y: 138, r: 11 }, { x: 71, y: 126, r: 12 }, { x: 26, y: 114, r: 10 },
];

function terrainAt(x: number, y: number): TerrainType {
  if (x === 0 || y === 0 || x === width - 1 || y === height - 1) return 'blocked';
  if (mountains.some((mountain) => pointInTerrainRegion(x, y, mountain))) return 'mountain';
  return 'open';
}

// A diagonal trunk routed through the valleys rather than through the mountain
// massifs. The bend around the central and south-eastern ranges is intentional.
const mainRiver = [
  { x: 40, y: 0 }, { x: 62, y: 18 }, { x: 80, y: 38 }, { x: 94, y: 50 },
  { x: 95, y: 62 }, { x: 104, y: 74 }, { x: 126, y: 88 }, { x: 148, y: 102 },
  { x: 165, y: 116 }, { x: 173, y: 132 }, { x: 193, y: 146 }, { x: 220, y: 159 },
];

// Long western tributary. It joins the trunk just after the central mountain
// range and stays in the open corridor between the western massifs.
const westTributary = [
  { x: 3, y: 43 }, { x: 25, y: 47 }, { x: 48, y: 53 },
  { x: 70, y: 60 }, { x: 90, y: 68 }, { x: 104, y: 74 },
];

// Shorter eastern tributary deliberately skirts north of the large eastern
// massif before turning south-west to the main river.
const eastTributary = [
  { x: 253, y: 74 }, { x: 244, y: 78 }, { x: 232, y: 82 }, { x: 218, y: 88 },
  { x: 204, y: 96 }, { x: 190, y: 105 }, { x: 176, y: 111 }, { x: 165, y: 116 },
];

export const islandMap: MapDefinition = {
  width,
  height,
  initialControl: 'city-distance',
  rivers: [mainRiver, westTributary, eastTributary],
  forests: [
    { x: 95, y: 36, r: 10 }, { x: 137, y: 35, r: 9 }, { x: 183, y: 65, r: 10 },
    { x: 82, y: 89, r: 9 }, { x: 156, y: 92, r: 11 }, { x: 215, y: 86, r: 7 },
    { x: 53, y: 25, r: 8 }, { x: 67, y: 54, r: 7 }, { x: 27, y: 82, r: 7 },
    { x: 99, y: 49, r: 7 }, { x: 151, y: 43, r: 8 }, { x: 195, y: 40, r: 7 },
    { x: 225, y: 72, r: 8 }, { x: 210, y: 113, r: 8 }, { x: 158, y: 125, r: 7 },
    { x: 91, y: 135, r: 8 }, { x: 48, y: 126, r: 7 },
  ],
  mountains,
  terrainAt,
  cities: [
    { id: 'i1', name: 'Norden', x: 68, y: 28, baseProduction: 2, owner: 'blue', integration: 1 },
    { id: 'i2', name: 'Varda', x: 150, y: 12, baseProduction: 2, owner: 'red', integration: 1 },
    { id: 'i3', name: 'Eastport', x: 220, y: 29, baseProduction: 2, owner: 'blue', integration: 1 },
    { id: 'i4', name: 'Westhaven', x: 33, y: 90, baseProduction: 2, owner: 'red', integration: 1 },
    { id: 'i5', name: 'Meren', x: 107, y: 79, baseProduction: 2, owner: 'blue', integration: 1 },
    { id: 'i6', name: 'Roven', x: 183, y: 79, baseProduction: 3, owner: 'red', integration: 1 },
    { id: 'i7', name: 'Aster', x: 79, y: 106, baseProduction: 3, owner: 'red', integration: 1 },
    { id: 'i8', name: 'Kelm', x: 218, y: 131, baseProduction: 2, owner: 'blue', integration: 1 },
    { id: 'i9', name: 'Southwatch', x: 101, y: 146, baseProduction: 1, owner: 'blue', integration: 1 },
    { id: 'i10', name: 'Saren', x: 161, y: 146, baseProduction: 1, owner: 'red', integration: 1 },
  ],
};
