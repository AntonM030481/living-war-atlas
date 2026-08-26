import { bench } from 'vitest';

import { getMapDefinition } from '../../src/map/maps';
import { seedInitialEnclaves } from '../../src/sim/DebugActions';
import { Simulation } from '../../src/sim/Simulation';

const BENCHMARK_MAP_ID = 'theatre' as const;
const BENCHMARK_SEED = 1;
const POTENTIAL_CADENCE_TICKS = 10;
const STANDARD_RUN_TICKS = 100;

const map = getMapDefinition(BENCHMARK_MAP_ID);
const simulation = new Simulation(map, BENCHMARK_SEED);
seedInitialEnclaves(simulation, map, BENCHMARK_SEED);
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
