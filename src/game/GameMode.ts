import type { Side } from '../sim/Config';
import type { MapDefinition } from '../sim/types';
import { winnerFromState } from '../sim/completion';
import { ConquestMetaGame, type ConquestMetaState } from '../meta/conquest/ConquestMetaGame';
import { PartisanMetaGame, type PartisanMetaState } from '../meta/partisan/PartisanMetaGame';
import { SandboxMetaGame, type SandboxMetaState } from '../meta/sandbox/SandboxMetaGame';
import type { MetaGame, MetaGameStatus } from '../meta/MetaGame';
import { applyInitialOwnership, type InitialOwnershipPolicy } from '../sim/initialOwnership';
import { Simulation } from '../sim/Simulation';

export type GameModeId = 'sandbox' | 'partisan' | 'conquest';

export type GameAction =
  | { type: 'sandboxToggleCity'; cityId: string }
  | { type: 'sandboxFlipCity'; cityId: string }
  | { type: 'partisanCaptureSource'; cityId: string }
  | { type: 'conquestActivate'; regionId: string }
  | { type: 'conquestInvade'; regionId: string };

export type GameModeView =
  | { mode: 'sandbox' }
  | { mode: 'partisan'; nextActionTime: number }
  | { mode: 'conquest'; countries: ConquestMetaState['countries'] };

export interface GameModeState {
  id: GameModeId;
  state: SandboxMetaState | PartisanMetaState | ConquestMetaState;
}

export interface GameModeOption {
  id: GameModeId;
  name: string;
  description: string;
  interactionNote: string;
  requiresRegions: boolean;
  initialOwnership: InitialOwnershipPolicy;
}

export const GAME_MODE_OPTIONS: readonly GameModeOption[] = [
  {
    id: 'sandbox',
    name: 'Sandbox',
    description: 'Directly toggle production or switch ownership of any city.',
    interactionNote: 'City click: production on/off · secondary click / long press: switch side',
    requiresRegions: false,
    initialOwnership: 'balanced-random',
  },
  {
    id: 'partisan',
    name: 'Game: Guerilla wars',
    description: 'Wait your turn to get ownership of any enemy city.',
    interactionNote: 'When the partisan action is ready, primary or secondary click / long press an enemy city.',
    requiresRegions: false,
    initialOwnership: 'balanced-random',
  },
  {
    id: 'conquest',
    name: 'Game: Conquest',
    description: 'Activate your countries and choose which neighboring country to invade;.',
    interactionNote: 'Click your inactive region to activate it · click an available enemy region to invade.',
    requiresRegions: true,
    initialOwnership: 'balanced-random',
  },
];

export function isGameModeId(value: string): value is GameModeId {
  return GAME_MODE_OPTIONS.some((option) => option.id === value);
}

export function getGameModeOption(id: GameModeId): GameModeOption {
  const option = GAME_MODE_OPTIONS.find((candidate) => candidate.id === id);
  if (!option) throw new Error(`Unknown game mode: ${id}`);
  return option;
}

export function mapSupportsMode(map: MapDefinition, modeId: GameModeId): boolean {
  return modeId !== 'conquest' || Boolean(map.regions?.length && map.regionAt);
}

export function prepareMapForMode(
  modeId: GameModeId,
  map: MapDefinition,
  seed: number,
  ownership: InitialOwnershipPolicy = getGameModeOption(modeId).initialOwnership,
): MapDefinition {
  const cities = applyInitialOwnership(map.cities, ownership, seed);
  return {
    ...map,
    cities,
    // Randomized source ownership needs a matching initial territorial field.
    // Conquest skips ordinary control initialization and replaces it with countries.
    initialControl: modeId === 'conquest' || ownership === 'authored'
      ? map.initialControl
      : 'city-distance',
  };
}

export function createSimulationForMode(
  modeId: GameModeId,
  map: MapDefinition,
  seed: number,
  ownership?: InitialOwnershipPolicy,
): Simulation {
  if (!mapSupportsMode(map, modeId)) throw new Error(`${modeId} is not supported by this map`);
  const preparedMap = prepareMapForMode(modeId, map, seed, ownership);
  return new Simulation(
    preparedMap,
    seed,
    modeId === 'conquest'
      ? { initializeControl: false, seedInitialResource: false }
      : undefined,
  );
}

export interface GameModeRuntime {
  readonly id: GameModeId;
  initialize(simulation: Simulation): void;
  beforeTick(simulation: Simulation): void;
  afterTick(simulation: Simulation): void;
  availableActions(simulation: Simulation): readonly GameAction[];
  apply(action: GameAction, simulation: Simulation): void;
  status(simulation: Simulation): MetaGameStatus;
  view(simulation: Simulation): GameModeView;
  saveState(): GameModeState;
  restoreState(state: GameModeState): void;
}

