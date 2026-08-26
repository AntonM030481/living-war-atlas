import type { MapDefinition, TerrainType } from '../sim/types';

// Tightly cropped around the playable area. There is no sea terrain on this
// map: the canvas edge itself is the world boundary.
const width = 208;
const height = 128;

interface Circle { x: number; y: number; r: number }

const mountains: Circle[] = [
  { x: 29, y: 14, r: 13 },
  { x: 42, y: 34, r: 10 },
  { x: 19, y: 53, r: 9 },
  { x: 68, y: 11, r: 8 },
  { x: 89, y: 50, r: 7 },
  { x: 135, y: 22, r: 9 },
  { x: 172, y: 42, r: 11 },
  { x: 193, y: 81, r: 10 },
  { x: 154, y: 99, r: 8 },
  { x: 113, y: 110, r: 9 },
  { x: 58, y: 101, r: 10 },
  { x: 21, y: 91, r: 8 },
];

function terrainAt(x: number, y: number): TerrainType {
  if (x === 0 || y === 0 || x === width - 1 || y === height - 1) return 'blocked';

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
    { x: 77, y: 29, r: 8 },
    { x: 111, y: 28, r: 7 },
    { x: 149, y: 52, r: 8 },
    { x: 67, y: 71, r: 7 },
    { x: 127, y: 74, r: 9 },
    { x: 175, y: 69, r: 6 },
  ],
  terrainAt,
  // Ownership intentionally alternates geographically. The city-distance
  // initializer turns these seeds into a patchwork with several enclaves.
  cities: [
    { id: 'i1', name: 'Norden', x: 55, y: 22, baseProduction: 2, owner: 'blue', integration: 1 },
    { id: 'i2', name: 'Varda', x: 122, y: 10, baseProduction: 2, owner: 'red', integration: 1 },
    { id: 'i3', name: 'Eastport', x: 179, y: 23, baseProduction: 2, owner: 'blue', integration: 1 },
    { id: 'i4', name: 'Westhaven', x: 27, y: 72, baseProduction: 2, owner: 'red', integration: 1 },
    { id: 'i5', name: 'Meren', x: 87, y: 63, baseProduction: 2, owner: 'blue', integration: 1 },
    { id: 'i6', name: 'Roven', x: 149, y: 63, baseProduction: 3, owner: 'red', integration: 1 },
    { id: 'i7', name: 'Aster', x: 64, y: 85, baseProduction: 3, owner: 'red', integration: 1 },
    { id: 'i8', name: 'Kelm', x: 177, y: 105, baseProduction: 2, owner: 'blue', integration: 1 },
    { id: 'i9', name: 'Southwatch', x: 82, y: 117, baseProduction: 1, owner: 'blue', integration: 1 },
    { id: 'i10', name: 'Saren', x: 131, y: 117, baseProduction: 1, owner: 'red', integration: 1 },
  ],
};
