import { describe, expect, it } from 'vitest';
import { createSideFieldMap, requireSide } from '../../src/sim/sides';

describe('side fields', () => {
  it('allocates independent fields for arbitrary side ids', () => {
    const sides = createSideFieldMap(['blue', 'red', 'green'], 4);

    requireSide(sides, 'green').war[1] = 7;

    expect(sides.green.war[1]).toBe(7);
    expect(sides.blue.war[1]).toBe(0);
    expect(sides.red.war[1]).toBe(0);
  });

  it('rejects an unknown side', () => {
    const sides = createSideFieldMap(['blue'], 1);
    expect(() => requireSide(sides, 'red')).toThrow('Unknown side: red');
  });
});
