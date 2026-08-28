export const RESOURCE_EPS = 1e-4;

export const CFG = {
  spatialScale: 2, // Map/render scale multiplier used when constructing canonical maps.
  width: 256, // Default simulation grid width used by map definitions.
  height: 160, // Default simulation grid height used by map definitions.
  dt: 0.1, // Simulated seconds per tick; scales all per-second rates.
  snapshotEverySteps: 2, // UI/diagnostics snapshot cadence in simulation steps.

  potentialEverySteps: 10, // Rebuild transport potential every N simulation ticks.
  potentialDecay: 0.988, // Attenuates propagated potential with distance during relaxation.
  potentialApproximation: 'coarse-dijkstra', // Global approximation used to seed the potential field.
  potentialCoarseScale: 2, // Downsampling factor for the coarse potential grid.
  potentialCoarsePasses: 24, // Relaxation passes used by coarse approximation modes that iterate.
  potentialFinePasses: 6, // Full-resolution local relaxation passes after coarse initialization.
  potentialRepairEnabled: true, // Enables local repair of stale potential near changed/front regions.

  baseEdgeCapacityPerSecond: 7.0, // Base resource throughput across one grid edge per second.
  resourceCellCapacity: 1, // Nominal resource amount a cell can hold before congestion matters.
  resourceCongestionStrength: 0.30, // How strongly crowded cells reduce incoming transport flow.
  resourceFlowResponseSeconds: 3.0, // Time constant that smooths transport flow toward its target.

  riverDefenseBonus: 0.20, // Added defense per unit river strength: defense *= 1 + bonus * strength.
  riverMobilityPenalty: 0.42, // Mobility reduction per unit river strength: mobility *= 1 - penalty * strength.
  riverCapacityPenalty: 0.40, // Transport-capacity reduction per unit river strength: capacity *= 1 - penalty * strength.
  forestDefenseMultiplier: 1.55, // Multiplies defensive effectiveness inside forest cells.
  forestMobilityMultiplier: 0.30, // Multiplies movement/transport mobility inside forest cells.
  forestCapacityMultiplier: 0.42, // Multiplies transport capacity inside forest cells.

  frontCommitmentMax: 1.0, // Fraction of local force committed where opposing force is present.
  frontUnopposedCommitment: 0.82, // Commitment fraction used where a front has no opposing mass.
  collapseCommitmentFactor: 0.28, // Multiplier applied to commitment target while that side is collapsed.
  commitmentEngagePerSecond: 0.85, // Rate at which committed force rises toward its target.
  commitmentReleasePerSecond: 0.22, // Rate at which committed force is released when the target falls.
  collapseReleaseMultiplier: 3.0, // Extra release-rate multiplier while a cell is collapsed.

  frontBand: 0.34, // |control| threshold that classifies cells as part of the front band.
  massRadius: 4, // Radius over which nearby force is aggregated for front mass/commitment.
  defenceAdvantage: 1.36, // Baseline defensive combat multiplier; terrain defense multiplies it further.
  baseProbe: 0.76, // Baseline attacking pressure used when resolving combat stress.
  emptyFrontMass: 0.08, // Small effective mass used to keep combat/front logic active at nearly empty fronts.
  unopposedTinyMass: 0.025, // Opposing-mass cutoff below which a front is treated as effectively unopposed.
  unopposedUsefulMass: 0.35, // Own mass at which unopposed advance reaches its useful/full regime.
  unopposedAdvance: 2.5, // Base advance forcing when moving into essentially undefended territory.

  maintenanceRate: 0.004, // Continuous resource consumption by fielded force even outside active combat.
  combatConsumptionRate: 0.045, // Additional resource consumption caused by active front combat.

  instabilityGrow: 0.48, // Rate at which combat stress increases local front instability.
  instabilityRecover: 0.16, // Rate at which instability decays when pressure is relieved.
  collapseEnter: 1.0, // Instability threshold for entering collapse.
  collapseExit: 0.48, // Lower instability threshold for leaving collapse (hysteresis).
  collapseAdvanceMultiplier: 3.0, // Multiplies enemy advance through a collapsed section of front.

  controlSmooth: 0.17, // Spatial smoothing strength applied when evolving the control field.
  controlRestore: 0.11, // Tendency of control to restore/retain an established local ownership state.
  controlForce: 0.45, // Converts combat forcing/pressure into movement of the control field.
  controlClamp: 0.999, // Absolute clamp for control values, keeping them just inside [-1, +1].
  recentCaptureFadeSeconds: 30, // How long recently captured territory remains hatched on the map.

  cityIntegrationPerSecond: 1 / 70, // Rate at which a captured city's production integrates toward its new owner.
  cityCaptureThreshold: 0.42, // Local control magnitude required for city ownership/capture progression.
  noiseAmplitude: 0.02, // Deterministic local perturbation added to front forcing to create small-scale turbulence.

  initialCityResourceSeconds: 12, // Initial city stockpile expressed as this many seconds of base production.
  initialFrontResource: 1, // Initial resource seeded near the starting front, scaled by front proximity.
} as const;

export function ticks(seconds: number): number {
  return Math.round(seconds / CFG.dt);
}

export const SPEEDS = [1, 2, 3, 4] as const;

export type Side = 'blue' | 'red';
export type Speed = typeof SPEEDS[number];
