import { setImmediate } from 'node:timers/promises';
import { createGameModeRuntime, createSimulationForMode, type GameAction } from '../../src/game/GameMode';
import { GameSession } from '../../src/game/GameSession';
import { getMapDefinition } from '../../src/map/maps';
import { CFG, type Side } from '../../src/sim/Config';
import type { Simulation } from '../../src/sim/Simulation';
import type { TransportGrid } from '../../src/sim/transportGrid';

export const SCENARIOS = ['preparation', 'first-invasion', 'multiple-fronts'] as const;
export type Scenario = typeof SCENARIOS[number];
export const MAP_ID = 'theatre';
export const SEED = 1;
export const PREPARATION_TICKS = 100;
export const BETWEEN_INVASIONS_TICKS = 50;
export const AFTER_SECOND_INVASION_TICKS = 50;

// Benchmark-only adapter: no instrumentation in the production tick.
export function internals(simulation: Simulation) {
  return simulation as unknown as {
    computeFrontMassAndNeed(): void;
    transportGrid(side: Side): TransportGrid;
  };
}

async function advance(session: GameSession, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    session.tick();
    // Fixture construction is untimed. Let the test runner service its RPCs
    // during long scenario preparation on slower machines.
    if ((i + 1) % CFG.potentialEverySteps === 0) await setImmediate();
  }
}

export async function createConquestFixture(scenario: Scenario) {
  const map = getMapDefinition(MAP_ID);
  const session = new GameSession(
    createSimulationForMode('conquest', map, SEED),
    createGameModeRuntime('conquest', map, 'blue', SEED, null),
  );
  const actions: GameAction[] = [];
  function apply(action: GameAction): void {
    if (!session.availableActions().some((candidate) => JSON.stringify(candidate) === JSON.stringify(action))) {
      throw new Error(`Unavailable fixture action: ${JSON.stringify(action)}`);
    }
    session.apply(action);
    actions.push(action);
  }
  for (const action of session.availableActions()
    .filter((action) => action.type === 'conquestActivate')
    .sort((a, b) => ('regionId' in a ? a.regionId : '').localeCompare('regionId' in b ? b.regionId : ''))) {
    apply(action);
  }
  await advance(session, PREPARATION_TICKS);

  function invade(): void {
    const action = session.availableActions()
      .filter((candidate) => candidate.type === 'conquestInvade')
      .sort((a, b) => a.regionId.localeCompare(b.regionId))[0];
    if (!action) throw new Error('Conquest fixture has no available invasion');
    apply(action);
  }
  if (scenario !== 'preparation') invade();
  if (scenario === 'multiple-fronts') {
    await advance(session, BETWEEN_INVASIONS_TICKS);
    invade();
    await advance(session, AFTER_SECOND_INVASION_TICKS);
  }

  // restoreState clears potentialDirty. Cadence-aligned checkpoints ensure that
  // the first measured tick still rebuilds potential, including after invasion.
  if (session.simulation.step % CFG.potentialEverySteps !== 0) {
    throw new Error('Conquest checkpoint must be on a potential rebuild boundary');
  }
  const state = session.saveState();
  return { session, state, actions, reset: () => session.restoreState(state) };
}
