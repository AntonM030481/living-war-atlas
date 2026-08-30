import type { Side } from '../sim/Config';
import type { MapDefinition } from '../sim/types';
import { ConquestMetaGame, type ConquestMetaState } from '../meta/conquest/ConquestMetaGame';
import { PartisanMetaGame, type PartisanMetaState } from '../meta/partisan/PartisanMetaGame';
import { SandboxMetaGame, type SandboxMetaState } from '../meta/sandbox/SandboxMetaGame';
import type { MetaGameStatus } from '../meta/MetaGame';
import type { Simulation } from '../sim/Simulation';

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
}

export const GAME_MODE_OPTIONS: readonly GameModeOption[] = [
  {
    id: 'sandbox',
    name: 'Sandbox',
    description: 'Directly toggle production and switch city ownership while the autonomous front keeps running.',
    interactionNote: 'City click: production on/off · secondary click / long press: switch side',
    requiresRegions: false,
  },
  {
    id: 'partisan',
    name: 'Partisans',
    description: 'Periodically create a friendly enclave around one enemy production source and let the front react on its own.',
    interactionNote: 'When the partisan action is ready, primary or secondary click / long press an enemy city.',
    requiresRegions: false,
  },
  {
    id: 'conquest',
    name: 'Conquest',
    description: 'Activate your countries and choose which neighboring country to invade; the war itself stays autonomous.',
    interactionNote: 'Click your inactive region to activate it · click an available enemy region to invade.',
    requiresRegions: true,
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
      status: (simulation) => meta.status(simulation),
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
      status: (simulation) => meta.status(simulation),
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
    status: (simulation) => meta.status(simulation),
    view: () => ({ mode: 'conquest', countries: meta.saveState().countries }),
    saveState: () => ({ id: modeId, state: meta.saveState() }),
    restoreState: (state) => {
      if (state.id !== modeId) throw new Error(`Cannot restore ${state.id} into ${modeId}`);
      meta.restoreState(state.state as ConquestMetaState);
    },
  };
}
