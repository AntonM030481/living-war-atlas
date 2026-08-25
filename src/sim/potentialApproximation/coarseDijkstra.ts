import type { PotentialApproximationStrategy } from './types';
import { solveMultiSourceDijkstra } from './shortestPath';
import {
  buildCoarseGrid,
  coarseEdgeTransmission,
  DEFAULT_COARSE_RELAXATION_PASSES,
  DEFAULT_COARSE_SCALE,
  projectCoarsePotential,
  solveCoarsePotential,
} from './coarse';
import { TRANSPORT_EPS as EPS } from '../transportGrid';

function edgeDistance(transmission: number, scale: number): number {
  return scale / Math.sqrt(Math.max(transmission, EPS));
}

/**
 * Uses local front potential as Dijkstra source amplitude on the coarse grid,
 * then lets coarse relaxation smooth the source/Voronoi boundaries before the
 * result is projected to the fine grid.
 */
export const buildCoarseDijkstraApproximation: PotentialApproximationStrategy = (
  potential,
  grid,
  config,
  context,
) => {
  const scale = Math.max(2, Math.round(config.potentialCoarseScale ?? DEFAULT_COARSE_SCALE));
  const passes = Math.max(1, Math.round(
    config.potentialCoarsePasses ?? DEFAULT_COARSE_RELAXATION_PASSES,
  ));
  const coarse = buildCoarseGrid(grid, context, scale);
  const safeDecay = Math.max(EPS, Math.min(0.999999, config.potentialDecay));
  const logDecay = Math.log(safeDecay);

  const { distances, sources } = solveMultiSourceDijkstra({
    width: coarse.width,
    height: coarse.height,
    status: coarse.status,
    edgeCost: (x, y, dx, dy) => {
      const transmission = coarseEdgeTransmission(x, y, dx, dy, coarse);
      return transmission > EPS
        ? edgeDistance(transmission, coarse.scale)
        : Number.POSITIVE_INFINITY;
    },
  });

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

  const coarsePotential = solveCoarsePotential(
    coarse,
    config.potentialDecay,
    passes,
    seed,
  );
  projectCoarsePotential(potential, coarsePotential, coarse, grid, context);
};
