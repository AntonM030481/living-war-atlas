import type {
  PotentialApproximation,
  TransportConfig,
  TransportGrid,
} from '../transportGrid';

export interface ApproximatePotentialResult {
  smoothedNeed: Float32Array;
  currentStatus: Uint8Array;
  reaction: number;
  maxFrontPotential: number;
}

export interface FinePotentialContext extends ApproximatePotentialResult {
  previousStatus?: Uint8Array;
}

export type PotentialApproximationStrategy = (
  potential: Float32Array,
  grid: TransportGrid,
  config: TransportConfig,
  context: FinePotentialContext,
) => void;

export type PotentialApproximationRegistry = Record<
  PotentialApproximation,
  PotentialApproximationStrategy
>;
