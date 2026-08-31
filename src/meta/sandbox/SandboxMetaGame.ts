import { forceCityEnclave } from '../../sim/DebugActions';
import type { Simulation } from '../../sim/Simulation';
import type { MetaGame } from '../MetaGame';

export type SandboxAction =
  | { type: 'toggleCity'; cityId: string }
  | { type: 'flipCity'; cityId: string };

export interface SandboxMetaState {}

export class SandboxMetaGame implements MetaGame<SandboxAction, SandboxMetaState> {
  readonly id = 'sandbox';

  availableActions(simulation: Simulation): readonly SandboxAction[] {
    return simulation.cities.flatMap((city) => [
      { type: 'toggleCity' as const, cityId: city.id },
      { type: 'flipCity' as const, cityId: city.id },
    ]);
  }

  apply(action: SandboxAction, simulation: Simulation): void {
    if (action.type === 'toggleCity') {
      simulation.toggleCityEnabled(action.cityId);
      return;
    }
    forceCityEnclave(simulation, action.cityId);
  }

  saveState(): SandboxMetaState {
    return {};
  }

  restoreState(_state: SandboxMetaState): void {}
}
