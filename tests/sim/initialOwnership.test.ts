import { describe, expect, it } from 'vitest';
import { assignBalancedRandomOwnership } from '../../src/sim/initialOwnership';
import type { City } from '../../src/sim/types';

function city(id: string, baseProduction: number): City {
  return {
    id,
    name: id,
    x: Number(id.replace(/\D/g, '')) || 0,
    y: 0,
    baseProduction,
    owner: 'blue',
    integration: 1,
  };
}

function totals(cities: readonly City[]): { blue: number; red: number } {
  return cities.reduce(
    (sum, item) => {
      sum[item.owner] += item.baseProduction;
      return sum;
    },
    { blue: 0, red: 0 },
  );
}

describe('balanced randomized initial ownership', () => {
  it('greedily gives each descending source to the currently weaker side', () => {
    const assigned = assignBalancedRandomOwnership([
      city('c1', 3),
      city('c2', 3),
      city('c3', 3),
      city('c4', 2),
      city('c5', 2),
    ], 17);

    // Three equal 3-point sources leave one side at 6 vs 3. With no more
    // threes, that weaker side receives the next two 2-point sources.
    expect(Object.values(totals(assigned)).sort((a, b) => a - b)).toEqual([6, 7]);

    const twoPointOwners = assigned
      .filter((item) => item.baseProduction === 2)
      .map((item) => item.owner);
    expect(new Set(twoPointOwners).size).toBe(1);
  });

  it('is deterministic for one seed but can randomize equivalent assignments across seeds', () => {
    const source = Array.from({ length: 8 }, (_, index) => city(`c${index + 1}`, 2));
    const first = assignBalancedRandomOwnership(source, 1).map((item) => item.owner);
    const repeated = assignBalancedRandomOwnership(source, 1).map((item) => item.owner);
    const second = assignBalancedRandomOwnership(source, 2).map((item) => item.owner);

    expect(repeated).toEqual(first);
    expect(second).not.toEqual(first);
    expect(totals(assignBalancedRandomOwnership(source, 1))).toEqual({ blue: 8, red: 8 });
  });

  it('does not mutate authored city definitions', () => {
    const source = [city('c1', 3), city('c2', 2), city('c3', 1)];
    source[1].owner = 'red';

    assignBalancedRandomOwnership(source, 123);

    expect(source.map((item) => item.owner)).toEqual(['blue', 'red', 'blue']);
  });
});
