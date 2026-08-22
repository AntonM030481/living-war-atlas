import { describe, expect, it } from 'vitest';
import { resolvePairCombat } from '../../src/sim/combat';
import { createSideFields } from '../../src/sim/sides';

const config = {
  dt: 0.1,
  noiseAmplitude: 0,
  baseProbe: 0.76,
  defenceAdvantage: 1.36,
  instabilityGrow: 0.48,
  instabilityRecover: 0.16,
  collapseEnter: 1,
  collapseExit: 0.48,
  emptyFrontMass: 0.08,
  unopposedTinyMass: 0.025,
  unopposedUsefulMass: 0.35,
  unopposedAdvance: 2.5,
  collapseAdvanceMultiplier: 3,
};

describe('pairwise combat', () => {
  it('produces forcing toward the stronger first side without side ids', () => {
    const first = createSideFields(1);
    const second = createSideFields(1);
    first.mass[0] = 10;
    second.mass[0] = 1;
    const forcing = new Float32Array(1);
    const rawForcing = new Float32Array(1);
    const pressure = new Float32Array(1);

    resolvePairCombat(
      first,
      second,
      { forcing, rawForcing, pressure },
      {
        width: 1,
        height: 1,
        terrainDefense: new Float32Array([1]),
        isFront: () => true,
        addConsumption: () => undefined,
      },
      0,
      1,
      config,
    );

    expect(forcing[0]).toBeGreaterThan(0);
    expect(first.advanceDebug[0]).toBeGreaterThan(second.advanceDebug[0]);
    expect(pressure[0]).toBeGreaterThan(0);
  });
});
