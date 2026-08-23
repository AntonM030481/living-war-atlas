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
  resourceCongestionStrength: 0.70,
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

  it('moves a smaller fraction of resource from a denser source cell', () => {
    const grid = {
      width: 2,
      height: 1,
      terrainMobility: new Float32Array([1, 1]),
      terrainCapacity: new Float32Array([1, 1]),
      isFront: (index: number) => index === 1,
      access: () => 1,
      edgeFactor: () => 1,
    };
    const unconstrained = { ...config, baseEdgeCapacityPerSecond: 1000 };

    const sparse = createSideFields(2);
    sparse.war[0] = 3;
    sparse.potential.set([1, 2]);
    transportResource(sparse, grid, unconstrained);
    const sparseMovedFraction = sparse.war[1] / 3;

    const dense = createSideFields(2);
    dense.war[0] = 12;
    dense.potential.set([1, 2]);
    transportResource(dense, grid, unconstrained);
    const denseMovedFraction = dense.war[1] / 12;

    expect(denseMovedFraction).toBeLessThan(sparseMovedFraction);
    expect(dense.war[1]).toBeGreaterThan(0);
  });

  it('routes potential around a congested cell', () => {
    const side = createSideFields(4);
    // 2x2 grid: source=0, crowded direct=1, open detour=2, front=3.
    side.war.set([6, 11.5, 0, 0]);
    side.need[3] = 1;

    const grid = {
      width: 2,
      height: 2,
      terrainMobility: new Float32Array([1, 1, 1, 1]),
      terrainCapacity: new Float32Array([1, 1, 1, 1]),
      isFront: (index: number) => index === 3,
      access: () => 1,
      edgeFactor: () => 1,
    };

    rebuildPotential(side, grid, config);

    expect(side.potential[2]).toBeGreaterThan(side.potential[1]);
    transportResource(side, grid, { ...config, baseEdgeCapacityPerSecond: 1000 });
    expect(side.war[2]).toBeGreaterThan(0);
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
