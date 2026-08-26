import { bench } from 'vitest';

import { CFG } from '../../src/sim/Config';
import {
  buildFineRelaxationStencil,
  prepareFinePotential,
  rebuildPotential,
  refinePotential,
} from '../../src/sim/potential';
import {
  buildCoarseGrid,
  buildCoarseRelaxationStencil,
  coarseEdgeTransmission,
  projectCoarsePotential,
  solveCoarsePotential,
} from '../../src/sim/potentialApproximation/coarse';
import { solveMultiSourceDijkstra } from '../../src/sim/potentialApproximation/shortestPath';
import { TRANSPORT_EPS as EPS } from '../../src/sim/transportGrid';
import { createPotentialBenchmarkFixture } from './fixture';

const CHECKPOINTS = [0, 50, 100] as const;
const STAGE_OPTIONS = { time: 800, iterations: 5 } as const;
const FULL_OPTIONS = { time: 1200, iterations: 5 } as const;

function makeDijkstraSeed(
  coarse: ReturnType<typeof buildCoarseGrid>,
  distances: Float64Array,
  sources: Int32Array,
): Float32Array {
  const safeDecay = Math.max(EPS, Math.min(0.999999, CFG.potentialDecay));
  const logDecay = Math.log(safeDecay);
  const seed = new Float32Array(coarse.width * coarse.height);

  for (let i = 0; i < seed.length; i++) {
    if (coarse.status[i] === 0 || !Number.isFinite(distances[i]) || sources[i] < 0) {
      seed[i] = 0;
    } else if (coarse.status[i] === 2) {
      seed[i] = coarse.boundaryPotential[i];
    } else {
      const sourcePotential = coarse.boundaryPotential[sources[i]];
      seed[i] = Math.max(0, sourcePotential * Math.exp(logDecay * distances[i]));
    }
  }
  return seed;
}

for (const ticks of CHECKPOINTS) {
  const fixture = createPotentialBenchmarkFixture(ticks);
  const { blue, red } = fixture;
  const label = `theatre @ ${ticks} ticks`;

  bench(
    `${label}: potential rebuild / blue`,
    () => {
      blue.fields.potential.set(blue.initialPotential);
      rebuildPotential(blue.fields, blue.grid, CFG);
    },
    FULL_OPTIONS,
  );

  bench(
    `${label}: potential rebuild / both sides`,
    () => {
      blue.fields.potential.set(blue.initialPotential);
      red.fields.potential.set(red.initialPotential);
      rebuildPotential(blue.fields, blue.grid, CFG);
      rebuildPotential(red.fields, red.grid, CFG);
    },
    FULL_OPTIONS,
  );

  const preparedPotential = blue.initialPotential.slice();
  const context = prepareFinePotential(
    { need: blue.fields.need, potential: preparedPotential },
    blue.grid,
    CFG,
  );
  const stencil = buildFineRelaxationStencil(blue.grid, context.currentStatus, context.reaction);
  const approximate = { ...context, stencil };
  const scale = Math.max(2, Math.round(CFG.potentialCoarseScale));
  const coarse = buildCoarseGrid(blue.grid, context, scale);
  const dijkstraGrid = {
    width: coarse.width,
    height: coarse.height,
    status: coarse.status,
    edgeCost: (x: number, y: number, dx: number, dy: number) => {
      const transmission = coarseEdgeTransmission(x, y, dx, dy, coarse);
      return transmission > EPS
        ? coarse.scale / Math.sqrt(Math.max(transmission, EPS))
        : Number.POSITIVE_INFINITY;
    },
  };
  const shortestPath = solveMultiSourceDijkstra(dijkstraGrid);
  const seed = makeDijkstraSeed(coarse, shortestPath.distances, shortestPath.sources);
  const coarsePasses = Math.max(1, Math.round(CFG.potentialCoarsePasses));
  const coarseStencil = buildCoarseRelaxationStencil(coarse, CFG.potentialDecay);
  const coarsePotential = solveCoarsePotential(
    coarse,
    CFG.potentialDecay,
    coarsePasses,
    seed,
    coarseStencil,
  );
  const projectedPotential = new Float32Array(blue.fields.potential.length);
  projectCoarsePotential(projectedPotential, coarsePotential, coarse, blue.grid, context);
  const finePotential = projectedPotential.slice();
  const finePasses = Math.max(1, Math.round(CFG.potentialFinePasses));
  const prepareInput = blue.initialPotential.slice();
  const projectionOutput = new Float32Array(projectedPotential.length);

  bench(
    `${label}: potential stage / prepare`,
    () => {
      prepareInput.set(blue.initialPotential);
      prepareFinePotential({ need: blue.fields.need, potential: prepareInput }, blue.grid, CFG);
    },
    STAGE_OPTIONS,
  );

  bench(
    `${label}: potential stage / fine stencil`,
    () => {
      buildFineRelaxationStencil(blue.grid, context.currentStatus, context.reaction);
    },
    STAGE_OPTIONS,
  );

  bench(
    `${label}: potential stage / coarse grid`,
    () => {
      buildCoarseGrid(blue.grid, context, scale);
    },
    STAGE_OPTIONS,
  );

  bench(
    `${label}: potential stage / dijkstra`,
    () => {
      solveMultiSourceDijkstra(dijkstraGrid);
    },
    STAGE_OPTIONS,
  );

  bench(
    `${label}: potential stage / coarse stencil`,
    () => {
      buildCoarseRelaxationStencil(coarse, CFG.potentialDecay);
    },
    STAGE_OPTIONS,
  );

  bench(
    `${label}: potential stage / coarse relaxation`,
    () => {
      solveCoarsePotential(coarse, CFG.potentialDecay, coarsePasses, seed, coarseStencil);
    },
    STAGE_OPTIONS,
  );

  bench(
    `${label}: potential stage / projection`,
    () => {
      projectCoarsePotential(projectionOutput, coarsePotential, coarse, blue.grid, context);
    },
    STAGE_OPTIONS,
  );

  bench(
    `${label}: potential stage / fine relaxation`,
    () => {
      finePotential.set(projectedPotential);
      refinePotential(finePotential, blue.grid, approximate, finePasses);
    },
    STAGE_OPTIONS,
  );
}
