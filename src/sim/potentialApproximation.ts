import { buildCoarseApproximation } from './potentialApproximation/coarse';
import { buildDijkstraApproximation } from './potentialApproximation/dijkstra';
import { buildPreviousApproximation } from './potentialApproximation/previous';
import type {
  FinePotentialContext,
  PotentialApproximationRegistry,
} from './potentialApproximation/types';
import type { TransportConfig, TransportGrid } from './transportGrid';

const STRATEGIES: PotentialApproximationRegistry = {
  previous: buildPreviousApproximation,
  coarse: buildCoarseApproximation,
  dijkstra: buildDijkstraApproximation,
};

export function applyApproximatePotential(
  potential: Float32Array,
  grid: TransportGrid,
  config: TransportConfig,
  context: FinePotentialContext,
): void {
  const strategy = STRATEGIES[config.potentialApproximation ?? 'dijkstra'];
  strategy(potential, grid, config, context);
}
