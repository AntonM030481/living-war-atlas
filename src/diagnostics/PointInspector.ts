import { CFG } from '../sim/Config';
import type { SimulationSnapshot } from '../sim/types';
import { sideAccess } from '../sim/transport';
import type { PointDebugInfo } from './types';

function isFrontCell(snapshot: SimulationSnapshot, index: number): boolean {
  const x = index % snapshot.width;
  const y = Math.floor(index / snapshot.width);
  const px = snapshot.width > CFG.frontBoundaryPadding * 2 + 1 ? CFG.frontBoundaryPadding : 0;
  const py = snapshot.height > CFG.frontBoundaryPadding * 2 + 1 ? CFG.frontBoundaryPadding : 0;
  if (x < px || y < py || x >= snapshot.width - px || y >= snapshot.height - py) return false;

  const control = snapshot.control[index];
  if (Math.abs(control) <= CFG.frontBand) return true;
  if (x > 0 && control * snapshot.control[index - 1] <= 0) return true;
  if (x + 1 < snapshot.width && control * snapshot.control[index + 1] <= 0) return true;
  if (y > 0 && control * snapshot.control[index - snapshot.width] <= 0) return true;
  if (y + 1 < snapshot.height && control * snapshot.control[index + snapshot.width] <= 0) return true;
  return false;
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
  const reserveBlue = Math.max(0, warBlue - committedBlue);
  const reserveRed = Math.max(0, warRed - committedRed);
  const capacity = isFrontCell(snapshot, index)
    ? CFG.resourceFrontCellCapacity
    : CFG.resourceCellCapacity;

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
    reserveBlue,
    reserveRed,
    incomingBlue: snapshot.incomingBlue[index],
    incomingRed: snapshot.incomingRed[index],
    flowBlue: Math.hypot(snapshot.flowBlueX[index], snapshot.flowBlueY[index]),
    flowRed: Math.hypot(snapshot.flowRedX[index], snapshot.flowRedY[index]),
    accessBlue: sideAccess('blue', control),
    accessRed: sideAccess('red', control),
    cellCapacity: capacity,
    freeCapacityBlue: Math.max(0, capacity - Math.max(committedBlue, warBlue)),
    freeCapacityRed: Math.max(0, capacity - Math.max(committedRed, warRed)),
    utilizationBlue: capacity > 0 ? warBlue / capacity : 0,
    utilizationRed: capacity > 0 ? warRed / capacity : 0,
    instabilityBlue: snapshot.instabilityBlue[index],
    instabilityRed: snapshot.instabilityRed[index],
    terrainDefense: snapshot.terrainDefense[index],
    terrainMobility: snapshot.terrainMobility[index],
  };
}
