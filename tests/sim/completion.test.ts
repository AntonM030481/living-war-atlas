import { describe, expect, it } from 'vitest';
import { clearPotential, winnerFromControl } from '../../src/sim/completion';
import { createSideFieldMap } from '../../src/sim/sides';

describe('simulation completion', () => {
  it('returns no winner while both sides control territory', () => {
    expect(winnerFromControl(
      new Float32Array([0.8, 0.2, -0.1, -0.9]),
      new Uint8Array(4),
    )).toBeNull();
  });

  it('returns the only side controlling non-blocked territory', () => {
    expect(winnerFromControl(
      new Float32Array([0.8, 0.2, -0.9]),
      new Uint8Array([0, 0, 1]),
    )).toBe('blue');
  });

  it('does not invent a winner when all accessible cells are neutral', () => {
    expect(winnerFromControl(
      new Float32Array([0, 0, -0.9]),
      new Uint8Array([0, 0, 1]),
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
