import type { PotentialApproximationStrategy } from './types';
import { solveMultiSourceDijkstra } from './shortestPath';
import {
  edgeTransmission,
  TRANSPORT_EPS as EPS,
} from '../transportGrid';

/**
 * Converts edge transmission to an effective path length. For screened
 * diffusion, attenuation grows approximately with the square root of resistance,
 * so 1/sqrt(transmission) is a useful cheap distance proxy without making low-
 * capacity terrain dominate as aggressively as 1/transmission.
 */
function edgeDistance(transmission: number): number {
  return 1 / Math.sqrt(Math.max(transmission, EPS));
}

/**
 * Builds only the global geometric shape of the field. All front cells are
 * equal-distance sources; their individual need values remain boundary
 * conditions for fine relaxation instead of being propagated through Voronoi
 * regions by Dijkstra.
 */
export const buildDijkstraApproximation: PotentialApproximationStrategy = (
  potential,
  grid,
  config,
  context,
) => {
  const safeDecay = Math.max(EPS, Math.min(0.999999, config.potentialDecay));
  const logDecay = Math.log(safeDecay);
  const { distances } = solveMultiSourceDijkstra({
    width: grid.width,
    height: grid.height,
    status: context.currentStatus,
    edgeCost: (x, y, dx, dy) => {
      const i = y * grid.width + x;
      const neighbor = (y + dy) * grid.width + (x + dx);
      const transmission = edgeTransmission(i, neighbor, x, y, dx, dy, grid);
      return transmission > EPS ? edgeDistance(transmission) : Number.POSITIVE_INFINITY;
    },
  });

  for (let i = 0; i < potential.length; i++) {
    if (context.currentStatus[i] === 0 || !Number.isFinite(distances[i])) {
      potential[i] = 0;
    } else if (context.currentStatus[i] === 2) {
      potential[i] = 1 + context.smoothedNeed[i];
    } else {
      potential[i] = Math.max(
        0,
        Math.min(
          context.maxFrontPotential,
          context.maxFrontPotential * Math.exp(logDecay * distances[i]),
        ),
      );
    }
  }
};
