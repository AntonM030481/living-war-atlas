import type { Side } from '../../sim/Config';
import { forceCityEnclave } from '../../sim/DebugActions';
import type { Simulation } from '../../sim/Simulation';
import type { MetaGame, MetaGameStatus } from '../MetaGame';

export interface PartisanAction {
  type: 'captureSource';
  cityId: string;
}

export interface PartisanMetaState {
  nextActionTime: number;
}

export class PartisanMetaGame implements MetaGame<PartisanAction, PartisanMetaState> {
  readonly id = 'partisan';
  private nextActionTime = 0;

  constructor(
    private readonly playerSide: Side,
    private readonly actionIntervalSeconds = 10,
  ) {}

  availableActions(simulation: Simulation): readonly PartisanAction[] {
    if (simulation.gameTime + 1e-6 < this.nextActionTime) return [];
    return simulation.cities
      .filter((city) => city.owner !== this.playerSide)
      .map((city) => ({ type: 'captureSource' as const, cityId: city.id }));
  }

  apply(action: PartisanAction, simulation: Simulation): void {
    if (simulation.gameTime + 1e-6 < this.nextActionTime) {
      throw new Error('Partisan action is not ready yet');
    }
    const city = simulation.cities.find((candidate) => candidate.id === action.cityId);
    if (!city) throw new Error(`Unknown city: ${action.cityId}`);
    if (city.owner === this.playerSide) throw new Error(`City ${action.cityId} is already owned by ${this.playerSide}`);

    if (!forceCityEnclave(simulation, action.cityId)) {
      throw new Error(`Could not capture city ${action.cityId}`);
    }
    this.nextActionTime = simulation.gameTime + this.actionIntervalSeconds;
  }

  status(simulation: Simulation): MetaGameStatus {
    const hasEnemySource = simulation.cities.some((city) => city.owner !== this.playerSide);
    return { winner: hasEnemySource ? null : this.playerSide };
  }

  saveState(): PartisanMetaState {
    return { nextActionTime: this.nextActionTime };
  }

  restoreState(state: PartisanMetaState): void {
    if (!Number.isFinite(state.nextActionTime) || state.nextActionTime < 0) {
      throw new Error('Invalid partisan meta-game state');
    }
    this.nextActionTime = state.nextActionTime;
  }
}
