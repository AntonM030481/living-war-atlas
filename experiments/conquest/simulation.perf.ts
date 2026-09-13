import { bench, describe, type BenchOptions } from 'vitest';
import { generateCityResource, updateCities } from '../../src/sim/cities';
import { CFG, type Side } from '../../src/sim/Config';
import { prepareFinePotential, rebuildPotential } from '../../src/sim/potential';
import { transportResource } from '../../src/sim/transport';
import { createConquestFixture, internals, SCENARIOS, MAP_ID, SEED } from './fixture';

const SIDES: Side[] = ['blue', 'red'];
const OPTIONS = { time: 500, iterations: 5, warmupTime: 100, warmupIterations: 1 };

function withReset(reset: () => void): BenchOptions {
  return {
    ...OPTIONS,
    // Vitest 3 exposes Bench options, not Task options. setup runs only once
    // per warmup/run; install Tinybench's per-invocation hook on the task.
    setup(task) { task.opts.beforeEach = reset; },
  };
}

for (const scenario of SCENARIOS) {
  describe(`Conquest / ${MAP_ID} / seed ${SEED} / ${scenario}`, async () => {
    const fixture = await createConquestFixture(scenario);
    const { session, reset } = fixture;
    const simulation = session.simulation;
    const sim = internals(simulation);
    const grids = { blue: sim.transportGrid('blue'), red: sim.transportGrid('red') };

    function beforePotential(): void {
      reset();
      session.mode.beforeTick(simulation);
      updateCities(simulation.cities, simulation.control, simulation.width, {
        captureThreshold: CFG.cityCaptureThreshold,
        integrationPerSecond: CFG.cityIntegrationPerSecond,
        dt: CFG.dt,
      });
      generateCityResource(simulation.cities, simulation.width, simulation.sides, CFG.dt);
      sim.computeFrontMassAndNeed();
    }
    function potential(): void {
      for (const side of SIDES) rebuildPotential(simulation.sides[side], grids[side], CFG);
    }

    bench('restore checkpoint (harness only)', reset, OPTIONS);
    bench('session tick with potential rebuild', () => session.tick(), withReset(reset));
    bench(`${CFG.potentialEverySteps} session ticks (one rebuild cadence)`, () => {
      for (let i = 0; i < CFG.potentialEverySteps; i++) session.tick();
    }, withReset(reset));
    bench('potential preparation / both sides', () => {
      for (const side of SIDES) prepareFinePotential(simulation.sides[side], grids[side], CFG);
    }, withReset(beforePotential));
    bench('potential rebuild / both sides (includes preparation)', potential, withReset(beforePotential));
    bench('resource transport / both sides', () => {
      for (const side of SIDES) transportResource(simulation.sides[side], grids[side], CFG);
    }, withReset(() => { beforePotential(); potential(); }));
  });
}
