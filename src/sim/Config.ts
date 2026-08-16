export const CFG = {
  width: 128,
  height: 80,
  dt: 0.1,
  snapshotEverySteps: 2,
  potentialEverySteps: 10,
  potentialIterations: 96,
  potentialDecay: 0.965,
  resourceMoveFraction: 0.58,
  baseEdgeCapacityPerSecond: 7.0,
  frontBand: 0.34,
  massRadius: 2,
  defenceAdvantage: 1.36,
  baseProbe: 0.76,
  maintenanceRate: 0.004,
  combatConsumptionRate: 0.010,
  instabilityGrow: 0.48,
  instabilityRecover: 0.16,
  collapseEnter: 1.0,
  collapseExit: 0.48,
  collapseAdvanceMultiplier: 3.0,
  controlSmooth: 0.17,
  controlRestore: 0.11,
  controlForce: 0.10,
  controlClamp: 0.999,
  cityIntegrationPerSecond: 1 / 70,
  cityCaptureThreshold: 0.42,
  noiseAmplitude: 0.02,
  initialCityResourceSeconds: 12,
  initialFrontResource: 5.5,
  warmupSeconds: 75,
} as const;

export const SPEEDS = [1, 2, 4] as const;

export type Side = 'blue' | 'red';
export type Speed = typeof SPEEDS[number];
