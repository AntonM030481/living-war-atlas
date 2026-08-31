import { describe, expect, it } from 'vitest';
import { createGameModeRuntime, createSimulationForMode } from '../../src/game/GameMode';
import { GameSession } from '../../src/game/GameSession';
import { Simulation } from '../../src/sim/Simulation';
import type { MapDefinition } from '../../src/sim/types';

function partisanMap(): MapDefinition {
  return {
    width: 3,
    height: 1,
    initialFrontX: () => 1.5,
    cities: [
      { id: 'blue', name: 'Blue', x: 0, y: 0, baseProduction: 1, owner: 'blue', integration: 1 },
      { id: 'red', name: 'Red', x: 2, y: 0, baseProduction: 1, owner: 'red', integration: 1 },
    ],
    forests: [],
    rivers: [],
    seedInitialResource: false,
  };
}

function conquestMap(): MapDefinition {
  return {
    width: 4,
    height: 1,
    initialFrontX: () => 2,
    cities: [
      { id: 'a-city', name: 'A', x: 0, y: 0, baseProduction: 1, owner: 'blue', integration: 1 },
      { id: 'b-city', name: 'B', x: 3, y: 0, baseProduction: 1, owner: 'red', integration: 1 },
    ],
    regions: [
      { id: 'a', cityId: 'a-city' },
      { id: 'b', cityId: 'b-city' },
    ],
    regionAt: (x) => x < 2 ? 'a' : 'b',
    forests: [],
    rivers: [],
  };
}

function accumulateGuerrilla(session: GameSession, ticks: number): void {
  for (let i = 0; i < ticks; i++) session.mode.beforeTick(session.simulation);
}

describe('game modes', () => {
  it('keeps sandbox controls as a first-class mode', () => {
    const simulation = new Simulation(partisanMap(), 1);
    const session = new GameSession(simulation, createGameModeRuntime('sandbox', partisanMap()));

    expect(session.availableActions()).toContainEqual({ type: 'sandboxToggleCity', cityId: 'blue' });
    session.apply({ type: 'sandboxToggleCity', cityId: 'blue' });
    expect(simulation.cities.find((city) => city.id === 'blue')?.enabled).toBe(false);
  });

  it('accumulates independent guerrilla points and unlocks a Production 1 capture at 100', () => {
    const map = partisanMap();
    const simulation = new Simulation(map, 1);
    const session = new GameSession(simulation, createGameModeRuntime('partisan', map));

    expect(session.availableActions()).toEqual([]);
    expect(session.view()).toMatchObject({
      mode: 'partisan',
      points: { blue: 0, red: 0 },
      maxPoints: 300,
      thresholds: [100, 200, 300],
    });

    accumulateGuerrilla(session, 99);
    expect(session.availableActions()).toEqual([]);

    accumulateGuerrilla(session, 1);
    expect(session.availableActions()).toEqual([{ type: 'partisanCaptureSource', cityId: 'red' }]);
    expect(session.view()).toMatchObject({ points: { blue: 100, red: 100 } });
  });

  it('spends guerrilla points on the captured city production value', () => {
    const map = partisanMap();
    const simulation = new Simulation(map, 1);
    const session = new GameSession(simulation, createGameModeRuntime('partisan', map));
    const redCity = simulation.cities.find((city) => city.id === 'red')!;
    const cityIndex = redCity.y * simulation.width + redCity.x;

    accumulateGuerrilla(session, 100);
    session.apply({ type: 'partisanCaptureSource', cityId: 'red' });

    expect(redCity.owner).toBe('blue');
    expect(redCity.enabled).toBe(true);
    expect(redCity.integration).toBe(1);
    expect(simulation.control[cityIndex]).toBeGreaterThan(0);
    expect(simulation.warBlue[cityIndex]).toBeGreaterThan(0);
    expect(session.view()).toMatchObject({ points: { blue: 0, red: 100 } });
    expect(session.availableActions()).toEqual([]);
  });

  it('does not defeat a side while residual force remains', () => {
    const map = partisanMap();
    const simulation = new Simulation(map, 1);
    const session = new GameSession(simulation, createGameModeRuntime('partisan', map));

    accumulateGuerrilla(session, 100);
    simulation.warRed[0] = 0.5;
    session.apply({ type: 'partisanCaptureSource', cityId: 'red' });

    expect(simulation.cities.every((city) => city.owner === 'blue')).toBe(true);
    expect(session.status().winner).toBeNull();

    simulation.warRed.fill(0);
    expect(session.status().winner).toBe('blue');
  });

  it('starts Conquest with country control but no initial front or Force', () => {
    const map = conquestMap();
    const simulation = createSimulationForMode('conquest', map, 1);
    const session = new GameSession(simulation, createGameModeRuntime('conquest', map));
    const snapshot = simulation.snapshot();

    expect([...simulation.control]).toEqual([1, 1, -1, -1]);
    expect(snapshot.stats.frontCells).toBe(0);
    expect([...snapshot.frontMask ?? []].some(Boolean)).toBe(false);
    expect([...simulation.warBlue].some((value) => value !== 0)).toBe(false);
    expect([...simulation.warRed].some((value) => value !== 0)).toBe(false);
    expect(simulation.isRegionBorderOpen('a', 'b')).toBe(false);
  });

  it('keeps inactive countries quiet and opens their border only on invasion', () => {
    const map = conquestMap();
    const simulation = createSimulationForMode('conquest', map, 1);
    const session = new GameSession(simulation, createGameModeRuntime('conquest', map));

    expect(simulation.cities.find((city) => city.id === 'a-city')?.enabled).toBe(false);
    expect(simulation.cities.find((city) => city.id === 'b-city')?.enabled).toBe(false);
    expect(session.availableActions()).toContainEqual({ type: 'conquestActivate', regionId: 'a' });

    session.apply({ type: 'conquestActivate', regionId: 'a' });

    expect(simulation.cities.find((city) => city.id === 'a-city')?.enabled).toBe(true);
    expect(simulation.isRegionBorderOpen('a', 'b')).toBe(false);
    expect(session.availableActions()).toContainEqual({ type: 'conquestInvade', regionId: 'b' });

    session.apply({ type: 'conquestInvade', regionId: 'b' });

    expect(simulation.cities.find((city) => city.id === 'b-city')?.enabled).toBe(true);
    expect(simulation.isRegionBorderOpen('a', 'b')).toBe(true);
    expect(session.availableActions()).not.toContainEqual({ type: 'conquestInvade', regionId: 'b' });
    expect(simulation.snapshot().stats.frontCells).toBeGreaterThan(0);
  });

  it('saves mode state together with simulation state', () => {
    const map = partisanMap();
    const simulation = new Simulation(map, 1);
    const session = new GameSession(simulation, createGameModeRuntime('partisan', map));
    accumulateGuerrilla(session, 100);
    session.apply({ type: 'partisanCaptureSource', cityId: 'red' });
    const saved = session.saveState();

    const restoredSimulation = new Simulation(map, 1);
    const restored = new GameSession(restoredSimulation, createGameModeRuntime('partisan', map));
    restored.restoreState(saved);

    expect(restoredSimulation.cities.find((city) => city.id === 'red')?.owner).toBe('blue');
    expect(restored.saveState().mode).toEqual(saved.mode);
  });
});
