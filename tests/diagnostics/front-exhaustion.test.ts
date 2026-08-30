import { describe, expect, it } from 'vitest';
import { smallLinearMap } from '../../src/map/smallLinearMap';
import { ticks } from '../../src/sim/Config';
import { Simulation } from '../../src/sim/Simulation';

function frontPosition1D(sim: Simulation, width: number, y = 0): number {
  const row = y * width;
  for (let x = 0; x < width - 1; x++) {
    const a = sim.control[row + x];
    const b = sim.control[row + x + 1];
    if (a >= 0 && b <= 0) {
      const t = a / (a - b || 1);
      return x + t;
    }
  }
  return sim.control[row] < 0 ? 0 : width - 1;
}

describe('Front exhaustion diagnostics', () => {
  it('exhausts front-supporting mass when city production is cut', () => {
    const sim = new Simulation(smallLinearMap, 12345);
    const y = Math.floor(sim.height / 2);
    for (let i = 0; i < ticks(75); i++) sim.tick();
    const initialFront = frontPosition1D(sim, sim.width, y);

    const blue = sim.cities.find((city) => city.id === 'b1');
    if (!blue) throw new Error('Blue city missing');
    blue.baseProduction = 0;

    for (let i = 0; i < ticks(400); i++) sim.tick();

    expect(frontPosition1D(sim, sim.width, y)).toBeLessThan(initialFront - 1.5);
  }, 15_000);
});
