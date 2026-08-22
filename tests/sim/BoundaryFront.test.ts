import { describe, expect, it } from 'vitest';
import { Simulation } from '../../src/sim/Simulation';
import type { MapDefinition } from '../../src/sim/types';

const boundaryMap: MapDefinition = {
  width: 8,
  height: 5,
  initialFrontX: () => 0,
  cities: [],
  forests: [],
  riverX: () => 100,
};

describe('map boundary', () => {
  it('allows the front to exist at the edge of the map', () => {
    const sim = new Simulation(boundaryMap, 1);
    const snapshot = sim.snapshot();

    expect(snapshot.stats.frontCells).toBeGreaterThan(0);
    expect(snapshot.control[0]).toBeCloseTo(0, 6);
  });
});
