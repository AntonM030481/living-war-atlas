import { describe, expect, it } from 'vitest';
import { createSideFields } from '../../src/sim/sides';
import { rebuildPotential, transportResource } from '../../src/sim/transport';

const config = {
  dt: 0.1,
  potentialDecay: 0.99,
  baseEdgeCapacityPerSecond: 10,
  resourceMoveFraction: 0.5,
  resourceCellCapacity: 12,
  resourceFrontCellCapacity: 24,
  resourceRearTargetUtilization: 0.06,
  resourceFrontTargetUtilization: 0.78,
  resourceTargetDensityExponent: 1.35,
  resourceDestinationDeficitBias: 0.75,
  resourceBelowTargetMoveFactor: 0.18,
};

describe('transport', () => {
  it('moves reserve along potential without moving committed mass', () => {
    const side = createSideFields(4);
    side.war[0] = 10;
    side.committed[0] = 6;
    side.potential.set([1, 2, 3, 4]);

    const grid = {
      width: 4,
      height: 1,
      terrainMobility: new Float32Array([1, 1, 1, 1]),
      terrainCapacity: new Float32Array([1, 1, 1, 1]),
      isFront: () => false,
      access: () => 1,
      edgeFactor: () => 1,
    };

    transportResource(side, grid, config);

    expect(side.war[1]).toBeGreaterThan(0);
    expect(side.committed[0]).toBe(6);
    expect(side.war[0]).toBeGreaterThanOrEqual(side.committed[0]);
  });

  it('does not overfill a destination cell', () => {
    const side = createSideFields(3);
    side.war.set([10, 11.8, 0]);
    side.potential.set([1, 2, 3]);

    const grid = {
      width: 3,
      height: 1,
      terrainMobility: new Float32Array([1, 1, 1]),
      terrainCapacity: new Float32Array([1, 1, 1]),
      isFront: () => false,
      access: () => 1,
      edgeFactor: () => 1,
    };

    const before = side.war.reduce((sum, value) => sum + value, 0);
    transportResource(side, grid, config);
    const after = side.war.reduce((sum, value) => sum + value, 0);

    expect(side.war[1]).toBeLessThanOrEqual(config.resourceCellCapacity + 1e-6);
    expect(after).toBeCloseTo(before, 6);
  });

  it('allows a front cell to hold more resource than a rear cell', () => {
    const side = createSideFields(2);
    side.war.set([12, 12]);
    side.potential.set([1, 2]);

    const grid = {
      width: 2,
      height: 1,
      terrainMobility: new Float32Array([1, 1]),
      terrainCapacity: new Float32Array([1, 1]),
      isFront: (index: number) => index === 1,
      access: () => 1,
      edgeFactor: () => 1,
    };

    transportResource(side, grid, config);

    expect(side.war[1]).toBeGreaterThan(config.resourceCellCapacity);
    expect(side.war[1]).toBeLessThanOrEqual(config.resourceFrontCellCapacity + 1e-6);
  });

  it('retains a denser operational reserve near the front', () => {
    const side = createSideFields(4);
    side.war.set([10, 10, 10, 0]);
    side.potential.set([1, 2, 3, 4]);

    const grid = {
      width: 4,
      height: 1,
      terrainMobility: new Float32Array([1, 1, 1, 1]),
      terrainCapacity: new Float32Array([1, 1, 1, 1]),
      isFront: (index: number) => index === 3,
      access: () => 1,
      edgeFactor: () => 1,
    };

    transportResource(side, grid, config);

    expect(side.war[2]).toBeGreaterThan(side.war[0]);
    expect(side.war[2]).toBeGreaterThan(config.resourceCellCapacity * 0.5);
  });

  it('keeps feeding the front even when the source is below its target density', () => {
    const side = createSideFields(2);
    side.war.set([0.2, 0]);
    side.potential.set([1, 2]);

    const grid = {
      width: 2,
      height: 1,
      terrainMobility: new Float32Array([1, 1]),
      terrainCapacity: new Float32Array([1, 1]),
      isFront: (index: number) => index === 1,
      access: () => 1,
      edgeFactor: () => 1,
    };

    transportResource(side, grid, config);

    expect(side.war[1]).toBeGreaterThan(0);
  });

  it('propagates potential through a long connected region', () => {
    const width = 20;
    const side = createSideFields(width);
    side.need[width - 1] = 1;
    const grid = {
      width,
      height: 1,
      terrainMobility: new Float32Array(width).fill(1),
      terrainCapacity: new Float32Array(width).fill(1),
      isFront: (index: number) => index === width - 1,
      access: () => 1,
      edgeFactor: () => 1,
    };

    rebuildPotential(side, grid, config);

    expect(side.potential[0]).toBeGreaterThan(0);
    expect(side.potential[width - 1]).toBeGreaterThan(side.potential[0]);
  });
});
