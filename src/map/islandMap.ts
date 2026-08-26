import { CFG } from '../sim/Config';
import type { MapDefinition, TerrainType } from '../sim/types';

const width = CFG.width;
const height = CFG.height;

interface Circle { x: number; y: number; r: number }

const mountains: Circle[] = [
  { x: 53, y: 34, r: 13 },
  { x: 66, y: 54, r: 10 },
  { x: 43, y: 73, r: 9 },
  { x: 92, y: 31, r: 8 },
  { x: 113, y: 70, r: 7 },
  { x: 159, y: 42, r: 9 },
  { x: 196, y: 62, r: 11 },
  { x: 217, y: 101, r: 10 },
  { x: 178, y: 119, r: 8 },
  { x: 137, y: 130, r: 9 },
  { x: 82, y: 121, r: 10 },
  { x: 45, y: 111, r: 8 },
];

// A single connected landmass with a thin sea margin. Bays and mountain
// massifs shape movement while leaving several distinct routes between regions.
function coastAt(x: number, y: number): boolean {
  const nx = (x - width * 0.50) / (width * 0.49);
  const ny = (y - height * 0.50) / (height * 0.49);
  const angle = Math.atan2(ny, nx);
  const radial = Math.hypot(nx, ny);
  const edge = 1
    + 0.035 * Math.sin(angle * 5 + 0.7)
    + 0.025 * Math.sin(angle * 9 - 1.1)
    + 0.015 * Math.sin(angle * 15 + 0.4);

  if (radial > edge) return false;

  const eastBay = x > 213 && y > 34 && y < 68 && x > 232 - Math.abs(y - 51) * 0.44;
  const southEastBay = x > 216 && y > 126 && x > 226 + (y - 126) * 0.52;
  const westBay = x < 25 && y > 80 && y < 108 && x < 14 + Math.abs(y - 94) * 0.34;
  return !(eastBay || southEastBay || westBay);
}

function terrainAt(x: number, y: number): TerrainType {
  if (!coastAt(x, y)) return 'sea';
  for (const mountain of mountains) {
    const dx = (x - mountain.x) / mountain.r;
    const dy = (y - mountain.y) / (mountain.r * 0.78);
    const wobble = 0.10 * Math.sin(x * 0.31 + y * 0.17);
    if (dx * dx + dy * dy < 1 + wobble) return 'mountain';
  }
  return 'open';
}

export const islandMap: MapDefinition = {
  width,
  height,
  initialControl: 'city-distance',
  riverX: () => -100,
  forests: [
    { x: 101, y: 49, r: 8 },
    { x: 135, y: 48, r: 7 },
    { x: 173, y: 72, r: 8 },
    { x: 91, y: 91, r: 7 },
    { x: 151, y: 94, r: 9 },
    { x: 199, y: 89, r: 6 },
  ],
  terrainAt,
  // Ownership intentionally alternates geographically. The city-distance
  // initializer turns these seeds into a patchwork with several enclaves.
  cities: [
    { id: 'i1', name: 'Norden', x: 79, y: 42, baseProduction: 2, owner: 'blue', integration: 1 },
    { id: 'i2', name: 'Varda', x: 146, y: 30, baseProduction: 2, owner: 'red', integration: 1 },
    { id: 'i3', name: 'Eastport', x: 203, y: 43, baseProduction: 2, owner: 'blue', integration: 1 },
    { id: 'i4', name: 'Westhaven', x: 51, y: 92, baseProduction: 2, owner: 'red', integration: 1 },
    { id: 'i5', name: 'Meren', x: 111, y: 83, baseProduction: 2, owner: 'blue', integration: 1 },
    { id: 'i6', name: 'Roven', x: 173, y: 83, baseProduction: 3, owner: 'red', integration: 1 },
    { id: 'i7', name: 'Aster', x: 88, y: 105, baseProduction: 3, owner: 'red', integration: 1 },
    { id: 'i8', name: 'Kelm', x: 201, y: 125, baseProduction: 2, owner: 'blue', integration: 1 },
    { id: 'i9', name: 'Southwatch', x: 106, y: 137, baseProduction: 1, owner: 'blue', integration: 1 },
    { id: 'i10', name: 'Saren', x: 155, y: 137, baseProduction: 1, owner: 'red', integration: 1 },
  ],
};
