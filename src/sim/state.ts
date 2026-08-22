import type { City, SimulationState } from './types';

export function cloneCities(cities: readonly City[]): City[] {
  return cities.map((city) => ({ ...city }));
}

export function assertStateDimensions(state: SimulationState, width: number, height: number): void {
  if (state.width !== width || state.height !== height) {
    throw new Error('Cannot restore simulation state with different map dimensions');
  }
}

export function restoreArray(target: Float32Array, source: Float32Array): void {
  target.set(source);
}

export function clearArrays(arrays: readonly (Float32Array | Uint8Array)[]): void {
  for (const array of arrays) array.fill(0);
}
