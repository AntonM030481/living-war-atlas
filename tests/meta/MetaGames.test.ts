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

function opponentMap(targetProduction: number, secondTarget = false): MapDefinition {
  return {
    width: secondTarget ? 7 : 5,
    height: 1,
    initialFrontX: () => secondTarget ? 4.5 : 3.5,
    cities: [
      { id: 'blue-a', name: 'Blue A', x: 0, y: 0, baseProduction: targetProduction, owner: 'blue', integration: 1 },
      ...(secondTarget
        ? [{ id: 'blue-b', name: 'Blue B', x: 2, y: 0, baseProduction: targetProduction, owner: 'blue' as const, integration: 1 }]
        : []),
      { id: 'red', name: 'Red', x: secondTarget ? 6 : 4, y: 0, baseProduction: 1, owner: 'red', integration: 1 },
    ],
    forests: [],
    rivers: [],
    seedInitialResource: false,
  };
}

function mixedOpponentMap(): MapDefinition {
  return {
    width: 9,
    height: 1,
    initialFrontX: () => 7.5,
    cities: [
      { id: 'blue-1', name: 'Blue 1', x: 0, y: 0, baseProduction: 1, owner: 'blue', integration: 1 },
      { id: 'blue-2', name: 'Blue 2', x: 2, y: 0, baseProduction: 2, owner: 'blue', integration: 1 },
      { id: 'blue-3', name: 'Blue 3', x: 4, y: 0, baseProduction: 3, owner: 'blue', integration: 1 },
      { id: 'red', name: 'Red', x: 8, y: 0, baseProduction: 1, owner: 'red', integration: 1 },
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

function partisanSession(map: MapDefinition): GameSession {
  return new GameSession(
    new Simulation(map, 1),
    createGameModeRuntime('partisan', map, 'blue', 1, null),
  );
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
    const session = partisanSession(map);

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
    const session = partisanSession(map);
    const simulation = session.simulation;
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

  it('makes the greedy opponent prefer Production 2 over affordable Production 1', () => {
    const map = mixedOpponentMap();
    const simulation = new Simulation(map, 17);
    const session = new GameSession(simulation, createGameModeRuntime('partisan', map, 'blue', 17));

    accumulateGuerrilla(session, 100);
    expect(simulation.cities.find((city) => city.id === 'blue-1')?.owner).toBe('blue');
    expect(simulation.cities.find((city) => city.id === 'blue-2')?.owner).toBe('blue');
    expect(session.view()).toMatchObject({ points: { red: 100 } });

    accumulateGuerrilla(session, 100);
    expect(simulation.cities.find((city) => city.id === 'blue-2')?.owner).toBe('red');
    expect(simulation.cities.find((city) => city.id === 'blue-1')?.owner).toBe('blue');
    expect(session.view()).toMatchObject({ points: { red: 0 } });
  });

  it('makes the greedy opponent prefer Production 3 when no Production 2 target exists', () => {
    const map = opponentMap(3);
    const simulation = new Simulation(map, 23);
    const session = new GameSession(simulation, createGameModeRuntime('partisan', map, 'blue', 23));

    accumulateGuerrilla(session, 200);
    expect(simulation.cities.find((city) => city.id === 'blue-a')?.owner).toBe('blue');
    expect(session.view()).toMatchObject({ points: { red: 200 } });

    accumulateGuerrilla(session, 100);
    expect(simulation.cities.find((city) => city.id === 'blue-a')?.owner).toBe('red');
    expect(session.view()).toMatchObject({ points: { red: 0 } });
  });

  it('falls back to a random Production 1 target when no 2 or 3 exists', () => {
    const map = opponentMap(1, true);
    const simulation = new Simulation(map, 29);
    const session = new GameSession(simulation, createGameModeRuntime('partisan', map, 'blue', 29));

    accumulateGuerrilla(session, 100);
    const captured = simulation.cities.filter((city) => city.id.startsWith('blue-') && city.owner === 'red');
    expect(captured).toHaveLength(1);
    expect(['blue-a', 'blue-b']).toContain(captured[0].id);
    expect(session.view()).toMatchObject({ points: { red: 0 } });
  });

  it('does not defeat a side while residual force remains', () => {
    const map = partisanMap();
    const session = partisanSession(map);
    const simulation = session.simulation;

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
    const session = partisanSession(map);
    accumulateGuerrilla(session, 100);
    session.apply({ type: 'partisanCaptureSource', cityId: 'red' });
    const saved = session.saveState();

    const restored = partisanSession(map);
    restored.restoreState(saved);

    expect(restored.simulation.cities.find((city) => city.id === 'red')?.owner).toBe('blue');
    expect(restored.saveState().mode).toEqual(saved.mode);
  });
});
