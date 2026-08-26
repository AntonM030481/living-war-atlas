import { bench } from 'vitest';

import { createCanonicalSimulation } from './fixture';

const CHECKPOINTS = [0, 50, 100] as const;
const POTENTIAL_CADENCE_TICKS = 10;
const STANDARD_RUN_TICKS = 100;

const simulation = createCanonicalSimulation();
const benchmarkStartState = simulation.saveState();

function resetSimulation(): void {
  simulation.restoreState(benchmarkStartState);
}

bench(
  'theatre: reset canonical Full Playground state',
  () => {
    resetSimulation();
  },
  { time: 1000, iterations: 20 },
);

for (const ticks of CHECKPOINTS) {
  const checkpointSimulation = createCanonicalSimulation(ticks);
  const checkpointState = checkpointSimulation.saveState();

  bench(
    `theatre @ ${ticks} ticks: 1 tick with potential rebuild`,
    () => {
      checkpointSimulation.restoreState(checkpointState);
      checkpointSimulation.tick();
    },
    { time: 1200, iterations: 5 },
  );

  bench(
    `theatre @ ${ticks} ticks: 10 ticks (1 potential cadence)`,
    () => {
      checkpointSimulation.restoreState(checkpointState);
      for (let i = 0; i < POTENTIAL_CADENCE_TICKS; i++) checkpointSimulation.tick();
    },
    { time: 1500, iterations: 5 },
  );
}

bench(
  'theatre: 100 ticks from Full Playground start',
  () => {
    resetSimulation();
    for (let i = 0; i < STANDARD_RUN_TICKS; i++) simulation.tick();
  },
  { time: 2500, iterations: 5 },
);
