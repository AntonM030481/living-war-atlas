import { describe, expect, it, vi } from 'vitest';
import { HistoryManager } from '../../src/worker/HistoryManager';
import { HistoryStorage } from '../../src/worker/HistoryStorage';
import type { GameSessionState } from '../../src/game/GameSession';
import type { ConquestMetaState } from '../../src/meta/conquest/ConquestMetaGame';
import { createGameModeRuntime, createSimulationForMode } from '../../src/game/GameMode';
import { GameSession } from '../../src/game/GameSession';
import { ConquestMetaGame } from '../../src/meta/conquest/ConquestMetaGame';
import { CONQUEST } from '../../src/meta/conquest/ConquestRules';
import { CFG, type Side } from '../../src/sim/Config';
import { generateCityResource } from '../../src/sim/cities';
import type { MapDefinition } from '../../src/sim/types';

export function conquestTestMap(): MapDefinition {
  return {
    width: 48, height: 8, initialFrontX: () => 24, forests: [], rivers: [], seedInitialResource: false,
    cities: Array.from({ length: 6 }, (_, n) => ({ id: `city-${n}`, name: `Country ${n}`,
      x: n * 8 + 4, y: 4, baseProduction: 1, owner: n < 3 ? 'blue' as const : 'red' as const, integration: 1 })),
    regions: Array.from({ length: 6 }, (_, n) => ({ id: `r${n}`, cityId: `city-${n}` })),
    regionAt: (x) => `r${Math.floor(x / 8)}`,
  };
}
function setup(alliances: (Side | null)[] = ['blue', null, 'red', 'blue', null, 'red'], opponent = false) {
  const map = conquestTestMap();
  const sim = createSimulationForMode('conquest', map, 1, 'authored');
  const meta = new ConquestMetaGame(map, 'blue', 1, opponent);
  meta.initialize(sim);
  const state = meta.saveState();
  state.countries.forEach((c, n) => { c.allegiance = alliances[n]; c.owner = alliances[n] ?? 'red'; });
  meta.restoreState(state);
  sim.initializeRegionalControl(state.countries.map((c) => [c.regionId, c.owner]));
  sim.cities.forEach((city, n) => { city.owner = state.countries[n].owner; });
  const tick = (count = 1) => { for (let n = 0; n < count; n++) { meta.beforeTick(sim); sim.tick(); meta.afterTick(sim); } };
  return { map, sim, meta, tick };
}
const total = (values: Float32Array) => values.reduce((a, b) => a + b, 0);