function defaultCompletionStatus(simulation: Simulation): MetaGameStatus {
  return {
    winner: winnerFromState(
      simulation.control,
      simulation.terrainBlocked,
      simulation.cities,
      simulation.sides,
    ),
  };
}

function completionStatus<Action, State>(
  meta: MetaGame<Action, State>,
  simulation: Simulation,
): MetaGameStatus {
  return meta.completionStatus?.(simulation) ?? defaultCompletionStatus(simulation);
}

export function createGameModeRuntime(
  modeId: GameModeId,
  map: MapDefinition,
  playerSide: Side = 'blue',
): GameModeRuntime {
  if (!mapSupportsMode(map, modeId)) throw new Error(`${modeId} is not supported by this map`);

  if (modeId === 'sandbox') {
    const meta = new SandboxMetaGame();
    return {
      id: modeId,
      initialize: () => {},
      beforeTick: () => {},
      afterTick: () => {},
      availableActions: (simulation) => meta.availableActions(simulation).map((action) =>
        action.type === 'toggleCity'
          ? { type: 'sandboxToggleCity' as const, cityId: action.cityId }
          : { type: 'sandboxFlipCity' as const, cityId: action.cityId }),
      apply: (action, simulation) => {
        if (action.type === 'sandboxToggleCity') meta.apply({ type: 'toggleCity', cityId: action.cityId }, simulation);
        else if (action.type === 'sandboxFlipCity') meta.apply({ type: 'flipCity', cityId: action.cityId }, simulation);
        else throw new Error(`Action ${action.type} is not valid in sandbox mode`);
      },
      status: (simulation) => completionStatus(meta, simulation),
      view: () => ({ mode: 'sandbox' }),
      saveState: () => ({ id: modeId, state: meta.saveState() }),
      restoreState: (state) => {
        if (state.id !== modeId) throw new Error(`Cannot restore ${state.id} into ${modeId}`);
        meta.restoreState(state.state as SandboxMetaState);
      },
    };
  }

  if (modeId === 'partisan') {
    const meta = new PartisanMetaGame(playerSide);
    return {
      id: modeId,
      initialize: () => {},
      beforeTick: () => {},
      afterTick: () => {},
      availableActions: (simulation) => meta.availableActions(simulation)
        .map((action) => ({ type: 'partisanCaptureSource' as const, cityId: action.cityId })),
      apply: (action, simulation) => {
        if (action.type !== 'partisanCaptureSource') throw new Error(`Action ${action.type} is not valid in partisan mode`);
        meta.apply({ type: 'captureSource', cityId: action.cityId }, simulation);
      },
      status: (simulation) => completionStatus(meta, simulation),
      view: () => ({ mode: 'partisan', nextActionTime: meta.saveState().nextActionTime }),
      saveState: () => ({ id: modeId, state: meta.saveState() }),
      restoreState: (state) => {
        if (state.id !== modeId) throw new Error(`Cannot restore ${state.id} into ${modeId}`);
        meta.restoreState(state.state as PartisanMetaState);
      },
    };
  }

  const meta = new ConquestMetaGame(map, playerSide);
  return {
    id: modeId,
    initialize: (simulation) => meta.initialize(simulation),
    beforeTick: () => {},
    afterTick: (simulation) => meta.afterTick(simulation),
    availableActions: (simulation) => meta.availableActions(simulation).map((action) =>
      action.type === 'activate'
        ? { type: 'conquestActivate' as const, regionId: action.regionId }
        : { type: 'conquestInvade' as const, regionId: action.regionId }),
    apply: (action, simulation) => {
      if (action.type === 'conquestActivate') meta.apply({ type: 'activate', regionId: action.regionId }, simulation);
      else if (action.type === 'conquestInvade') meta.apply({ type: 'invade', regionId: action.regionId }, simulation);
      else throw new Error(`Action ${action.type} is not valid in conquest mode`);
    },
    status: (simulation) => completionStatus(meta, simulation),
    view: () => ({ mode: 'conquest', countries: meta.saveState().countries }),
    saveState: () => ({ id: modeId, state: meta.saveState() }),
    restoreState: (state) => {
      if (state.id !== modeId) throw new Error(`Cannot restore ${state.id} into ${modeId}`);
      meta.restoreState(state.state as ConquestMetaState);
    },
  };
}
