import { getMapDefinition } from '../../src/map/maps';
import { generateCityResource, updateCities } from '../../src/sim/cities';
import { CFG, type Side } from '../../src/sim/Config';
import { seedInitialEnclaves } from '../../src/sim/DebugActions';
import { Simulation } from '../../src/sim/Simulation';
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

  // Match the prefix of Simulation.tick() exactly up to the potential rebuild.
  updateCities(simulation.cities, simulation.control, simulation.width, {
    captureThreshold: CFG.cityCaptureThreshold,
    integrationPerSecond: CFG.cityIntegrationPerSecond,
    dt: CFG.dt,
  });
  generateCityResource(simulation.cities, simulation.width, simulation.sides, CFG.dt);
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
