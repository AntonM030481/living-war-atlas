import { CFG } from '../sim/Config';
import type { SimulationSnapshot } from '../sim/types';
import { sideAccess } from '../sim/transport';
import type { PointDebugInfo } from './types';

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
  const capacity = CFG.resourceCellCapacity;

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