describe('Conquest strategic rules', () => {
  it('deals reproducible secret alliances and genuine neutrals, with both sides still alive', () => {
    const map = conquestTestMap();
    const create = () => new GameSession(createSimulationForMode('conquest', map, 11), createGameModeRuntime('conquest', map, 'blue', 11));
    const a = create(), b = create();
    expect(a.saveState()).toEqual(b.saveState());
    const countries = a.saveState().mode.state as ReturnType<ConquestMetaGame['saveState']>;
    expect(countries.countries.filter((c) => c.allegiance === null)).toHaveLength(2);
    expect(a.status().winner).toBeNull();
    expect(a.simulation.cities.every((c) => !c.enabled)).toBe(true);
  });

  it('keeps undisclosed countries sealed and validates actions before any mutation', () => {
    const { meta, sim, tick } = setup();
    meta.apply({ type: 'activate', regionId: 'r0' }, sim);
    tick(20);
    expect(sim.isRegionBorderOpen('r0', 'r1')).toBe(false);
    expect(total(sim.warRed)).toBe(0);
    const before = [meta.saveState(), sim.saveState()];
    expect(() => meta.apply({ type: 'invade', regionId: 'r4' }, sim)).toThrow();
    expect(() => meta.apply({ type: 'activate', regionId: 'r2' }, sim)).toThrow();
    expect([meta.saveState(), sim.saveState()]).toEqual(before);
  });

  it('raises resistance in a genuine neutral, without giving its protector free production', () => {
    const { meta, sim } = setup();
    meta.apply({ type: 'activate', regionId: 'r0' }, sim);
    meta.apply({ type: 'invade', regionId: 'r1' }, sim);
    expect(total(sim.warRed)).toBeCloseTo(CONQUEST.resistanceForceSeconds, 4);
    expect(sim.cities[1].enabled).toBe(false);
    expect(sim.cities[1].remainingProduction).toBe(0);
    expect(sim.isRegionBorderOpen('r0', 'r1')).toBe(true);
    expect(sim.isRegionBorderOpen('r1', 'r2')).toBe(false);
    expect(() => meta.apply({ type: 'invade', regionId: 'r1' }, sim)).toThrow();
    expect(total(sim.warRed)).toBeCloseTo(CONQUEST.resistanceForceSeconds, 4);
  });

  it('also raises resistance when invading a secret or already disclosed enemy ally', () => {
    for (const disclosed of [false, true]) {
      const { meta, sim } = setup(['blue', 'red', null, 'blue', null, 'red']);
      meta.apply({ type: 'activate', regionId: 'r0' }, sim);
      if (disclosed) meta.apply({ type: 'activate', regionId: 'r1' }, sim, 'red');
      meta.apply({ type: 'invade', regionId: 'r1' }, sim);
      expect(total(sim.warRed)).toBeCloseTo(CONQUEST.disclosureForceSeconds + CONQUEST.resistanceForceSeconds, 4);
      expect(sim.cities[1].enabled).toBe(true);
      expect(sim.cities[1].remainingProduction).toBe(CONQUEST.mobilizationSeconds);
    }
  });

  it('lets a neighboring secret ally join the resistance through the ordinary autonomous front', () => {
    const { meta, sim, tick } = setup();
    meta.apply({ type: 'activate', regionId: 'r0' }, sim);
    meta.apply({ type: 'invade', regionId: 'r1' }, sim);
    const before = total(sim.warRed);
    meta.apply({ type: 'activate', regionId: 'r2' }, sim, 'red');
    expect(sim.isRegionBorderOpen('r1', 'r2')).toBe(true);
    expect(total(sim.warRed)).toBeCloseTo(before + CONQUEST.disclosureForceSeconds, 4);
    tick(30);
    expect(sim.snapshot().stats.frontCells).toBeGreaterThan(0);
    expect(sim.sides.red.flow.x.some((value) => value !== 0)).toBe(true);
    expect(sim.isRegionBorderOpen('r2', 'r3')).toBe(false);
  });

  it('reserves mobilization for a late disclosure and makes several invasions raise more opposing force', () => {
    const early = setup(), late = setup();
    early.meta.apply({ type: 'activate', regionId: 'r0' }, early.sim);
    early.tick(30); late.tick(30);
    expect(early.sim.cities[0].remainingProduction).toBeLessThan(CONQUEST.mobilizationSeconds);
    late.meta.apply({ type: 'activate', regionId: 'r0' }, late.sim);
    expect(late.sim.cities[0].remainingProduction).toBe(CONQUEST.mobilizationSeconds);
    early.meta.apply({ type: 'invade', regionId: 'r1' }, early.sim);
    const oneFront = total(early.sim.warRed);
    early.meta.apply({ type: 'activate', regionId: 'r3' }, early.sim);
    early.meta.apply({ type: 'invade', regionId: 'r4' }, early.sim);
    expect(total(early.sim.warRed)).toBeCloseTo(oneFront + CONQUEST.resistanceForceSeconds, 4);
  });

  it('starts neutral income only after capital capture and never refills it on recapture', () => {
    const { meta, sim, tick } = setup();
    meta.apply({ type: 'activate', regionId: 'r0' }, sim);
    meta.apply({ type: 'invade', regionId: 'r1' }, sim);
    const city = sim.cities[1], index = city.y * sim.width + city.x;
    sim.control[index] = 1;
    tick();
    expect(city.owner).toBe('blue');
    expect(city.remainingProduction).toBe(CONQUEST.mobilizationSeconds);
    city.remainingProduction = 7;
    sim.control[index] = -1;
    tick();
    expect(city.owner).toBe('red');
    expect(city.remainingProduction).toBeLessThanOrEqual(7);
    expect(meta.saveState().countries[1].invadedBy).toBe('blue');
  });

  it('raises source-country resistance once on a counter-breakthrough, keeping other countries sealed', () => {
    const { meta, sim } = setup();
    meta.apply({ type: 'activate', regionId: 'r0' }, sim);
    meta.apply({ type: 'invade', regionId: 'r1' }, sim);
    sim.control[7] = -1;
    const before = total(sim.warBlue);
    meta.afterTick(sim);
    expect(total(sim.warBlue)).toBeCloseTo(before + CONQUEST.resistanceForceSeconds, 4);
    meta.afterTick(sim);
    expect(total(sim.warBlue)).toBeCloseTo(before + CONQUEST.resistanceForceSeconds, 4);
    expect(meta.saveState().countries[0].invadedBy).toBe('red');
    expect(sim.isRegionBorderOpen('r1', 'r2')).toBe(false);
  });

  it('masks hidden ownership, potential, city totals and diagnostics without touching simulation state', () => {
    const { meta, sim } = setup();
    const before = sim.saveState();
    const snapshot = sim.snapshot();
    meta.projectSnapshot(snapshot);
    expect(snapshot.control.every((v) => v === 0)).toBe(true);
    expect(snapshot.potentialRed.every((v) => v === 0)).toBe(true);
    expect(snapshot.cities.every((c) => c.owner === 'blue')).toBe(true);
    expect(snapshot.stats.redCities).toBe(0);
    expect(snapshot.stats.controlledCityPointsBlue).toBe(0);
    const view = meta.view(sim);
    expect(view.countries[1]).toEqual({ ...view.countries[2], regionId: 'r1' });
    expect(view.countries[0].secretAlly).toBe(true);
    expect(JSON.stringify(view)).not.toContain('allegiance');
    expect(sim.saveState()).toEqual(before);
  });

  it('runs the opponent through the same disclosure/invasion actions and restores its decision timing', () => {
    const map = conquestTestMap();
    const create = () => new GameSession(createSimulationForMode('conquest', map, 23), createGameModeRuntime('conquest', map, 'blue', 23));
    const session = create();
    const reveal = session.availableActions().find((a) => a.type === 'conquestActivate')!;
    session.apply(reveal);
    for (let n = 0; n < 80; n++) session.tick();
    const saved = session.saveState();
    for (let n = 0; n < 30; n++) session.tick();
    const expected = session.saveState();
    session.restoreState(saved);
    for (let n = 0; n < 30; n++) session.tick();
    expect(session.saveState()).toEqual(expected);
    expect((expected.mode.state as ReturnType<ConquestMetaGame['saveState']>).countries.some((c) => c.active && c.owner === 'red')).toBe(true);
  });

  it("does not use an unknown target\'s allegiance to choose the opponent invasion", () => {
    for (const hidden of ['blue', null] as const) {
      const { meta, sim } = setup(['blue', hidden, 'red', 'blue', null, 'red'], true);
      meta.apply({ type: 'activate', regionId: 'r2' }, sim, 'red');
      sim.warRed[16] += 80;
      const state = meta.saveState();
      state.nextDecisionAt = 0;
      meta.restoreState(state);
      meta.beforeTick(sim);
      expect(meta.saveState().countries[1].invadedBy).toBe('red');
    }
  });

  it('rejects legacy Conquest saves instead of silently inventing missing secrets', () => {
    const { meta } = setup();
    const before = meta.saveState();
    expect(() => meta.restoreState({ ...before, version: 1 } as unknown as typeof before)).toThrow('Incompatible Conquest save');
    expect(meta.saveState()).toEqual(before);
  });

  it('caps finite production to the remaining resource and preserves overflow instead of deleting resistance', () => {
    const { sim } = setup();
    const city = sim.cities[0], i = city.y * sim.width + city.x;
    city.enabled = true; city.remainingProduction = 0.025;
    generateCityResource(sim.cities, sim.width, sim.sides, CFG.dt);
    expect(sim.warBlue[i]).toBeCloseTo(0.025);
    expect(city.remainingProduction).toBe(0);
    expect(city.enabled).toBe(false);
    city.enabled = true; city.remainingProduction = 10; sim.warBlue[i] = 3;
    generateCityResource(sim.cities, sim.width, sim.sides, CFG.dt);
    expect(sim.warBlue[i]).toBe(3);
    expect(city.remainingProduction).toBe(10);
  });
});


