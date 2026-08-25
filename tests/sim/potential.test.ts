import { describe, expect, it } from 'vitest';
import { createSideFields } from '../../src/sim/sides';
import {
  buildApproximatePotential,
  rebuildPotential,
  refinePotential,
} from '../../src/sim/transport';

const config = {
  dt: 0.1,
  potentialDecay: 0.99,
  potentialCoarseScale: 2,
  potentialCoarsePasses: 24,
  potentialFinePasses: 6,
  potentialRepairEnabled: true,
  baseEdgeCapacityPerSecond: 10,
  resourceCellCapacity: 12,
  resourceCongestionStrength: 0.70,
  resourceFlowResponseSeconds: 3.0,
};

function grid(width: number, height: number, isFront: (index: number) => boolean) {
  const size = width * height;
  return {
    width,
    height,
    terrainMobility: new Float32Array(size).fill(1),
    terrainCapacity: new Float32Array(size).fill(1),
    isFront,
    access: () => 1,
    edgeFactor: () => 1,
  };
}

describe('potential solver stages', () => {
  it('matches rebuildPotential when approximate and refinement stages are called explicitly', () => {
    const width = 12;
    const height = 3;
    const frontX = 10;
    const full = createSideFields(width * height);
    const staged = createSideFields(width * height);

    for (let y = 0; y < height; y++) {
      const i = y * width + frontX;
      full.need[i] = 0.5 + y * 0.25;
      staged.need[i] = full.need[i];
    }

    const transportGrid = grid(width, height, (index) => index % width === frontX);

    rebuildPotential(full, transportGrid, config);
    const approximate = buildApproximatePotential(staged, transportGrid, config);
    refinePotential(staged.potential, transportGrid, approximate);

    expect(Array.from(staged.potential)).toEqual(Array.from(full.potential));
  });

  it('coarse approximation discards stale global potential after the front moves', () => {
    const width = 20;
    let frontIndex = 18;
    const side = createSideFields(width);
    const transportGrid = grid(width, 1, (index) => index === frontIndex);

    side.need[frontIndex] = 1;
    buildApproximatePotential(side, transportGrid, config);

    side.potential.fill(7);
    side.need.fill(0);
    frontIndex = 2;
    side.need[frontIndex] = 1;

    buildApproximatePotential(side, transportGrid, config);

    expect(side.potential[18]).toBeLessThan(side.potential[frontIndex]);
    expect(side.potential[18]).not.toBe(7);
  });

  it('can disable transition repair in the previous-solution approximation', () => {
    const width = 12;
    let frontIndex = 10;
    const repaired = createSideFields(width);
    const unrepaired = createSideFields(width);
    const transportGrid = grid(width, 1, (index) => index === frontIndex);
    const previousConfig = {
      ...config,
      potentialApproximation: 'previous' as const,
    };

    repaired.need[frontIndex] = 1;
    unrepaired.need[frontIndex] = 1;
    buildApproximatePotential(repaired, transportGrid, previousConfig);
    buildApproximatePotential(unrepaired, transportGrid, previousConfig);

    repaired.potential.fill(7);
    unrepaired.potential.fill(7);
    repaired.need.fill(0);
    unrepaired.need.fill(0);
    frontIndex = 1;
    repaired.need[frontIndex] = 1;
    unrepaired.need[frontIndex] = 1;

    buildApproximatePotential(repaired, transportGrid, previousConfig);
    buildApproximatePotential(unrepaired, transportGrid, {
      ...previousConfig,
      potentialRepairEnabled: false,
    });

    expect(repaired.potential[10]).toBeLessThan(7);
    expect(unrepaired.potential[10]).toBe(7);
  });
});
