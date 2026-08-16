import { describe, expect, it } from 'vitest';
import { Simulation } from './Simulation';
import { testMap } from '../map/testMap';

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

describe('Simulation', () => {
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

  it('cities generate war resource', () => {
    const sim = new Simulation(testMap, 1);
    const before = total(sim.warBlue) + total(sim.warRed);
    sim.tick();
    const after = total(sim.warBlue) + total(sim.warRed);
    expect(after).toBeGreaterThan(0);
    expect(Number.isFinite(before)).toBe(true);
  });

  it('keeps control bounded', () => {
    const sim = new Simulation(testMap, 7);
    for (let i = 0; i < 100; i++) sim.tick();
    for (const c of sim.control) {
      expect(c).toBeGreaterThanOrEqual(-1);
      expect(c).toBeLessThanOrEqual(1);
    }
  });

  it('exhausts front-supporting mass when city production is cut', () => {
    const width = 80;
    const map = {
      width,
      height: 1,
      initialFrontX: () => 40.4,
      riverX: () => 1000,
      mountains: [],
      cities: [
        { id: 'b', name: 'Blue', x: 8, y: 0, baseProduction: 4, owner: 'blue' as const, integration: 1 },
        { id: 'r', name: 'Red', x: 71, y: 0, baseProduction: 4, owner: 'red' as const, integration: 1 },
      ],
    };

    const sim = new Simulation(map, 12345);
    sim.runWarmup(75);
    const initialFront = frontPosition1D(sim, width);

    const blue = sim.cities.find((c) => c.id === 'b');
    if (!blue) throw new Error('Blue city missing');
    blue.baseProduction = 0;

    for (let i = 0; i < 400 / 0.1; i++) sim.tick();

    // With no production, Blue must not be able to keep defending forever
    // using resource that contributes to frontMass but never pays attrition.
    expect(frontPosition1D(sim, width)).toBeLessThan(initialFront - 1.5);
  });

  it('separates committed combat mass from mobile reserve', () => {
    const map = {
      width: 9,
      height: 1,
      initialFrontX: () => 4,
      riverX: () => 100,
      mountains: [],
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

    // Roughly equal contact commits most of the available local resource.
    expect(equalFight.committedBlue[3]).toBeGreaterThan(0.75);
    expect(equalFight.warBlue[3] - equalFight.committedBlue[3]).toBeLessThan(0.25);

    // In a one-front 1D fight, local surplus should become offensive
    // commitment instead of idling as reserve with no competing demand.
    expect(overwhelmingBlue.committedBlue[3]).toBeGreaterThan(6);
    expect(overwhelmingBlue.warBlue[3] - overwhelmingBlue.committedBlue[3]).toBeLessThan(4);
  });

  it('commits the stronger red side in a one-dimensional superiority case', () => {
    const map = {
      width: 9,
      height: 1,
      initialFrontX: () => 4,
      riverX: () => 100,
      mountains: [],
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
      mountains: [],
      cities: [],
    };
    const sim = new Simulation(map, 1);
    const internals = sim as unknown as { isFront(i: number): boolean };

    expect(sim.control[40]).toBeGreaterThan(0);
    expect(sim.control[41]).toBeLessThan(0);
    expect(internals.isFront(40)).toBe(true);
    expect(internals.isFront(41)).toBe(true);
  });

  it('transports reserve without transporting committed combat mass', () => {
    const map = {
      width: 9,
      height: 1,
      initialFrontX: () => 4,
      riverX: () => 100,
      mountains: [],
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
      potentialBlue: Float32Array;
    };
    for (let i = 0; i < 80; i++) internals.computeFrontMassAndNeed();

    const committedBefore = sim.committedBlue[3];
    const reserveBefore = sim.warBlue[3] - committedBefore;
    internals.potentialBlue.fill(0);
    internals.potentialBlue[3] = 1;
    internals.potentialBlue[2] = 2; // deliberately request rearward redeployment

    const destinationBefore = sim.warBlue[2];
    internals.transportResource('blue');
    const moved = sim.warBlue[2] - destinationBefore;

    expect(moved).toBeGreaterThan(0);
    expect(moved).toBeLessThanOrEqual(reserveBefore + 1e-6);
    expect(sim.committedBlue[3]).toBeCloseTo(committedBefore, 6);
    expect(sim.warBlue[3]).toBeGreaterThanOrEqual(sim.committedBlue[3]);
  });

  it('combat attrition consumes committed mass but leaves reserve unchanged', () => {
    const map = {
      width: 9,
      height: 1,
      initialFrontX: () => 4,
      riverX: () => 100,
      mountains: [],
      cities: [],
    };

    const sim = new Simulation(map, 1);
    sim.warBlue.fill(0);
    sim.committedBlue.fill(0);
    sim.warBlue[3] = 10;
    sim.committedBlue[3] = 6;

    const internals = sim as unknown as {
      frontConsumption: Float32Array;
      applyFrontConsumption(): void;
    };
    internals.frontConsumption.fill(0);
    internals.frontConsumption[3] = 1;

    const reserveBefore = sim.warBlue[3] - sim.committedBlue[3];
    const committedBefore = sim.committedBlue[3];
    internals.applyFrontConsumption();
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
      mountains: [],
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
    expect(immediatelyAfter).toBeGreaterThan(0); // no instantaneous disengagement
    expect(later).toBeLessThan(immediatelyAfter * 0.1);
    expect(sim.warBlue[3] - later).toBeGreaterThan(9);
  });

  it('never has committed mass larger than total War Resource', () => {
    const map = {
      width: 80,
      height: 1,
      initialFrontX: () => 40.4,
      riverX: () => 1000,
      mountains: [],
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
