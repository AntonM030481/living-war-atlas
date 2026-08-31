import type { Side } from './Config';
import type { City } from './types';

export type InitialOwnershipPolicy = 'authored' | 'balanced-random';

function nextRandom(state: { value: number }): number {
  let x = state.value >>> 0 || 0x9e3779b9;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  state.value = x >>> 0;
  return state.value / 0x1_0000_0000;
}

function shuffleEqualProduction(cities: City[], seed: number): City[] {
  const result: City[] = [];
  const rng = { value: seed >>> 0 };
  const productions = [...new Set(cities.map((city) => city.baseProduction))]
    .sort((a, b) => b - a);

  for (const production of productions) {
    const group = cities.filter((city) => city.baseProduction === production);
    for (let i = group.length - 1; i > 0; i--) {
      const j = Math.floor(nextRandom(rng) * (i + 1));
      [group[i], group[j]] = [group[j], group[i]];
    }
    result.push(...group);
  }

  return result;
}

export function assignBalancedRandomOwnership(
  cities: readonly City[],
  seed: number,
): City[] {
  const ordered = shuffleEqualProduction(cities.map((city) => ({ ...city })), seed ^ 0x6d2b79f5);
  const totals: Record<Side, number> = { blue: 0, red: 0 };
  const rng = { value: (seed ^ 0xa511e9b3) >>> 0 };

  for (const city of ordered) {
    let owner: Side;
    if (totals.blue < totals.red) owner = 'blue';
    else if (totals.red < totals.blue) owner = 'red';
    else owner = nextRandom(rng) < 0.5 ? 'blue' : 'red';

    city.owner = owner;
    city.integration = 1;
    totals[owner] += city.baseProduction;
  }

  return ordered
    .sort((a, b) => cities.findIndex((city) => city.id === a.id) - cities.findIndex((city) => city.id === b.id));
}

export function applyInitialOwnership(
  cities: readonly City[],
  policy: InitialOwnershipPolicy,
  seed: number,
): City[] {
  return policy === 'balanced-random'
    ? assignBalancedRandomOwnership(cities, seed)
    : cities.map((city) => ({ ...city }));
}
