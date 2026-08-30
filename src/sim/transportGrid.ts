const EPS = 1e-6;

export type PotentialApproximation = 'previous' | 'coarse' | 'dijkstra' | 'coarse-dijkstra';

export interface TransportConfig {
  dt: number;
  potentialDecay: number;
  potentialApproximation?: PotentialApproximation;
  potentialRepairEnabled?: boolean;
  potentialCoarseScale?: number;
  potentialCoarsePasses?: number;
  potentialFinePasses?: number;
  baseEdgeCapacityPerSecond: number;
  resourceCellCapacity: number;
  resourceCongestionStrength: number;
  resourceFlowResponseSeconds: number;
}

export interface TransportGrid {
  width: number;
  height: number;
  terrainMobility: Float32Array;
  terrainCapacity: Float32Array;
  isFront: (index: number) => boolean;
  potentialDemand?: (index: number) => number;
  access: (index: number) => number;
  edgeFactor: (x: number, y: number, dx: number, dy: number) => number;
}

export function edgeTransmission(
  index: number,
  neighbor: number,
  x: number,
  y: number,
  dx: number,
  dy: number,
  grid: TransportGrid,
): number {
  const access = Math.min(grid.access(index), grid.access(neighbor));
  if (access <= 0.01) return 0;

  const terrainCapacity = Math.min(
    grid.terrainCapacity[index],
    grid.terrainCapacity[neighbor],
  );
  if (terrainCapacity <= 0) return 0;

  const crossing = grid.edgeFactor(x, y, dx, dy);
  if (crossing <= 0) return 0;

  const mobility = 0.72 + 0.28 * Math.min(
    grid.terrainMobility[index],
    grid.terrainMobility[neighbor],
  );
  return access * terrainCapacity * crossing * mobility;
}

export { EPS as TRANSPORT_EPS };
