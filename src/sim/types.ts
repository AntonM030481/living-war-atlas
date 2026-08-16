import type { Side, Speed } from './Config';

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
  mountains: Array<{ x: number; y: number; r: number }>;
  riverX: (y: number) => number;
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
}

export type WorkerInMessage =
  | { type: 'start'; seed: number }
  | { type: 'speed'; speed: Speed }
  | { type: 'reset'; seed: number }
  | { type: 'toggleCity'; cityId: string }
  | { type: 'pause'; paused: boolean };

export type WorkerOutMessage =
  | { type: 'ready'; seed: number }
  | { type: 'snapshot'; snapshot: SimulationSnapshot }
  | { type: 'stats'; fps: number };
