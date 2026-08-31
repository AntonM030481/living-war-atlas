import { CFG, type Side } from './Config';
import { requireSide, type SideFieldMap } from './sides';
import type { City } from './types';

export interface CityUpdateConfig {
  captureThreshold: number;
  integrationPerSecond: number;
  dt: number;
}

/** Current binary territorial-control adapter. */
export function updateCities(
  cities: City[],
  control: Float32Array,
  width: number,
  config: CityUpdateConfig,
): void {
  for (const city of cities) {
    const c = control[city.y * width + city.x];
    if (city.owner === 'blue' && c < -config.captureThreshold) {
      city.owner = 'red';
      city.integration = 0;
    } else if (city.owner === 'red' && c > config.captureThreshold) {
      city.owner = 'blue';
      city.integration = 0;
    }

    const secure = city.owner === 'blue'
      ? c > config.captureThreshold
      : c < -config.captureThreshold;
    if (secure) {
      city.integration = Math.min(1, city.integration + config.integrationPerSecond * config.dt);
    }
  }
}

export function generateCityResource(
  cities: readonly City[],
  width: number,
  sides: SideFieldMap,
  dt: number,
): void {
  for (const city of cities) {
    if (city.enabled === false) continue;
    const index = city.y * width + city.x;
    const amount = city.baseProduction * city.integration * dt;
    const war = requireSide(sides, city.owner).war;
    war[index] = Math.min(CFG.resourceCellCapacity, war[index] + amount);
  }
}

export function setCityEnabled(cities: City[], cityId: string, enabled: boolean): boolean {
  const city = cities.find((candidate) => candidate.id === cityId);
  if (!city) return false;
  city.enabled = enabled;
  return true;
}

export function toggleCityEnabled(cities: City[], cityId: string): void {
  const city = cities.find((candidate) => candidate.id === cityId);
  if (!city) return;
  city.enabled = !(city.enabled ?? true);
}

export function setCityOwner(
  cities: City[],
  cityId: string,
  owner: Side,
  integration = 1,
): boolean {
  const city = cities.find((candidate) => candidate.id === cityId);
  if (!city) return false;
  city.owner = owner;
  city.enabled = true;
  city.integration = Math.max(0, Math.min(1, integration));
  return true;
}

/** Debug helper for the current two-side map. */
export function flipCityOwner(cities: City[], cityId: string): Side | null {
  const city = cities.find((candidate) => candidate.id === cityId);
  if (!city) return null;
  city.owner = city.owner === 'blue' ? 'red' : 'blue';
  city.enabled = true;
  city.integration = 1;
  return city.owner;
}
