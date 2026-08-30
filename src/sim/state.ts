import type { City, SimulationState } from './types';
import { CURRENT_SIDE_IDS, requireSide, type SideFieldMap } from './sides';

export function cloneCities(cities: readonly City[]): City[] {
  return cities.map((city) => ({ ...city }));
}

export function assertStateDimensions(state: SimulationState, width: number, height: number): void {
  if (state.width !== width || state.height !== height) {
    throw new Error('Cannot restore simulation state with different map dimensions');
  }
}

export function restoreSimulationFields(
  state: SimulationState,
  cities: City[],
  control: Float32Array,
  sides: SideFieldMap,
): void {
  cities.splice(0, cities.length, ...cloneCities(state.cities));
  control.set(state.control);

  const blue = requireSide(sides, 'blue');
  const red = requireSide(sides, 'red');
  blue.war.set(state.warBlue);
  red.war.set(state.warRed);
  blue.committed.set(state.committedBlue);
  red.committed.set(state.committedRed);
  blue.instability.set(state.instabilityBlue);
  red.instability.set(state.instabilityRed);
  blue.potential.set(state.potentialBlue);
  red.potential.set(state.potentialRed);
  blue.collapse.set(state.collapseBlue);
  red.collapse.set(state.collapseRed);
}

export function clearDerivedFields(
  sides: SideFieldMap,
  shared: readonly Float32Array[],
): void {
  const derived = [...shared];
  for (const sideId of CURRENT_SIDE_IDS) {
    const side = requireSide(sides, sideId);
    derived.push(
      side.flow.x,
      side.flow.y,
      side.need,
      side.mass,
      side.commitmentTarget,
      side.availableMass,
      side.incoming,
      side.delta,
      side.drain,
      side.advanceDebug,
      side.stressDebug,
    );
  }
  clearArrays(derived);
}

export function clearArrays(arrays: readonly (Float32Array | Uint8Array)[]): void {
  for (const array of arrays) array.fill(0);
}
