import { CFG } from './Config';
import type { City } from './types';
import type { SideFieldMap } from './sides';
import { requireSide } from './sides';

export function seedInitialResource(
  cities: City[],
  width: number,
  control: Float32Array,
  terrainBlocked: Uint8Array,
  sides: SideFieldMap,
): void {
  const index = (x: number, y: number) => y * width + x;

  for (const city of cities) {
    const i = index(city.x, city.y);
    if (terrainBlocked[i] !== 0) continue;
    requireSide(sides, city.owner).war[i] += city.baseProduction * CFG.initialCityResourceSeconds;
  }

  const blue = requireSide(sides, 'blue');
  const red = requireSide(sides, 'red');
  for (let i = 0; i < control.length; i++) {
    if (terrainBlocked[i] !== 0) continue;
    const proximity = Math.max(0, 1 - Math.abs(control[i]) / 0.82);
    if (proximity <= 0) continue;
    const amount = CFG.initialFrontResource * proximity;
    (control[i] >= 0 ? blue : red).war[i] += amount;
  }
}