it.each(['blue', 'red'] as const)('does not hatch neutral initialization from %s, live or after rewind', (placeholder) => {
  const { meta, sim } = setup();
  const initial = meta.saveState();
  initial.countries[1].owner = placeholder;
  meta.restoreState(initial);
  sim.initializeRegionalControl(initial.countries.map((c) => [c.regionId, c.owner]));
  sim.cities[1].owner = placeholder;
  meta.apply({ type: 'activate', regionId: 'r0' }, sim);
  const storage = new HistoryStorage();
  vi.spyOn(storage, 'schedule').mockImplementation(() => {});
  const history = new HistoryManager(storage);
  const project = (state: GameSessionState) => meta.captureControl(state.simulation.control, state.mode.state as ConquestMetaState);
  const checkpoint = (time: number) => {
    const state: GameSessionState = { simulation: { ...sim.saveState(), gameTime: time }, mode: { id: 'conquest', state: meta.saveState() } };
    history.checkpoint(state, 1, 'theatre', 'conquest', true);
    return state;
  };
  const before = checkpoint(0);
  history.recentCaptures(project(before), 0, 30, project);
  meta.apply({ type: 'invade', regionId: 'r1' }, sim);
  const invaded = checkpoint(1);
  const live = history.recentCaptures(project(invaded), 1, 30, project);
  expect(Array.from(live.side).every((side) => side === 0)).toBe(true);
  // Real changes in both the source and the now-active neutral must remain visible.
  const sourceCell = 4 * sim.width + 4, neutralCell = 4 * sim.width + 12;
  sim.control[sourceCell] = -1;
  sim.control[neutralCell] = 1;
  const captured = checkpoint(2);
  const combat = history.recentCaptures(project(captured), 2, 30, project);
  expect(combat.side[sourceCell]).toBe(-1);
  expect(combat.side[neutralCell]).toBe(1);
  expect(Array.from(combat.side).filter(Boolean)).toHaveLength(2);
  const later = checkpoint(3);
  history.recentCaptures(project(later), 3, 30, project);
  const rewound = history.step(-1, 1, 'theatre', 'conquest')!;
  const restored = history.recentCaptures(project(rewound), 2, 30, project);
  expect(restored.side[sourceCell]).toBe(-1);
  expect(restored.side[neutralCell]).toBe(1);
  expect(Array.from(restored.side).filter(Boolean)).toHaveLength(2);
  expect(Array.from(before.simulation.control).every(Number.isFinite)).toBe(true);
});
