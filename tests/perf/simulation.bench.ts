import { bench } from 'vitest';

import { createCanonicalSimulation } from './fixture';

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

bench(
  'theatre: 10 ticks from Full Playground start (1 potential cadence)',
  () => {
    resetSimulation();
    for (let i = 0; i < POTENTIAL_CADENCE_TICKS; i++) simulation.tick();
  },
  { time: 1500, iterations: 10 },
);

bench(
  'theatre: 100 ticks from Full Playground start',
  () => {
    resetSimulation();
    for (let i = 0; i < STANDARD_RUN_TICKS; i++) simulation.tick();
  },
  { time: 2500, iterations: 5 },
);
