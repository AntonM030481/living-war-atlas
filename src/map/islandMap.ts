import { CFG } from '../sim/Config';
import type { MapDefinition, TerrainType } from '../sim/types';

const width = CFG.width;
const height = CFG.height;

interface Circle { x: number; y: number; r: number }

const mountains: Circle[] = [
  // Dense north-west chain from the reference: it creates a long hooked route
  // around the mountains instead of a straight west-east approach.
  { x: 47, y: 27, r: 11 },
  { x: 57, y: 39, r: 13 },
  { x: 67, y: 54, r: 10 },
  { x: 43, y: 70, r: 8 },

  // Interior massifs. Their spacing deliberately leaves several broad corridors
  // plus a few local choke points, rather than partitioning the map into rooms.
  { x: 94, y: 30, r: 8 },
  { x: 117, y: 69, r: 8 },
  { x: 157, y: 42, r: 9 },
  { x: 194, y: 59, r: 11 },
  { x: 218, y: 100, r: 9 },
  { x: 180, y: 120, r: 8 },
  { x: 137, y: 132, r: 9 },
  { x: 82, y: 122, r: 10 },
  { x: 45, y: 111, r: 8 },
];

// One connected mainland. Only a thin rim is sea; most screen space remains
// playable because external water has no simulation value.
function isLand(x: number, y: number): boolean {
  const nx = (x - width * 0.50) / (width * 0.492);
  const ny = (y - height * 0.50) / (height * 0.492);
  const angle = Math.atan2(ny, nx);
  const radial = Math.hypot(nx, ny);
  const edge = 1
    + 0.040 * Math.sin(angle * 5 + 0.7)
    + 0.026 * Math.sin(angle * 9 - 1.1)
    + 0.015 * Math.sin(angle * 15 + 0.4);

  if (radial > edge) return false;

  // Shallow coastal bites reproduce the irregular outline without generating
  // islands or wasting a large part of the map on water.
  const northEastBay = x > 219 && y > 24 && y < 57 && x > 235 - Math.abs(y - 40) * 0.40;
  const eastBay = x > 222 && y > 65 && y < 101 && x > 240 - Math.abs(y - 83) * 0.34;
  const southEastBay = x > 219 && y > 125 && x > 231 + (y - 125) * 0.46;
  const westBay = x < 24 && y > 79 && y < 111 && x < 15 + Math.abs(y - 95) * 0.27;
  return !(northEastBay || eastBay || southEastBay || westBay);
}

function insideMountain(x: number, y: number): boolean {
  for (const mountain of mountains) {
    const dx = (x - mountain.x) / mountain.r;
    const dy = (y - mountain.y) / (mountain.r * 0.78);
    const wobble = 0.10 * Math.sin(x * 0.31 + y * 0.17);
    if (dx * dx + dy * dy < 1 + wobble) return true;
  }
  return false;
}

function terrainAt(x: number, y: number): TerrainType {
  return !isLand(x, y) || insideMountain(x, y) ? 'blocked' : 'open';
}

export const islandMap: MapDefinition = {
  width,
  height,
  initialFrontX: (y) => width * 0.50 + 8 * Math.sin(y / 17) - 4 * Math.sin(y / 7.5),
  riverX: () => -100,
  forests: [
    { x: 102, y: 48, r: 8 },
    { x: 136, y: 48, r: 7 },
    { x: 174, y: 74, r: 8 },
    { x: 92, y: 91, r: 7 },
    { x: 151, y: 94, r: 9 },
    { x: 199, y: 88, r: 6 },
  ],
  terrainAt,
  cities: [
    { id: 'ib1', name: 'Norden', x: 79, y: 42, baseProduction: 2, owner: 'blue', integration: 1 },
    { id: 'ib2', name: 'Westhaven', x: 35, y: 91, baseProduction: 2, owner: 'blue', integration: 1 },
    { id: 'ib3', name: 'Aster', x: 89, y: 105, baseProduction: 3, owner: 'blue', integration: 1 },
    { id: 'ib4', name: 'Meren', x: 111, y: 84, baseProduction: 2, owner: 'blue', integration: 1 },
    { id: 'ib5', name: 'Southwatch', x: 106, y: 143, baseProduction: 1, owner: 'blue', integration: 1 },
    { id: 'ir1', name: 'Varda', x: 145, y: 25, baseProduction: 2, owner: 'red', integration: 1 },
    { id: 'ir2', name: 'Eastport', x: 213, y: 40, baseProduction: 2, owner: 'red', integration: 1 },
    { id: 'ir3', name: 'Roven', x: 173, y: 83, baseProduction: 3, owner: 'red', integration: 1 },
    { id: 'ir4', name: 'Kelm', x: 206, y: 128, baseProduction: 2, owner: 'red', integration: 1 },
    { id: 'ir5', name: 'Saren', x: 158, y: 143, baseProduction: 1, owner: 'red', integration: 1 },
  ],
};
