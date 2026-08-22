import type { Side } from './Config';
import type { City } from './types';

export interface CityUpdateConfig {
  captureThreshold: number;
  integrationPerSecond: number;
  dt: number;
}

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
  warBlue: Float32Array,
  warRed: Float32Array,
  dt: number,
): void {
  for (const city of cities) {
    if (city.enabled === false) continue;
    const index = city.y * width + city.x;
    const amount = city.baseProduction * city.integration * dt;
    const target = city.owner === 'blue' ? warBlue : warRed;
    target[index] += amount;
  }
}

export function toggleCityEnabled(cities: City[], cityId: string): void {
  const city = cities.find((candidate) => candidate.id === cityId);
  if (!city) return;
  city.enabled = !(city.enabled ?? true);
}

export function flipCityOwner(cities: City[], cityId: string): Side | null {
  const city = cities.find((candidate) => candidate.id === cityId);
  if (!city) return null;
  city.owner = city.owner === 'blue' ? 'red' : 'blue';
  city.integration = 0;
  return city.owner;
}
