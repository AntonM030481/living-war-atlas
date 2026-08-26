import type {
  PotentialApproximation,
  TransportConfig,
  TransportGrid,
} from '../transportGrid';

export interface FinePotentialStencil {
  neighborIndices: Int32Array;
  transmissions: Float64Array;
  denominators: Float64Array;
}

export interface FinePotentialContext {
  smoothedNeed: Float32Array;
  currentStatus: Uint8Array;
  reaction: number;
  maxFrontPotential: number;
  previousStatus?: Uint8Array;
}

export interface ApproximatePotentialResult extends FinePotentialContext {
  stencil: FinePotentialStencil | null;
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
