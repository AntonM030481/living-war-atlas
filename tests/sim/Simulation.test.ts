import { describe, expect, it } from 'vitest';
import { testMap } from '../../src/map/testMap';
import { applyFrontConsumption } from '../../src/sim/combat';
import { CFG, ticks } from '../../src/sim/Config';
import { Simulation } from '../../src/sim/Simulation';

function total(a: Float32Array): number {
  let sum = 0;
  for (const value of a) sum += value;
  return sum;
}

function frontPosition1D(sim: Simulation, width: number): number {
  for (let x = 0; x < width - 1; x++) {
    const a = sim.control[x];
    const b = sim.control[x + 1];
    if (a >= 0 && b <= 0) {
      const t = a / (a - b || 1);
      return x + t;
    }
  }
  return sim.control[0] < 0 ? 0 : width - 1;
}

function localFlow(snapshot: ReturnType<Simulation['snapshot']>, cityId: string): number {
  const city = snapshot.cities.find((candidate) => candidate.id === cityId);
  if (!city) throw new Error(`Missing city ${cityId}`);
  const flowX = city.owner === 'blue' ? snapshot.flowBlueX : snapshot.flowRedX;
  const flowY = city.owner === 'blue' ? snapshot.flowBlueY : snapshot.flowRedY;
  let total = 0;
  const radius = 5;
  for (let dy = -radius; dy <= radius; dy++) {
    const y = city.y + dy;
    if (y < 0 || y >= snapshot.height) continue;
    for (let dx = -radius; dx <= radius; dx++) {
      const x = city.x + dx;
      if (x < 0 || x >= snapshot.width) continue;
      const d = Math.hypot(dx, dy);
      if (d > radius) continue;
      const index = y * snapshot.width + x;
      total += Math.hypot(flowX[index], flowY[index]) * (1 - d / radius);
    }
  }
  return total;
}

