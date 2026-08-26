import { bench } from 'vitest';

import { generateCityResource, updateCities } from '../../src/sim/cities';
import { CFG, type Side } from '../../src/sim/Config';
import { Simulation } from '../../src/sim/Simulation';
import { createCanonicalSimulation } from './fixture';

const CHECKPOINTS = [0, 50, 100] as const;
const STAGE_OPTIONS = { time: 800, iterations: 5 } as const;
const SIDES: readonly Side[] = ['blue', 'red'];

type SimulationInternals = {
  computeFrontMassAndNeed(): void;
  rebuildPotential(side: Side): void;
  transportResource(side: Side): void;
  resolveCombatAndInstability(): void;
  updateControl(): void;
};

function internals(simulation: Simulation): SimulationInternals {
  return simulation as unknown as SimulationInternals;
}

function runCities(simulation: Simulation): void {
  updateCities(simulation.cities, simulation.control, simulation.width, {
    captureThreshold: CFG.cityCaptureThreshold,
    integrationPerSecond: CFG.cityIntegrationPerSecond,
    dt: CFG.dt,
  });
  generateCityResource(simulation.cities, simulation.width, simulation.sides, CFG.dt);
}

function runPotential(simulation: Simulation): void {
  const sim = internals(simulation);
  for (const side of SIDES) sim.rebuildPotential(side);
}

function runTransport(simulation: Simulation): void {
  const sim = internals(simulation);
  for (const side of SIDES) sim.transportResource(side);
}

for (const ticks of CHECKPOINTS) {
  const simulation = createCanonicalSimulation(ticks);
  const baseState = simulation.saveState();
  const sim = internals(simulation);
  const label = `theatre @ ${ticks} ticks`;

  const reset = () => simulation.restoreState(baseState);
  const setupFront = () => {
    reset();
    runCities(simulation);
  };
  const setupTransport = () => {
    setupFront();
    sim.computeFrontMassAndNeed();
    runPotential(simulation);
  };
  const setupCombat = () => {
    setupTransport();
    runTransport(simulation);
  };
  const setupControl = () => {
    setupCombat();
    sim.resolveCombatAndInstability();
  };

  bench(
    `${label}: tick stage / cities`,
    () => {
      runCities(simulation);
    },
    { ...STAGE_OPTIONS, setup: reset },
  );

  bench(
    `${label}: tick stage / front mass+need`,
    () => {
      sim.computeFrontMassAndNeed();
    },
    { ...STAGE_OPTIONS, setup: setupFront },
  );

  bench(
    `${label}: tick stage / transport`,
    () => {
      runTransport(simulation);
    },
    { ...STAGE_OPTIONS, setup: setupTransport },
  );

  bench(
    `${label}: tick stage / combat`,
    () => {
      sim.resolveCombatAndInstability();
    },
    { ...STAGE_OPTIONS, setup: setupCombat },
  );

  bench(
    `${label}: tick stage / control`,
    () => {
      sim.updateControl();
    },
    { ...STAGE_OPTIONS, setup: setupControl },
  );
}
