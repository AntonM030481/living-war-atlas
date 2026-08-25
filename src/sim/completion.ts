import type { Side } from './Config';
import type { SideFieldMap } from './sides';

export function winnerFromControl(control: Float32Array, terrainBlocked: Uint8Array): Side | null {
  let hasBlue = false;
  let hasRed = false;

  for (let i = 0; i < control.length; i++) {
    if (terrainBlocked[i]) continue;
    if (control[i] > 0) hasBlue = true;
    else if (control[i] < 0) hasRed = true;
    if (hasBlue && hasRed) return null;
  }

  if (hasBlue === hasRed) return null;
  return hasBlue ? 'blue' : 'red';
}

export function clearPotential(sides: SideFieldMap): void {
  for (const side of Object.values(sides)) side.potential.fill(0);
}