describe('Simulation', () => {
  it('keeps authored cities outside forest terrain', () => {
    for (const city of testMap.cities) {
      for (const forest of testMap.forests) {
        expect(Math.hypot(city.x - forest.x, city.y - forest.y)).toBeGreaterThan(forest.r);
      }
    }
  });

  it('is deterministic for the same seed', () => {
    const a = new Simulation(testMap, 42);
    const b = new Simulation(testMap, 42);
    for (let i = 0; i < 30; i++) {
      a.tick();
      b.tick();
    }
    expect(Array.from(a.control)).toEqual(Array.from(b.control));
    expect(Array.from(a.warBlue)).toEqual(Array.from(b.warBlue));
  });

  it('restores a saved state and continues deterministically', () => {
    const baseline = new Simulation(testMap, 42);
    for (let i = 0; i < 24; i++) baseline.tick();
    const state = baseline.saveState();
    const expected = new Simulation(testMap, 42);
    expected.restoreState(state);

    for (let i = 0; i < 17; i++) {
      baseline.tick();
      expected.tick();
    }

    expect(expected.step).toBe(baseline.step);
    expect(expected.gameTime).toBeCloseTo(baseline.gameTime, 8);
    expect(Array.from(expected.control)).toEqual(Array.from(baseline.control));
    expect(Array.from(expected.warBlue)).toEqual(Array.from(baseline.warBlue));
    expect(Array.from(expected.warRed)).toEqual(Array.from(baseline.warRed));
    expect(Array.from(expected.committedBlue)).toEqual(Array.from(baseline.committedBlue));
    expect(Array.from(expected.committedRed)).toEqual(Array.from(baseline.committedRed));
  });

  it('cities generate war resource', () => {
    const sim = new Simulation(testMap, 1);
    const before = total(sim.warBlue) + total(sim.warRed);
    sim.tick();
    const after = total(sim.warBlue) + total(sim.warRed);
    expect(after).toBeGreaterThan(0);
    expect(Number.isFinite(before)).toBe(true);
  });

  it('reports active and controlled city production points', () => {
    const sim = new Simulation(testMap, 1);

    const expectedProduction = (side: 'blue' | 'red', activeOnly: boolean): number =>
      sim.cities
        .filter((city) => city.owner === side && (!activeOnly || city.enabled !== false))
        .reduce(
          (sum, city) => sum + city.baseProduction * (activeOnly ? city.integration : 1),
          0,
        );

    const snapshot = sim.snapshot();
    expect(snapshot.stats.controlledCityPointsBlue).toBe(expectedProduction('blue', false));
    expect(snapshot.stats.controlledCityPointsRed).toBe(expectedProduction('red', false));
    expect(snapshot.stats.activeCityPointsBlue).toBe(expectedProduction('blue', true));
    expect(snapshot.stats.activeCityPointsRed).toBe(expectedProduction('red', true));

    const city = sim.cities.find((candidate) => candidate.owner === 'blue');
    if (!city) throw new Error('Missing blue city');
    const controlledBefore = snapshot.stats.controlledCityPointsBlue;
    const activeBefore = snapshot.stats.activeCityPointsBlue;
    const disabledProduction = city.baseProduction * city.integration;

    sim.toggleCityEnabled(city.id);
    const afterToggle = sim.snapshot();
    expect(afterToggle.stats.controlledCityPointsBlue).toBe(controlledBefore);
    expect(afterToggle.stats.activeCityPointsBlue).toBeCloseTo(activeBefore - disabledProduction, 8);
  });

  it('flips city owner without changing production enabled state', () => {
    const sim = new Simulation(testMap, 1);
    sim.toggleCityEnabled('b1');
    const city = sim.cities.find((candidate) => candidate.id === 'b1');
    if (!city) throw new Error('Missing b1');
    expect(city.owner).toBe('blue');
    expect(city.enabled).toBe(false);

    sim.flipCityOwner('b1');

    expect(city.owner).toBe('red');
    expect(city.integration).toBe(0);
    expect(city.enabled).toBe(false);
  });

  it('keeps control bounded', () => {
    const sim = new Simulation(testMap, 7);
    for (let i = 0; i < 100; i++) sim.tick();
    for (const c of sim.control) {
      expect(c).toBeGreaterThanOrEqual(-1);
      expect(c).toBeLessThanOrEqual(1);
    }
  }, 30000);

  it('exhausts front-supporting mass when city production is cut', () => {
    const width = 80;
    const map = {
      width,
      height: 1,
      initialFrontX: () => 40.4,
      riverX: () => 1000,
      forests: [],
      cities: [
        { id: 'b', name: 'Blue', x: 8, y: 0, baseProduction: 4, owner: 'blue' as const, integration: 1 },
        { id: 'r', name: 'Red', x: 71, y: 0, baseProduction: 4, owner: 'red' as const, integration: 1 },
      ],
    };

    const sim = new Simulation(map, 12345);
    for (let i = 0; i < ticks(75); i++) sim.tick();
    const initialFront = frontPosition1D(sim, width);

    const blue = sim.cities.find((c) => c.id === 'b');
    if (!blue) throw new Error('Blue city missing');
    blue.baseProduction = 0;

    for (let i = 0; i < ticks(400); i++) sim.tick();

    expect(frontPosition1D(sim, width)).toBeLessThan(initialFront - 1.5);
  });

  it('separates committed combat mass from mobile reserve', () => {
    const map = {
      width: 9,
      height: 1,
      initialFrontX: () => 4,
      riverX: () => 100,
      forests: [],
      cities: [],
    };

    function settleCommitment(blueAmount: number, redAmount: number) {
      const sim = new Simulation(map, 1);
      sim.warBlue.fill(0);
      sim.warRed.fill(0);
      sim.warBlue[3] = blueAmount;
      sim.warRed[5] = redAmount;

      const internals = sim as unknown as { computeFrontMassAndNeed(): void };
      for (let i = 0; i < 80; i++) internals.computeFrontMassAndNeed();
      return sim;
    }

    const equalFight = settleCommitment(1, 1);
    const overwhelmingBlue = settleCommitment(10, 1);
    const equalCommitted = equalFight.committedBlue[3];
    const equalReserve = equalFight.warBlue[3] - equalCommitted;
    const overwhelmingCommitted = overwhelmingBlue.committedBlue[3];
    const overwhelmingReserve = overwhelmingBlue.warBlue[3] - overwhelmingCommitted;

    expect(equalCommitted).toBeGreaterThan(0);
    expect(equalReserve).toBeGreaterThan(0);
    expect(overwhelmingCommitted).toBeGreaterThan(equalCommitted);
    expect(overwhelmingReserve).toBeGreaterThan(0);
  });

  it('commits the stronger red side in a one-dimensional superiority case', () => {
    const map = {
      width: 9,
      height: 1,
      initialFrontX: () => 4,
      riverX: () => 100,
      forests: [],
      cities: [],
    };

    const sim = new Simulation(map, 1);
    sim.warBlue.fill(0);
    sim.warRed.fill(0);
    sim.warBlue[3] = 1;
    sim.warRed[5] = 10;

    const internals = sim as unknown as { computeFrontMassAndNeed(): void };
    for (let i = 0; i < 80; i++) internals.computeFrontMassAndNeed();

    expect(sim.committedRed[5]).toBeGreaterThan(sim.committedBlue[3]);
    expect(sim.committedRed[5]).toBeGreaterThan(6);
    expect(sim.warRed[5] - sim.committedRed[5]).toBeLessThan(4);
  });

  it('treats both cells adjacent to the zero contour as frontline', () => {
    const width = 80;
    const map = {
      width,
      height: 1,
      initialFrontX: () => 40.4,
      riverX: () => 1000,
      forests: [],
      cities: [],
    };
    const sim = new Simulation(map, 1);
    const internals = sim as unknown as { isFront(i: number): boolean };

    expect(sim.control[40]).toBeGreaterThan(0);
    expect(sim.control[41]).toBeLessThan(0);
    expect(internals.isFront(40)).toBe(true);
    expect(internals.isFront(41)).toBe(true);
  });

  it('does not create frontline cells on blocked terrain', () => {
    const width = 12;
    const height = 8;
    const map = {
      width,
      height,
      initialFrontX: () => 6,
      riverX: () => 100,
      forests: [],
      cities: [],
      terrainAt: (x: number, y: number) =>
        x === 0 || y === 0 || x === width - 1 || y === height - 1 ? 'blocked' as const : 'open' as const,
    };
    const sim = new Simulation(map, 1);
    const internals = sim as unknown as { isFront(i: number): boolean };

    sim.control.fill(1);
    for (let x = 0; x < width; x++) {
      sim.control[x] = 0;
      sim.control[(height - 1) * width + x] = x < width / 2 ? 1 : -1;
    }
    for (let y = 0; y < height; y++) {
      sim.control[y * width] = 0;
      sim.control[y * width + width - 1] = y < height / 2 ? 1 : -1;
    }
    sim.control[4 * width + 5] = 1;
    sim.control[4 * width + 6] = -1;

    for (let x = 0; x < width; x++) {
      expect(sim.terrainBlocked[x]).toBe(1);
      expect(sim.terrainBlocked[(height - 1) * width + x]).toBe(1);
      expect(internals.isFront(x)).toBe(false);
      expect(internals.isFront((height - 1) * width + x)).toBe(false);
    }
    for (let y = 0; y < height; y++) {
      expect(sim.terrainBlocked[y * width]).toBe(1);
      expect(sim.terrainBlocked[y * width + width - 1]).toBe(1);
      expect(internals.isFront(y * width)).toBe(false);
      expect(internals.isFront(y * width + width - 1)).toBe(false);
    }
    expect(internals.isFront(4 * width + 5)).toBe(true);
    expect(internals.isFront(4 * width + 6)).toBe(true);
  });

  it('transports reserve without transporting committed combat mass', () => {
    const map = {
      width: 9,
      height: 1,
      initialFrontX: () => 4,
      riverX: () => 100,
      forests: [],
      cities: [],
    };

    const sim = new Simulation(map, 1);
    sim.warBlue.fill(0);
    sim.warRed.fill(0);
    sim.warBlue[3] = 10;
    sim.warRed[5] = 1;

    const internals = sim as unknown as {
      computeFrontMassAndNeed(): void;
      transportResource(side: 'blue' | 'red'): void;
    };
    for (let i = 0; i < 80; i++) internals.computeFrontMassAndNeed();

    const committedBefore = sim.committedBlue[3];
    const reserveBefore = sim.warBlue[3] - committedBefore;
    sim.sides.blue.potential.fill(0);
    sim.sides.blue.potential[3] = 1;
    sim.sides.blue.potential[2] = 2;

    const destinationBefore = sim.warBlue[2];
    internals.transportResource('blue');
    const moved = sim.warBlue[2] - destinationBefore;

    expect(moved).toBeGreaterThan(0);
    expect(moved).toBeLessThanOrEqual(reserveBefore + 1e-6);
    expect(sim.committedBlue[3]).toBeCloseTo(committedBefore, 6);
    expect(sim.warBlue[3]).toBeGreaterThanOrEqual(sim.committedBlue[3]);
  });

  it('lets distant rear resource sources participate in frontline supply', () => {
    const width = 360;
    const frontX = 250;
    const map = {
      width,
      height: 1,
      initialFrontX: () => frontX,
      riverX: () => 1000,
      forests: [],
      cities: [],
    };
    const sim = new Simulation(map, 1);
    sim.warBlue.fill(0);
    sim.warRed.fill(0);
    sim.committedBlue.fill(0);
    sim.committedRed.fill(0);
    sim.warBlue[5] = 20;
    sim.warRed[width - 6] = 20;
    sim.warBlue[frontX - 1] = 2;
    sim.warRed[frontX + 1] = 2;

    const internals = sim as unknown as {
      computeFrontMassAndNeed(): void;
      rebuildPotential(side: 'blue' | 'red'): void;
      transportResource(side: 'blue' | 'red'): void;
    };
    for (let i = 0; i < 80; i++) internals.computeFrontMassAndNeed();
    internals.rebuildPotential('blue');
    internals.rebuildPotential('red');

    expect(sim.sides.blue.potential[5]).toBeGreaterThan(0);
    expect(sim.sides.red.potential[width - 6]).toBeGreaterThan(0);

    internals.transportResource('blue');
    internals.transportResource('red');

    expect(sim.flowBlueX[5]).toBeGreaterThan(0);
    expect(sim.flowRedX[width - 6]).toBeLessThan(0);
  });

  it('keeps distant authored-map cities connected to resource flow', () => {
    const sim = new Simulation(testMap, 20260816);
    sim.warBlue.fill(0);
    sim.warRed.fill(0);
    sim.committedBlue.fill(0);
    sim.committedRed.fill(0);

    for (const cityId of ['b1', 'b2', 'b3']) {
      const city = sim.cities.find((candidate) => candidate.id === cityId);
      if (!city) throw new Error(`Missing city ${cityId}`);
      sim.warBlue[city.y * sim.width + city.x] = 100;
    }

    const internals = sim as unknown as {
      computeFrontMassAndNeed(): void;
      rebuildPotential(side: 'blue' | 'red'): void;
      transportResource(side: 'blue' | 'red'): void;
    };
    internals.computeFrontMassAndNeed();
    internals.rebuildPotential('blue');
    internals.transportResource('blue');

    const snapshot = sim.snapshot();
    expect(localFlow(snapshot, 'b1')).toBeGreaterThan(0.05);
    expect(localFlow(snapshot, 'b2')).toBeGreaterThan(0.05);
    expect(localFlow(snapshot, 'b3')).toBeGreaterThan(0.05);
  });

  it('combat attrition consumes committed mass but leaves reserve unchanged', () => {
    const map = {
      width: 9,
      height: 1,
      initialFrontX: () => 4,
      riverX: () => 100,
      forests: [],
      cities: [],
    };

    const sim = new Simulation(map, 1);
    sim.warBlue.fill(0);
    sim.committedBlue.fill(0);
    sim.warBlue[3] = 10;
    sim.committedBlue[3] = 6;

    const exposure = new Float32Array(sim.size);
    exposure[3] = 1;
    const reserveBefore = sim.warBlue[3] - sim.committedBlue[3];
    const committedBefore = sim.committedBlue[3];
    applyFrontConsumption(sim.sides.blue, exposure, CFG.dt);
    const reserveAfter = sim.warBlue[3] - sim.committedBlue[3];

    expect(sim.committedBlue[3]).toBeLessThan(committedBefore);
    expect(reserveAfter).toBeCloseTo(reserveBefore, 6);
  });

  it('releases committed mass gradually when enemy contact disappears', () => {
    const map = {
      width: 9,
      height: 1,
      initialFrontX: () => 4,
      riverX: () => 100,
      forests: [],
      cities: [],
    };
    const sim = new Simulation(map, 1);
    sim.warBlue.fill(0);
    sim.warRed.fill(0);
    sim.warBlue[3] = 10;
    sim.warRed[5] = 1;

    const internals = sim as unknown as { computeFrontMassAndNeed(): void };
    for (let i = 0; i < 120; i++) internals.computeFrontMassAndNeed();
    const committedBefore = sim.committedBlue[3];

    sim.warRed.fill(0);
    sim.control.fill(1);
    internals.computeFrontMassAndNeed();
    const immediatelyAfter = sim.committedBlue[3];
    for (let i = 0; i < 200; i++) internals.computeFrontMassAndNeed();
    const later = sim.committedBlue[3];

    expect(immediatelyAfter).toBeLessThan(committedBefore);
    expect(immediatelyAfter).toBeGreaterThan(0);
    expect(later).toBeLessThan(immediatelyAfter * 0.1);
    expect(sim.warBlue[3] - later).toBeGreaterThan(9);
  });

  it('never has committed mass larger than total War Resource', () => {
    const map = {
      width: 80,
      height: 1,
      initialFrontX: () => 40.4,
      riverX: () => 1000,
      forests: [],
      cities: [
        { id: 'b', name: 'Blue', x: 8, y: 0, baseProduction: 4, owner: 'blue' as const, integration: 1 },
        { id: 'r', name: 'Red', x: 71, y: 0, baseProduction: 4, owner: 'red' as const, integration: 1 },
      ],
    };
    const sim = new Simulation(map, 99);
    for (let step = 0; step < 500; step++) {
      sim.tick();
      for (let i = 0; i < sim.size; i++) {
        expect(sim.committedBlue[i]).toBeGreaterThanOrEqual(0);
        expect(sim.committedRed[i]).toBeGreaterThanOrEqual(0);
        expect(sim.committedBlue[i]).toBeLessThanOrEqual(sim.warBlue[i] + 1e-5);
        expect(sim.committedRed[i]).toBeLessThanOrEqual(sim.warRed[i] + 1e-5);
      }
    }
  });

  it('keeps committed mass bounded on the authored map smoke path', () => {
    const sim = new Simulation(testMap, 99);
    for (let step = 0; step < 20; step++) {
      sim.tick();
      for (let i = 0; i < sim.size; i++) {
        expect(sim.committedBlue[i]).toBeLessThanOrEqual(sim.warBlue[i] + 1e-5);
        expect(sim.committedRed[i]).toBeLessThanOrEqual(sim.warRed[i] + 1e-5);
      }
    }
  }, 30000);
});
