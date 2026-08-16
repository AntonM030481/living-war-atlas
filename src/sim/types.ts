import type { Side } from './Config';

export interface City {
  id: string;
  name: string;
  x: number;
  y: number;
  baseProduction: number;
  owner: Side;
  integration: number;
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
  instabilityBlue: Float32Array;
  instabilityRed: Float32Array;
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
  | { type: 'speed'; speed: 1 | 2 | 4 }
  | { type: 'reset'; seed: number }
  | { type: 'pause'; paused: boolean };

export type WorkerOutMessage =
  | { type: 'ready'; seed: number }
  | { type: 'snapshot'; snapshot: SimulationSnapshot }
  | { type: 'stats'; fps: number };
