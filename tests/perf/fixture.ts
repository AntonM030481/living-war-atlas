import { getMapDefinition } from '../../src/map/maps';
import { seedInitialEnclaves } from '../../src/sim/DebugActions';
import { Simulation } from '../../src/sim/Simulation';
import type { Side } from '../../src/sim/Config';
import { requireSide, type SideFields } from '../../src/sim/sides';
import type { TransportGrid } from '../../src/sim/transportGrid';

export const BENCHMARK_MAP_ID = 'theatre' as const;
export const BENCHMARK_SEED = 1;

const map = getMapDefinition(BENCHMARK_MAP_ID);

type SimulationInternals = {
  computeFrontMassAndNeed(): void;
  transportGrid(side: Side): TransportGrid;
};

function internals(simulation: Simulation): SimulationInternals {
  return simulation as unknown as SimulationInternals;
}

export function createCanonicalSimulation(ticks = 0): Simulation {
  const simulation = new Simulation(map, BENCHMARK_SEED);
  seedInitialEnclaves(simulation, map, BENCHMARK_SEED);
  for (let i = 0; i < ticks; i++) simulation.tick();
  return simulation;
}

export interface PotentialBenchmarkSide {
  fields: SideFields;
  grid: TransportGrid;
  initialPotential: Float32Array;
}

export interface PotentialBenchmarkFixture {
  simulation: Simulation;
  blue: PotentialBenchmarkSide;
  red: PotentialBenchmarkSide;
}

export function createPotentialBenchmarkFixture(ticks: number): PotentialBenchmarkFixture {
  const simulation = createCanonicalSimulation(ticks);
  internals(simulation).computeFrontMassAndNeed();

  function sideFixture(side: Side): PotentialBenchmarkSide {
    const fields = requireSide(simulation.sides, side);
    return {
      fields,
      grid: internals(simulation).transportGrid(side),
      initialPotential: fields.potential.slice(),
    };
  }

  return {
    simulation,
    blue: sideFixture('blue'),
    red: sideFixture('red'),
  };
}
