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

export interface MapPoint {
  x: number;
  y: number;
}

export interface TerrainRegion {
  x: number;
  y: number;
  r: number;
}

export interface MapDefinition {
  width: number;
  height: number;
  initialFrontX?: (y: number) => number;
  initialControl?: 'city-distance';
  cities: City[];
  forests: TerrainRegion[];
  mountains?: TerrainRegion[];
  rivers: MapPoint[][];
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

export interface HistoryInfo {
  currentIndex: number;
  length: number;
  intervalSeconds: number;
  canRewind: boolean;
  canForward: boolean;
  currentTime: number;
}

export type WorkerInMessage =
  | { type: 'start'; seed: number; mapId: MapId; loadSavedState: boolean }
  | { type: 'speed'; speed: Speed }
  | { type: 'reset'; seed: number; mapId: MapId }
  | { type: 'toggleCity'; cityId: string }
  | { type: 'flipCityOwner'; cityId: string }
  | { type: 'pause'; paused: boolean }
  | { type: 'historyStep'; delta: -1 | 1 };

export type WorkerOutMessage =
  | { type: 'ready'; seed: number; mapId: MapId }
  | { type: 'snapshot'; snapshot: SimulationSnapshot; history: HistoryInfo; winner: Side | null }
  | { type: 'stats'; fps: number };
