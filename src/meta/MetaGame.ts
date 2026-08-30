import type { Simulation } from '../sim/Simulation';
import type { Side } from '../sim/Config';

export interface MetaGameStatus {
  winner: Side | null;
}

export interface MetaGame<Action, State> {
  readonly id: string;
  initialize?(simulation: Simulation): void;
  beforeTick?(simulation: Simulation): void;
  afterTick?(simulation: Simulation): void;
  availableActions(simulation: Simulation): readonly Action[];
  apply(action: Action, simulation: Simulation): void;
  completionStatus?(simulation: Simulation): MetaGameStatus;
  saveState(): State;
  restoreState(state: State): void;
}
