import { describe, expect, it } from 'vitest';
import { Simulation } from './Simulation';
import { testMap } from '../map/testMap';

function total(a: Float32Array): number {
  let sum = 0;
  for (const value of a) sum += value;
  return sum;
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
});
