import type { Simulation } from '../../sim/Simulation';

export type OpponentStrategyId = 'greedy';

export interface GameOpponent {
  readonly id: OpponentStrategyId;
  act(simulation: Simulation): void;
}
