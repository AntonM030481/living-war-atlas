import { describe, expect, it } from 'vitest';
import { createGameModeRuntime } from '../../src/game/GameMode';
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
    seedInitialResource: false,
  };
}

describe('game modes', () => {
  it('keeps sandbox controls as a first-class mode', () => {
    const simulation = new Simulation(partisanMap(), 1);
    const session = new GameSession(simulation, createGameModeRuntime('sandbox', partisanMap()));

    expect(session.availableActions()).toContainEqual({ type: 'sandboxToggleCity', cityId: 'blue' });
    session.apply({ type: 'sandboxToggleCity', cityId: 'blue' });
    expect(simulation.cities.find((city) => city.id === 'blue')?.enabled).toBe(false);
  });

  it('makes a partisan capture the same full enclave action as sandbox secondary click', () => {
    const map = partisanMap();
    const simulation = new Simulation(map, 1);
    const session = new GameSession(simulation, createGameModeRuntime('partisan', map));
    const redCity = simulation.cities.find((city) => city.id === 'red')!;
    const cityIndex = redCity.y * simulation.width + redCity.x;

    expect(simulation.control[cityIndex]).toBeLessThan(0);
    expect(session.availableActions()).toEqual([{ type: 'partisanCaptureSource', cityId: 'red' }]);

    session.apply({ type: 'partisanCaptureSource', cityId: 'red' });

    expect(redCity.owner).toBe('blue');
    expect(redCity.enabled).toBe(true);
    expect(redCity.integration).toBe(1);
    expect(simulation.control[cityIndex]).toBeGreaterThan(0);
    expect(simulation.warBlue[cityIndex]).toBeGreaterThan(0);
    expect(session.availableActions()).toEqual([]);
  });

  it('does not defeat a side while residual force remains', () => {
    const map = partisanMap();
    const simulation = new Simulation(map, 1);
    const session = new GameSession(simulation, createGameModeRuntime('partisan', map));

    simulation.warRed[0] = 0.5;
    session.apply({ type: 'partisanCaptureSource', cityId: 'red' });

    expect(simulation.cities.every((city) => city.owner === 'blue')).toBe(true);
    expect(session.status().winner).toBeNull();

    simulation.warRed.fill(0);
    expect(session.status().winner).toBe('blue');
  });

  it('keeps inactive countries quiet and opens their border only on invasion', () => {
    const map = conquestMap();
    const simulation = new Simulation(map, 1);
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
  });

  it('saves mode state together with simulation state', () => {
    const map = partisanMap();
    const simulation = new Simulation(map, 1);
    const session = new GameSession(simulation, createGameModeRuntime('partisan', map));
    session.apply({ type: 'partisanCaptureSource', cityId: 'red' });
    const saved = session.saveState();

    const restoredSimulation = new Simulation(map, 1);
    const restored = new GameSession(restoredSimulation, createGameModeRuntime('partisan', map));
    restored.restoreState(saved);

    expect(restoredSimulation.cities.find((city) => city.id === 'red')?.owner).toBe('blue');
    expect(restored.saveState().mode).toEqual(saved.mode);
  });
});
