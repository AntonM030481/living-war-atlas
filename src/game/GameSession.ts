import type { Simulation } from '../sim/Simulation';
import type { SimulationState } from '../sim/types';
import type { MetaGame, MetaGameStatus } from '../meta/MetaGame';

export interface GameSessionState<MetaState> {
  simulation: SimulationState;
  meta: {
    id: string;
    state: MetaState;
  };
}

export class GameSession<Action, MetaState> {
  constructor(
    readonly simulation: Simulation,
    readonly metaGame: MetaGame<Action, MetaState>,
  ) {
    this.metaGame.initialize?.(this.simulation);
  }

  tick(): void {
    this.metaGame.beforeTick?.(this.simulation);
    this.simulation.tick();
    this.metaGame.afterTick?.(this.simulation);
  }

  availableActions(): readonly Action[] {
    return this.metaGame.availableActions(this.simulation);
  }

  apply(action: Action): void {
    this.metaGame.apply(action, this.simulation);
  }

  status(): MetaGameStatus {
    return this.metaGame.status(this.simulation);
  }

  saveState(): GameSessionState<MetaState> {
    return {
      simulation: this.simulation.saveState(),
      meta: {
        id: this.metaGame.id,
        state: this.metaGame.saveState(),
      },
    };
  }

  restoreState(state: GameSessionState<MetaState>): void {
    if (state.meta.id !== this.metaGame.id) {
      throw new Error(`Cannot restore ${state.meta.id} state into ${this.metaGame.id}`);
    }
    this.simulation.restoreState(state.simulation);
    this.metaGame.restoreState(state.meta.state);
  }
}
