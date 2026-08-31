import { CFG, type Side } from '../../sim/Config';
import { forceCityEnclave } from '../../sim/DebugActions';
import type { Simulation } from '../../sim/Simulation';
import type { MetaGame } from '../MetaGame';

export const GUERRILLA_POINTS_PER_PRODUCTION = 100;
export const GUERRILLA_MAX_POINTS = 3 * GUERRILLA_POINTS_PER_PRODUCTION;
export const GUERRILLA_POINTS_PER_SECOND = 10;
export const GUERRILLA_THRESHOLDS = [100, 200, 300] as const;

export interface PartisanAction {
  type: 'captureSource';
  cityId: string;
}

export interface PartisanMetaState {
  points: Record<Side, number>;
}

export class PartisanMetaGame implements MetaGame<PartisanAction, PartisanMetaState> {
  readonly id = 'partisan';
  private readonly points: Record<Side, number> = { blue: 0, red: 0 };

  constructor(private readonly playerSide: Side) {}

  beforeTick(): void {
    for (const side of ['blue', 'red'] as const) {
      this.points[side] = Math.min(
        GUERRILLA_MAX_POINTS,
        this.points[side] + GUERRILLA_POINTS_PER_SECOND * CFG.dt,
      );
    }
  }

  availableActions(simulation: Simulation): readonly PartisanAction[] {
    return simulation.cities
      .filter((city) => city.owner !== this.playerSide)
      .filter((city) => this.points[this.playerSide] + 1e-6 >= this.captureCost(city.baseProduction))
      .map((city) => ({ type: 'captureSource' as const, cityId: city.id }));
  }

  apply(action: PartisanAction, simulation: Simulation): void {
    const city = simulation.cities.find((candidate) => candidate.id === action.cityId);
    if (!city) throw new Error(`Unknown city: ${action.cityId}`);
    if (city.owner === this.playerSide) throw new Error(`City ${action.cityId} is already owned by ${this.playerSide}`);

    const cost = this.captureCost(city.baseProduction);
    if (this.points[this.playerSide] + 1e-6 < cost) {
      throw new Error(`Not enough guerrilla points to capture city ${action.cityId}`);
    }

    if (!forceCityEnclave(simulation, action.cityId)) {
      throw new Error(`Could not capture city ${action.cityId}`);
    }
    this.points[this.playerSide] = Math.max(0, this.points[this.playerSide] - cost);
  }

  saveState(): PartisanMetaState {
    return { points: { ...this.points } };
  }

  restoreState(state: PartisanMetaState): void {
    for (const side of ['blue', 'red'] as const) {
      const value = state.points?.[side];
      if (!Number.isFinite(value) || value < 0 || value > GUERRILLA_MAX_POINTS + 1e-6) {
        throw new Error('Invalid partisan meta-game state');
      }
      this.points[side] = Math.min(GUERRILLA_MAX_POINTS, value);
    }
  }

  private captureCost(baseProduction: number): number {
    return baseProduction * GUERRILLA_POINTS_PER_PRODUCTION;
  }
}
