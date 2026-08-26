import { describe, expect, it } from 'vitest';
import { rasterizeRivers } from '../../src/sim/rivers';

describe('river rasterization', () => {
  it('applies terrain strength and crossing penalties to every branch', () => {
    const width = 20;
    const height = 20;
    const rivers = [
      [{ x: 2, y: 2 }, { x: 17, y: 17 }],
      [{ x: 2, y: 12 }, { x: 10, y: 10 }],
    ];

    const raster = rasterizeRivers(width, height, rivers);

    expect(raster.strength[10 * width + 10]).toBeGreaterThan(0);
    expect(raster.strength[12 * width + 2]).toBeGreaterThan(0);
    expect([...raster.crossingX, ...raster.crossingY].some((value) => value < 1)).toBe(true);
  });

  it('leaves terrain untouched when there are no rivers', () => {
    const raster = rasterizeRivers(8, 6, []);
    expect(Array.from(raster.strength).every((value) => value === 0)).toBe(true);
    expect(Array.from(raster.crossingX).every((value) => value === 1)).toBe(true);
    expect(Array.from(raster.crossingY).every((value) => value === 1)).toBe(true);
  });
});
