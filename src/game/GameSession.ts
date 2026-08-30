import type { Simulation } from '../sim/Simulation';
import type { SimulationState } from '../sim/types';
import type { GameAction, GameModeRuntime, GameModeState, GameModeView } from './GameMode';
import type { MetaGameStatus } from '../meta/MetaGame';

export interface GameSessionState {
  simulation: SimulationState;
  mode: GameModeState;
}

export class GameSession {
  constructor(
    readonly simulation: Simulation,
    readonly mode: GameModeRuntime,
  ) {
    this.mode.initialize(this.simulation);
  }

  tick(): void {
    this.mode.beforeTick(this.simulation);
    this.simulation.tick();
    this.mode.afterTick(this.simulation);
  }

  availableActions(): readonly GameAction[] {
    return this.mode.availableActions(this.simulation);
  }

  apply(action: GameAction): void {
    this.mode.apply(action, this.simulation);
  }

  status(): MetaGameStatus {
    return this.mode.status(this.simulation);
  }

  view(): GameModeView {
    return this.mode.view(this.simulation);
  }

  saveState(): GameSessionState {
    return {
      simulation: this.simulation.saveState(),
      mode: this.mode.saveState(),
    };
  }

  restoreState(state: GameSessionState): void {
    if (state.mode.id !== this.mode.id) {
      throw new Error(`Cannot restore ${state.mode.id} state into ${this.mode.id}`);
    }
    this.simulation.restoreState(state.simulation);
    this.mode.restoreState(state.mode);
  }
}
