import type { SimulationSnapshot } from '../sim/types';
import type { CityDiagnostic } from './types';

function localWeightedSum(
  snapshot: SimulationSnapshot,
  field: Float32Array,
  cx: number,
  cy: number,
  radius: number,
): number {
  let sum = 0;
  const minY = Math.max(0, Math.floor(cy - radius));
  const maxY = Math.min(snapshot.height - 1, Math.ceil(cy + radius));
  const minX = Math.max(0, Math.floor(cx - radius));
  const maxX = Math.min(snapshot.width - 1, Math.ceil(cx + radius));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > radius * radius) continue;
      const weight = 1 - Math.sqrt(d2) / radius;
      sum += field[y * snapshot.width + x] * weight;
    }
  }
  return sum;
}

function localFlowSum(
  snapshot: SimulationSnapshot,
  flowX: Float32Array,
  flowY: Float32Array,
  cx: number,
  cy: number,
  radius: number,
): number {
  let sum = 0;
  const minY = Math.max(0, Math.floor(cy - radius));
  const maxY = Math.min(snapshot.height - 1, Math.ceil(cy + radius));
  const minX = Math.max(0, Math.floor(cx - radius));
  const maxX = Math.min(snapshot.width - 1, Math.ceil(cx + radius));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > radius * radius) continue;
      const index = y * snapshot.width + x;
      const weight = 1 - Math.sqrt(d2) / radius;
      sum += Math.hypot(flowX[index], flowY[index]) * weight;
    }
  }
  return sum;
}

export function buildCityDiagnostics(snapshot: SimulationSnapshot): CityDiagnostic[] {
  return snapshot.cities.map((city) => {
    const index = city.y * snapshot.width + city.x;
    const war = city.owner === 'blue' ? snapshot.warBlue : snapshot.warRed;
    const flowX = city.owner === 'blue' ? snapshot.flowBlueX : snapshot.flowRedX;
    const flowY = city.owner === 'blue' ? snapshot.flowBlueY : snapshot.flowRedY;
    const cellWar = war[index];
    const localWar = localWeightedSum(snapshot, war, city.x, city.y, 5);
    const cellFlow = Math.hypot(flowX[index], flowY[index]);
    const localFlow = localFlowSum(snapshot, flowX, flowY, city.x, city.y, 5);
    const production = city.enabled === false ? 0 : city.baseProduction * city.integration;
    return {
      cityName: city.name,
      production,
      cellWar,
      localWar,
      cellFlow,
      localFlow,
      weak: production > 0 && localWar < 0.5 && localFlow < 0.05,
    };
  });
}
