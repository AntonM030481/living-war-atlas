import { describe, expect, it } from 'vitest';
import { CFG } from '../../src/sim/Config';
import { prepareFinePotential } from '../../src/sim/potential';
import { RegionTopology } from '../../src/sim/regions';
import { SimulationTopology } from '../../src/sim/topology';
import type { MapDefinition } from '../../src/sim/types';
import type { TransportGrid } from '../../src/sim/transportGrid';

function regionMap(): MapDefinition {
  return {
    width: 4,
    height: 1,
    initialFrontX: () => 2,
    cities: [
      { id: 'west-city', name: 'West', x: 0, y: 0, baseProduction: 1, owner: 'blue', integration: 1 },
      { id: 'east-city', name: 'East', x: 3, y: 0, baseProduction: 1, owner: 'red', integration: 1 },
    ],
    regions: [
      { id: 'west', cityId: 'west-city' },
      { id: 'east', cityId: 'east-city' },
    ],
    regionAt: (x) => x < 2 ? 'west' : 'east',
    forests: [],
    rivers: [],
    seedInitialResource: false,
  };
}

describe('RegionTopology', () => {
  it('keeps inter-region borders closed until explicitly opened', () => {
    const regions = new RegionTopology(regionMap());

    expect(regions.neighbors('west')).toEqual(['east']);
    expect(regions.edgeFactor(1, 2)).toBe(0);
    expect(regions.isPotentialFront(1)).toBe(true);
    expect(regions.isPotentialFront(2)).toBe(true);

    regions.setBorderOpen('west', 'east', true);

    expect(regions.edgeFactor(1, 2)).toBe(1);
    expect(regions.isPotentialFront(1)).toBe(false);
    expect(regions.openBorders()).toEqual([['east', 'west']]);
  });

  it('does not classify opposing control across a closed border as an actual front', () => {
    const map = regionMap();
    const regions = new RegionTopology(map);
    const control = new Float32Array([1, 1, -1, -1]);
    const blocked = new Uint8Array(4);
    const riverX = new Float32Array(4); riverX.fill(1);
    const riverY = new Float32Array(4); riverY.fill(1);
    const topology = new SimulationTopology({
      width: 4,
      height: 1,
      control,
      blocked,
      riverCrossingX: riverX,
      riverCrossingY: riverY,
    }, regions);

    expect(topology.isFront(1)).toBe(false);
    expect(topology.potentialDemand(1)).toBe(CFG.potentialFrontDemand);

    regions.setBorderOpen('west', 'east', true);

    expect(topology.isFront(1)).toBe(true);
    expect(topology.potentialDemand(1)).toBe(0);
  });

  it('allows a potential frontier to seed the normal potential field', () => {
    const terrain = new Float32Array([1, 1, 1]);
    const grid: TransportGrid = {
      width: 3,
      height: 1,
      terrainMobility: terrain,
      terrainCapacity: terrain,
      isFront: () => false,
      potentialDemand: (index) => index === 2 ? 0.2 : 0,
      access: () => 1,
      edgeFactor: () => 1,
    };
    const need = new Float32Array(3);
    const potential = new Float32Array(3);

    const context = prepareFinePotential({ need, potential }, grid, CFG);

    expect(context.currentStatus[2]).toBe(2);
    expect(context.smoothedNeed[2]).toBeCloseTo(0.2);
    expect(potential[2]).toBeCloseTo(1.2);
  });
});
