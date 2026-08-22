import { describe, expect, it } from 'vitest';
import { testMap } from '../../src/map/testMap';
import { CFG } from '../../src/sim/Config';
import { forceCityEnclave, FORCED_ENCLAVE_RADIUS } from '../../src/sim/DebugActions';
import { Simulation } from '../../src/sim/Simulation';

function localSignChanges(sim: Simulation, cx: number, cy: number, radius: number): number {
  let changes = 0;
  const minX = Math.max(0, Math.floor(cx - radius));
  const maxX = Math.min(sim.width - 1, Math.ceil(cx + radius));
  const minY = Math.max(0, Math.floor(cy - radius));
  const maxY = Math.min(sim.height - 1, Math.ceil(cy + radius));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const value = sim.control[y * sim.width + x];
      if (x < maxX) {
        const right = sim.control[y * sim.width + x + 1];
        if (value * right < 0) changes += 1;
      }
      if (y < maxY) {
        const down = sim.control[(y + 1) * sim.width + x];
        if (value * down < 0) changes += 1;
      }
    }
  }

  return changes;
}

describe('forceCityEnclave', () => {
  it('creates a closed secondary front that is not recaptured on the next tick', () => {
    const sim = new Simulation(testMap, 1);
    const city = sim.cities.find((candidate) => candidate.id === 'b1');
    if (!city) throw new Error('Missing b1');

    const redBefore = sim.warRed[city.y * sim.width + city.x];
    expect(forceCityEnclave(sim, city.id)).toBe(true);

    const center = city.y * sim.width + city.x;
    expect(city.owner).toBe('red');
    expect(city.integration).toBe(0);
    expect(sim.control[center]).toBeLessThan(-CFG.cityCaptureThreshold);
    expect(sim.warRed[center]).toBeGreaterThan(redBefore);
    expect(localSignChanges(sim, city.x, city.y, FORCED_ENCLAVE_RADIUS + 2)).toBeGreaterThan(4);

    sim.tick();

    expect(city.owner).toBe('red');
    expect(sim.control[center]).toBeLessThan(-CFG.cityCaptureThreshold);
    expect(localSignChanges(sim, city.x, city.y, FORCED_ENCLAVE_RADIUS + 2)).toBeGreaterThan(4);
  });
});
