import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/GameSession';
import { ConquestMetaGame } from '../../src/meta/conquest/ConquestMetaGame';
import { PartisanMetaGame } from '../../src/meta/partisan/PartisanMetaGame';
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

describe('meta games', () => {
  it('implements the minimal partisan source-capture loop above Simulation', () => {
    const simulation = new Simulation(partisanMap(), 1);
    const session = new GameSession(simulation, new PartisanMetaGame('blue', 10));

    expect(session.availableActions()).toEqual([{ type: 'captureSource', cityId: 'red' }]);

    session.apply({ type: 'captureSource', cityId: 'red' });

    expect(simulation.cities.find((city) => city.id === 'red')?.owner).toBe('blue');
    expect(session.availableActions()).toEqual([]);
    expect(session.status().winner).toBe('blue');
  });

  it('keeps inactive countries quiet and opens their border only on invasion', () => {
    const map = conquestMap();
    const simulation = new Simulation(map, 1);
    const session = new GameSession(simulation, new ConquestMetaGame(map, 'blue', ['a']));

    expect(simulation.cities.find((city) => city.id === 'a-city')?.enabled).toBe(true);
    expect(simulation.cities.find((city) => city.id === 'b-city')?.enabled).toBe(false);
    expect(simulation.isRegionBorderOpen('a', 'b')).toBe(false);
    expect(session.availableActions()).toContainEqual({ type: 'invade', regionId: 'b' });

    session.apply({ type: 'invade', regionId: 'b' });

    expect(simulation.cities.find((city) => city.id === 'b-city')?.enabled).toBe(true);
    expect(simulation.isRegionBorderOpen('a', 'b')).toBe(true);
    expect(session.availableActions()).not.toContainEqual({ type: 'invade', regionId: 'b' });
  });

  it('saves meta state together with simulation state', () => {
    const simulation = new Simulation(partisanMap(), 1);
    const session = new GameSession(simulation, new PartisanMetaGame('blue', 10));
    session.apply({ type: 'captureSource', cityId: 'red' });
    const saved = session.saveState();

    const restoredSimulation = new Simulation(partisanMap(), 1);
    const restored = new GameSession(restoredSimulation, new PartisanMetaGame('blue', 10));
    restored.restoreState(saved);

    expect(restoredSimulation.cities.find((city) => city.id === 'red')?.owner).toBe('blue');
    expect(restored.saveState().meta).toEqual(saved.meta);
  });
});
