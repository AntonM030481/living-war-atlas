import type { SimulationSnapshot } from '../sim/types';
import { sideAccess } from '../sim/transport';
import type { PointDebugInfo } from './types';

function gradientComponent(
  potential: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number,
  dx: number,
  dy: number,
): number {
  const i = y * width + x;
  const plusX = x + dx;
  const plusY = y + dy;
  const minusX = x - dx;
  const minusY = y - dy;
  const plus = plusX >= 0 && plusX < width && plusY >= 0 && plusY < height
    ? potential[plusY * width + plusX]
    : null;
  const minus = minusX >= 0 && minusX < width && minusY >= 0 && minusY < height
    ? potential[minusY * width + minusX]
    : null;

  if (plus !== null && minus !== null) return (plus - minus) * 0.5;
  if (plus !== null) return plus - potential[i];
  if (minus !== null) return potential[i] - minus;
  return 0;
}

export function inspectPoint(snapshot: SimulationSnapshot, x: number, y: number): PointDebugInfo | null {
  if (x < 0 || y < 0 || x >= snapshot.width || y >= snapshot.height) return null;

  const cellX = Math.max(0, Math.min(snapshot.width - 1, Math.floor(x)));
  const cellY = Math.max(0, Math.min(snapshot.height - 1, Math.floor(y)));
  const index = cellY * snapshot.width + cellX;
  const control = snapshot.control[index];
  const warBlue = snapshot.warBlue[index];
  const warRed = snapshot.warRed[index];
  const committedBlue = snapshot.committedBlue[index];
  const committedRed = snapshot.committedRed[index];

  return {
    x,
    y,
    index,
    cellX,
    cellY,
    control,
    warBlue,
    warRed,
    committedBlue,
    committedRed,
    reserveBlue: Math.max(0, warBlue - committedBlue),
    reserveRed: Math.max(0, warRed - committedRed),
    incomingBlue: snapshot.incomingBlue[index],
    incomingRed: snapshot.incomingRed[index],
    flowBlue: Math.hypot(snapshot.flowBlueX[index], snapshot.flowBlueY[index]),
    flowRed: Math.hypot(snapshot.flowRedX[index], snapshot.flowRedY[index]),
    accessBlue: sideAccess('blue', control),
    accessRed: sideAccess('red', control),
    potentialBlue: snapshot.potentialBlue[index],
    potentialRed: snapshot.potentialRed[index],
    gradientBlueX: gradientComponent(snapshot.potentialBlue, snapshot.width, snapshot.height, cellX, cellY, 1, 0),
    gradientBlueY: gradientComponent(snapshot.potentialBlue, snapshot.width, snapshot.height, cellX, cellY, 0, 1),
    gradientRedX: gradientComponent(snapshot.potentialRed, snapshot.width, snapshot.height, cellX, cellY, 1, 0),
    gradientRedY: gradientComponent(snapshot.potentialRed, snapshot.width, snapshot.height, cellX, cellY, 0, 1),
    instabilityBlue: snapshot.instabilityBlue[index],
    instabilityRed: snapshot.instabilityRed[index],
    terrainDefense: snapshot.terrainDefense[index],
    terrainMobility: snapshot.terrainMobility[index],
  };
}
