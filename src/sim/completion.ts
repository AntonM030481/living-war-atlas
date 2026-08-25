import { RESOURCE_EPS, type Side } from './Config';
import type { SideFieldMap } from './sides';
import type { City } from './types';

function hasControlledTerritory(side: Side, control: Float32Array, terrainBlocked: Uint8Array): boolean {
  for (let i = 0; i < control.length; i++) {
    if (terrainBlocked[i]) continue;
    if (side === 'blue' ? control[i] > 0 : control[i] < 0) return true;
  }
  return false;
}

function hasControlledCity(side: Side, cities: readonly City[]): boolean {
  return cities.some((city) => city.owner === side);
}

function hasForce(side: Side, sides: SideFieldMap): boolean {
  let total = 0;
  for (const value of sides[side].war) total += value;
  return total > RESOURCE_EPS;
}

export function winnerFromState(
  control: Float32Array,
  terrainBlocked: Uint8Array,
  cities: readonly City[],
  sides: SideFieldMap,
): Side | null {
  const blueDefeated = !hasControlledTerritory('blue', control, terrainBlocked)
    && !hasControlledCity('blue', cities)
    && !hasForce('blue', sides);
  const redDefeated = !hasControlledTerritory('red', control, terrainBlocked)
    && !hasControlledCity('red', cities)
    && !hasForce('red', sides);

  if (blueDefeated === redDefeated) return null;
  return blueDefeated ? 'red' : 'blue';
}

export function clearPotential(sides: SideFieldMap): void {
  for (const side of Object.values(sides)) side.potential.fill(0);
}
