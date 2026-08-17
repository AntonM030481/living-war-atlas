import { CFG } from './Config';
import type { Simulation } from './Simulation';

export const FORCED_ENCLAVE_RADIUS = Math.max(4, Math.round(4.5 * CFG.spatialScale));
const ENCLAVE_CORE_SHARE = 0.65;
const ENCLAVE_CONTROL = 0.88;
const ENCLAVE_RESOURCE_SECONDS = 18;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Debug/test action used by the map's right click interaction.
 *
 * Flipping only the city owner is immediately undone by normal capture logic
 * when the surrounding control field still belongs to the old side. Create a
 * small, smooth control island as well so the simulation sees a real closed
 * secondary front and can resolve it normally afterwards.
 */
export function forceCityEnclave(sim: Simulation, cityId: string): boolean {
  const city = sim.cities.find((candidate) => candidate.id === cityId);
  if (!city) return false;

  sim.flipCityOwner(cityId);

  const sign = city.owner === 'blue' ? 1 : -1;
  const coreRadius = FORCED_ENCLAVE_RADIUS * ENCLAVE_CORE_SHARE;
  const minX = Math.max(0, Math.floor(city.x - FORCED_ENCLAVE_RADIUS));
  const maxX = Math.min(sim.width - 1, Math.ceil(city.x + FORCED_ENCLAVE_RADIUS));
  const minY = Math.max(0, Math.floor(city.y - FORCED_ENCLAVE_RADIUS));
  const maxY = Math.min(sim.height - 1, Math.ceil(city.y + FORCED_ENCLAVE_RADIUS));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const distance = Math.hypot(x - city.x, y - city.y);
      if (distance > FORCED_ENCLAVE_RADIUS) continue;

      const index = y * sim.width + x;
      const edgeBlend = smoothstep(coreRadius, FORCED_ENCLAVE_RADIUS, distance);
      const forcedControl = sign * ENCLAVE_CONTROL;
      sim.control[index] = clamp(
        forcedControl * (1 - edgeBlend) + sim.control[index] * edgeBlend,
        -CFG.controlClamp,
        CFG.controlClamp,
      );
    }
  }

  const cityIndex = city.y * sim.width + city.x;
  const friendlyResource = city.owner === 'blue' ? sim.warBlue : sim.warRed;
  friendlyResource[cityIndex] += city.baseProduction * ENCLAVE_RESOURCE_SECONDS;

  return true;
}
