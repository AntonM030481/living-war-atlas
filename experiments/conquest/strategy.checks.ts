import { writeFileSync } from 'node:fs';
import { setImmediate } from 'node:timers/promises';
import { expect, it } from 'vitest';
import { createGameModeRuntime, createSimulationForMode } from '../../src/game/GameMode';
import { GameSession } from '../../src/game/GameSession';
import type { MapDefinition } from '../../src/sim/types';
import { internals } from './fixture';

// Compact geography lets us observe three minutes of autonomous war for several
// openings. This checks strategic consequences, not human enjoyment or balance.
const map: MapDefinition = {
  width: 48, height: 8, forests: [], rivers: [], initialFrontX: () => 24, seedInitialResource: false,
  cities: Array.from({ length: 6 }, (_, n) => ({ id: `c${n}`, name: `Country ${n}`, x: n * 8 + 4,
    y: 4, baseProduction: 1, owner: n < 3 ? 'blue' : 'red', integration: 1 })),
  regions: Array.from({ length: 6 }, (_, n) => ({ id: `r${n}`, cityId: `c${n}` })),
  regionAt: (x) => `r${Math.floor(x / 8)}`,
};
const policies = ['expand-now', 'staged', 'wait'] as const;

it('exercises different opening timings against the same autonomous opponent', async () => {
  const results = [];
  for (const seed of [1, 11, 23]) {
    for (const policy of policies) {
      const session = new GameSession(createSimulationForMode('conquest', map, seed, 'authored'),
        createGameModeRuntime('conquest', map, 'blue', seed));
      const actions: Array<{ time: number; type: string; regionId: string }> = [];
      const observations = [];
      const applyFirst = (type: 'conquestActivate' | 'conquestInvade') => {
        const action = session.availableActions().find((a) => a.type === type);
        if (!action || !('regionId' in action)) return false;
        actions.push({ time: +session.simulation.gameTime.toFixed(1), type, regionId: action.regionId });
        session.apply(action);
        return true;
      };
      for (let tick = 0; tick <= 1800; tick++) {
        if (policy === 'expand-now' && tick % 100 === 0) {
          while (applyFirst('conquestActivate')) { /* one irreversible disclosure per action */ }
          while (applyFirst('conquestInvade')) { /* open every currently available frontier */ }
        }
        if (policy === 'staged') {
          if (tick % 400 === 0) applyFirst('conquestActivate');
          if (tick % 400 === 200) applyFirst('conquestInvade');
        }
        if (policy === 'wait') {
          if (tick === 300 || tick === 900) applyFirst('conquestActivate');
          if (tick === 500 || tick === 1100) applyFirst('conquestInvade');
        }
        if ([0, 200, 600, 1200, 1800].includes(tick) || session.status().winner) {
          const sim = session.simulation, grid = internals(sim).transportGrid('blue');
          const sum = (field: Float32Array) => +field.reduce((a, b) => a + b, 0).toFixed(3);
          const view = session.view();
          observations.push({ time: +sim.gameTime.toFixed(1), blueForce: sum(sim.warBlue), redForce: sum(sim.warRed),
            frontCells: Array.from({ length: sim.size }, (_, i) => grid.isFront(i)).filter(Boolean).length,
            activeCountries: view.mode === 'conquest' ? view.countries.filter((c) => c.active).length : 0,
            blueCountries: view.mode === 'conquest' ? view.countries.filter((c) => c.owner === 'blue').length : 0,
            remainingMobilization: +sim.cities.reduce((sum, c) => sum + (c.remainingProduction ?? 0), 0).toFixed(3),
            winner: session.status().winner });
        }
        if (session.status().winner || tick === 1800) break;
        session.tick();
        if (tick % 100 === 99) await setImmediate();
      }
      expect(actions.length).toBeGreaterThan(0);
      expect(observations.some((o) => o.frontCells > 0)).toBe(true);
      results.push({ seed, policy, actions, observations });
    }
  }
  for (const seed of [1, 11, 23]) {
    const openings = results.filter((r) => r.seed === seed);
    expect(new Set(openings.map((r) => JSON.stringify(r.observations))).size).toBe(3);
  }
  if (process.env.CONQUEST_REPORT_PATH) writeFileSync(process.env.CONQUEST_REPORT_PATH,
    JSON.stringify({ rules: 2, durationSeconds: 180, map: '48x8 six-country probe',
      note: 'Scripted openings test consequences; they do not establish human enjoyment or a dominant strategy.', results }, null, 2) + '\n');
});
