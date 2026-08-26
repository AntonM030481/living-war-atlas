import type { Side, Speed } from './Config';

export type MapId = 'theatre' | 'island' | 'linear';
export type TerrainType = 'open' | 'blocked' | 'sea' | 'mountain';

export interface City {
  id: string;
  name: string;
  x: number;
  y: number;
  baseProduction: number;
  owner: Side;
  integration: number;
  enabled?: boolean;
}

export interface MapDefinition {
  width: number;
  height: number;
  initialFrontX: (y: number) => number;
  cities: City[];
  forests: Array<{ x: number; y: number; r: number }>;
  riverX: (y: number) => number;
  terrainAt?: (x: number, y: number) => TerrainType;
  seedInitialResource?: boolean;
}

export interface SimulationSnapshot {
  width: number;
  height: number;
  step: number;
  gameTime: number;
  stats: SimulationStats;
  control: Float32Array;
  warBlue: Float32Array;
  warRed: Float32Array;
  committedBlue: Float32Array;
  committedRed: Float32Array;
  instabilityBlue: Float32Array;
  instabilityRed: Float32Array;
  potentialBlue: Float32Array;
  potentialRed: Float32Array;
  frontMassBlue: Float32Array;
  frontMassRed: Float32Array;
  incomingBlue: Float32Array;
  incomingRed: Float32Array;
  drainBlue: Float32Array;
  drainRed: Float32Array;
  advanceBlue: Float32Array;
  advanceRed: Float32Array;
  stressBlue: Float32Array;
  stressRed: Float32Array;
  rawForcing: Float32Array;
  forcing: Float32Array;
  pressure: Float32Array;
  flowBlueX: Float32Array;
  flowBlueY: Float32Array;
  flowRedX: Float32Array;
  flowRedY: Float32Array;
  terrainDefense: Float32Array;
  terrainMobility: Float32Array;
  terrainBlocked?: Uint8Array;
  cities: City[];
}

export interface SimulationState {
  width: number;
  height: number;
  step: number;
  gameTime: number;
  control: Float32Array;
  warBlue: Float32Array;
  warRed: Float32Array;
  committedBlue: Float32Array;
  committedRed: Float32Array;
  instabilityBlue: Float32Array;
  instabilityRed: Float32Array;
  potentialBlue: Float32Array;
  potentialRed: Float32Array;
  collapseBlue: Uint8Array;
  collapseRed: Uint8Array;
  cities: City[];
}

export interface SimulationStats {
  frontCells: number;
  maxInstabilityBlue: number;
  maxInstabilityRed: number;
  collapseBlueCells: number;
  collapseRedCells: number;
  totalWarBlue: number;
  totalWarRed: number;
  activeFlowBlue: number;
  activeFlowRed: number;
  blueCities: number;
  redCities: number;
  activeCityPointsBlue: number;
  activeCityPointsRed: number;
  controlledCityPointsBlue: number;
  controlledCityPointsRed: number;
}

export interface SimulationCompletion {
  winner: Side;
  loser: Side;
}

export interface DebugCellPatch {
  x: number;
  y: number;
  control?: number;
  warBlue?: number;
  warRed?: number;
  committedBlue?: number;
  committedRed?: number;
  instabilityBlue?: number;
  instabilityRed?: number;
  potentialBlue?: number;
  potentialRed?: number;
}

export type WorkerCommand =
  | { type: 'init'; mapId?: MapId }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'setSpeed'; speed: Speed }
  | { type: 'newGame'; mapId?: MapId }
  | { type: 'toggleCity'; cityId: string }
  | { type: 'flipCityOwner'; cityId: string }
  | { type: 'debugPatch'; patches: DebugCellPatch[] }
  | { type: 'historyBack' }
  | { type: 'historyForward' }
  | { type: 'historyLive' };

export type WorkerEvent =
  | { type: 'snapshot'; snapshot: SimulationSnapshot; historyOffset: number; historyLength: number; live: boolean; completion?: SimulationCompletion }
  | { type: 'historyStatus'; offset: number; length: number; live: boolean };
