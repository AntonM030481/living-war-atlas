import { describe, expect, it } from 'vitest';
import { frontCommitment, updateCommittedAmounts } from '../../src/sim/commitment';
import { createSideFields } from '../../src/sim/sides';

const config = {
  frontCommitmentMax: 1,
  frontUnopposedCommitment: 0.82,
  collapseCommitmentFactor: 0.28,
  commitmentEngagePerSecond: 0.85,
  commitmentReleasePerSecond: 0.22,
  collapseReleaseMultiplier: 3,
  dt: 0.1,
};

describe('commitment', () => {
  it('commits all available local force on an opposed front', () => {
    expect(frontCommitment(12, 7, false, config)).toBe(1);
    expect(frontCommitment(7, 12, false, config)).toBe(1);
  });

  it('uses the lower unopposed commitment when no enemy force is present', () => {
    expect(frontCommitment(12, 0, false, config)).toBe(0.82);
  });

  it('reduces commitment while collapsed', () => {
    expect(frontCommitment(12, 7, true, config)).toBeCloseTo(0.28);
  });

  it('engages and releases a side without knowing its id', () => {
    const side = createSideFields(1);
    side.war[0] = 10;
    side.commitmentTarget[0] = 0.8;

    for (let i = 0; i < 100; i++) updateCommittedAmounts(side, config);
    const engaged = side.committed[0];
    expect(engaged).toBeGreaterThan(7);

    side.commitmentTarget[0] = 0;
    updateCommittedAmounts(side, config);
    expect(side.committed[0]).toBeLessThan(engaged);
    expect(side.committed[0]).toBeGreaterThan(0);
  });

  it('never commits more than total war resource', () => {
    const side = createSideFields(1);
    side.war[0] = 2;
    side.committed[0] = 5;
    side.commitmentTarget[0] = 1;

    updateCommittedAmounts(side, config);

    expect(side.committed[0]).toBeLessThanOrEqual(side.war[0]);
  });
});
