import { describe, expect, it } from 'vitest';
import { clearPotential, winnerFromState } from '../../src/sim/completion';
import { createSideFieldMap } from '../../src/sim/sides';
import type { City } from '../../src/sim/types';

const blocked = new Uint8Array(4);

function city(owner: 'blue' | 'red'): City {
  return {
    id: owner,
    name: owner,
    x: 0,
    y: 0,
    baseProduction: 1,
    owner,
    integration: 1,
  };
}

describe('simulation completion', () => {
  it('returns no winner while both sides control territory', () => {
    const sides = createSideFieldMap(['blue', 'red'], 4);
    expect(winnerFromState(
      new Float32Array([0.8, 0.2, -0.1, -0.9]),
      blocked,
      [city('blue'), city('red')],
      sides,
    )).toBeNull();
  });

  it('requires territory, cities, and force all to be gone for defeat', () => {
    const control = new Float32Array([0.8, 0.2, 0.1, 0.9]);

    const withCity = createSideFieldMap(['blue', 'red'], 4);
    expect(winnerFromState(control, blocked, [city('blue'), city('red')], withCity)).toBeNull();

    const withForce = createSideFieldMap(['blue', 'red'], 4);
    withForce.red.war[0] = 1;
    expect(winnerFromState(control, blocked, [city('blue')], withForce)).toBeNull();

    const defeated = createSideFieldMap(['blue', 'red'], 4);
    expect(winnerFromState(control, blocked, [city('blue')], defeated)).toBe('blue');
  });

  it('ignores blocked territory when deciding defeat', () => {
    const sides = createSideFieldMap(['blue', 'red'], 3);
    expect(winnerFromState(
      new Float32Array([0.8, 0.2, -0.9]),
      new Uint8Array([0, 0, 1]),
      [city('blue')],
      sides,
    )).toBe('blue');
  });

  it('does not invent a winner when both sides are defeated', () => {
    const sides = createSideFieldMap(['blue', 'red'], 2);
    expect(winnerFromState(
      new Float32Array([0, 0]),
      new Uint8Array(2),
      [],
      sides,
    )).toBeNull();
  });

  it('clears potential for all sides on completion', () => {
    const sides = createSideFieldMap(['blue', 'red'], 3);
    sides.blue.potential.set([1, 2, 3]);
    sides.red.potential.set([3, 2, 1]);

    clearPotential(sides);

    expect([...sides.blue.potential]).toEqual([0, 0, 0]);
    expect([...sides.red.potential]).toEqual([0, 0, 0]);
  });
});
