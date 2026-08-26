import { CFG } from '../sim/Config';
import type { MapDefinition, TerrainType } from '../sim/types';

// Standard theatre size. Geometry is the previous tightly-cropped layout
// stretched to the regular 256x160 simulation canvas.
const width = CFG.width;
const height = CFG.height;

interface Circle { x: number; y: number; r: number }

const mountains: Circle[] = [
  { x: 36, y: 18, r: 16 },
  { x: 52, y: 42, r: 12 },
  { x: 23, y: 66, r: 11 },
  { x: 84, y: 14, r: 10 },
  { x: 110, y: 62, r: 9 },
  { x: 166, y: 28, r: 11 },
  { x: 212, y: 52, r: 14 },
  { x: 238, y: 101, r: 12 },
  { x: 190, y: 124, r: 10 },
  { x: 139, y: 138, r: 11 },
  { x: 71, y: 126, r: 12 },
  { x: 26, y: 114, r: 10 },
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

// Main river runs north-west to south-east. riverX remains the simulation
// representation; riverPaths gives the renderer the full branched geometry.
const riverX = (y: number): number =>
  38 + y * 1.08 + 5.2 * Math.sin(y / 19 + 0.4) + 2.2 * Math.sin(y / 7.8 - 0.6);

const mainRiver = [
  { x: riverX(0), y: 0 },
  { x: riverX(18), y: 18 },
  { x: riverX(38), y: 38 },
  { x: riverX(58), y: 58 },
  { x: riverX(78), y: 78 },
  { x: riverX(98), y: 98 },
  { x: riverX(118), y: 118 },
  { x: riverX(138), y: 138 },
  { x: riverX(159), y: 159 },
];

// Two deliberately asymmetric tributaries: a long shallow western branch and
// a shorter, steeper eastern branch joining farther downstream.
const westTributary = [
  { x: 3, y: 43 },
  { x: 25, y: 47 },
  { x: 48, y: 53 },
  { x: 70, y: 60 },
  { x: 90, y: 68 },
  { x: riverX(75), y: 75 },
];

const eastTributary = [
  { x: 253, y: 88 },
  { x: 235, y: 94 },
  { x: 219, y: 101 },
  { x: 205, y: 108 },
  { x: riverX(116), y: 116 },
];

export const islandMap: MapDefinition = {
  width,
  height,
  initialControl: 'city-distance',
  riverX,
  riverPaths: [mainRiver, westTributary, eastTributary],
  forests: [
    // Original interior forests, stretched with the rest of the theatre.
    { x: 95, y: 36, r: 10 },
    { x: 137, y: 35, r: 9 },
    { x: 183, y: 65, r: 10 },
    { x: 82, y: 89, r: 9 },
    { x: 156, y: 92, r: 11 },
    { x: 215, y: 86, r: 7 },

    // Foothill belts around the main mountain groups. These remain passable,
    // but make approaches to the massifs strategically distinct from open land.
    { x: 53, y: 25, r: 8 },
    { x: 67, y: 54, r: 7 },
    { x: 27, y: 82, r: 7 },
    { x: 99, y: 49, r: 7 },
    { x: 151, y: 43, r: 8 },
    { x: 195, y: 40, r: 7 },
    { x: 225, y: 72, r: 8 },
    { x: 210, y: 113, r: 8 },
    { x: 158, y: 125, r: 7 },
    { x: 91, y: 135, r: 8 },
    { x: 48, y: 126, r: 7 },
  ],
  terrainAt,
  // Ownership intentionally alternates geographically. The city-distance
  // initializer turns these seeds into a patchwork with several enclaves.
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
