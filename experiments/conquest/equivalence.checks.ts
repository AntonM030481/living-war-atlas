import { isDeepStrictEqual } from 'node:util';
import { setImmediate } from 'node:timers/promises';
import { expect, it } from 'vitest';
import { RegionTopology } from '../../src/sim/regions';
import { legacyEdgeFactor, legacyPotentialFront } from '../../tests/sim/helpers/legacyRegionQueries';
import { createConquestFixture, SCENARIOS, type Scenario } from './fixture';

async function trajectory(scenario: Scenario) {
  const { session, reset } = await createConquestFixture(scenario);
  const states = [session.saveState()];
  // Includes full potential rebuilds, combat, mode hooks and resource transport.
  // Repeat after restoring history to exercise derived-cache invalidation.
  for (let repeat = 0; repeat < 2; repeat++) {
    if (repeat) reset();
    for (let tick = 0; tick < 20; tick++) {
      session.tick();
      states.push(session.saveState());
      if (tick % 10 === 9) await setImmediate();
    }
  }
  return { states, actions: session.availableActions() };
}

for (const scenario of SCENARIOS) {
  it(`${scenario}: matches uncached region queries exactly`, async () => {
    let expected;
    const { edgeFactor, isPotentialFront } = RegionTopology.prototype;
    try {
      // Direct replacement avoids recording millions of hot-path spy calls.
      RegionTopology.prototype.edgeFactor = legacyEdgeFactor;
      RegionTopology.prototype.isPotentialFront = legacyPotentialFront;
      expected = await trajectory(scenario);
    } finally {
      RegionTopology.prototype.edgeFactor = edgeFactor;
      RegionTopology.prototype.isPotentialFront = isPotentialFront;
    }
    const actual = await trajectory(scenario);
    expect(actual.actions).toEqual(expected.actions);
    for (let i = 0; i < expected.states.length; i++) {
      expect(isDeepStrictEqual(actual.states[i], expected.states[i]), `state ${i}`).toBe(true);
    }
  });
}
