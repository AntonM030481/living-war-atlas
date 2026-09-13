import { isDeepStrictEqual } from 'node:util';
import { describe, expect, it } from 'vitest';
import { CFG } from '../../src/sim/Config';
import { createConquestFixture, internals, SCENARIOS } from './fixture';

describe('experimental Conquest benchmark checkpoints', () => {
  for (const scenario of SCENARIOS) {
    it(`${scenario}: exercises regional routing and resets reproducibly`, async () => {
      const fixture = await createConquestFixture(scenario);
      const { session, state } = fixture;
      const simulation = session.simulation;
      const grid = internals(simulation).transportGrid('blue');
      expect(grid.potentialDemand).toBeTypeOf('function');
      expect(simulation.step % CFG.potentialEverySteps).toBe(0);
      expect([...simulation.warBlue].some((value) => value > 0)).toBe(true);

      // Check actual grid edges, not only mode flags: closed borders must block
      // transport, and preparation demand must exist before there is any fight.
      let closedEdges = 0;
      let openEdges = 0;
      let demandCells = 0;
      for (let y = 0; y < simulation.height; y++) {
        for (let x = 0; x < simulation.width; x++) {
          const i = y * simulation.width + x;
          if (simulation.terrainBlocked[i]) continue;
          if (grid.potentialDemand!(i) > 0) demandCells++;
          for (const [dx, dy] of [[1, 0], [0, 1]]) {
            if (x + dx >= simulation.width || y + dy >= simulation.height) continue;
            const j = (y + dy) * simulation.width + x + dx;
            if (simulation.terrainBlocked[j]) continue;
            const first = simulation.regionIdAt(x, y);
            const second = simulation.regionIdAt(x + dx, y + dy);
            if (!first || !second || first === second) continue;
            if (simulation.isRegionBorderOpen(first, second)) {
              openEdges++;
              expect(grid.edgeFactor(x, y, dx, dy)).toBeGreaterThan(0);
            } else {
              closedEdges++;
              expect(grid.edgeFactor(x, y, dx, dy)).toBe(0);
            }
          }
        }
      }
      expect(closedEdges).toBeGreaterThan(0);
      expect(openEdges).toBeGreaterThan(0);
      expect(demandCells).toBeGreaterThan(0);
      const invasions = fixture.actions.filter((action) => action.type === 'conquestInvade');
      expect(invasions).toHaveLength(scenario === 'preparation' ? 0 : scenario === 'first-invasion' ? 1 : 2);
      let frontCells = 0;
      for (let i = 0; i < simulation.size; i++) if (grid.isFront(i)) frontCells++;
      if (scenario === 'preparation') {
        expect(frontCells).toBe(0);
        expect(simulation.cities.filter((city) => city.owner === 'red').every((city) => city.enabled === false)).toBe(true);
        expect([...simulation.warRed].every((value) => value === 0)).toBe(true);
      } else {
        expect(frontCells).toBeGreaterThan(0);
        for (const invasion of invasions) {
          expect(session.view()).toMatchObject({ mode: 'conquest' });
          expect(state.mode.state).toMatchObject({
            countries: expect.arrayContaining([expect.objectContaining({ regionId: invasion.regionId, active: true })]),
          });
        }
        if (scenario === 'multiple-fronts') {
          expect([...simulation.warRed].some((value) => value > 0)).toBe(true);
        }
      }

      // Fresh execution (including invasion's dirty flag) must agree with the
      // restored checkpoint used before EVERY measured invocation.
      session.tick();
      const expected = session.saveState();
      const expectedActions = session.availableActions();
      for (let repeat = 0; repeat < 2; repeat++) {
        fixture.reset();
        expect(isDeepStrictEqual(session.saveState(), state), 'checkpoint restoration').toBe(true);
        session.tick();
        expect(isDeepStrictEqual(session.saveState(), expected), 'tick after restoration').toBe(true);
        expect(session.availableActions()).toEqual(expectedActions);
      }
    });
  }
});
