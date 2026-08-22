import type { SideFields } from './sides';

const EPS = 1e-6;

export function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

export function hashNoise(index: number, bucket: number, seed: number): number {
  let x = (index * 0x9e3779b1) ^ (bucket * 0x85ebca6b) ^ seed;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return ((x >>> 0) / 0xffffffff) * 2 - 1;
}

export function superiority(ownMass: number, enemyMass: number, epsilon = EPS): number {
  return clamp((ownMass - enemyMass) / (ownMass + enemyMass + epsilon), 0, 1);
}

export function stressRatio(attack: number, defence: number, epsilon = EPS): number {
  return attack / (defence + epsilon);
}

export interface CombatConfig {
  dt: number;
  noiseAmplitude: number;
  baseProbe: number;
  defenceAdvantage: number;
  instabilityGrow: number;
  instabilityRecover: number;
  collapseEnter: number;
  collapseExit: number;
  emptyFrontMass: number;
  unopposedTinyMass: number;
  unopposedUsefulMass: number;
  unopposedAdvance: number;
  collapseAdvanceMultiplier: number;
}

export function updateInstability(
  current: number,
  stress: number,
  mass: number,
  incoming: number,
  config: CombatConfig,
): number {
  if (stress > 1) {
    current += config.instabilityGrow * Math.pow(stress - 1, 1.45) * config.dt;
  } else {
    const massFactor = clamp(mass / 18, 0.15, 1.25);
    const flowFactor = clamp(incoming / 2.2, 0, 1.2);
    const recovery = config.instabilityRecover * (0.35 + 0.45 * massFactor + 0.35 * flowFactor);
    current -= recovery * config.dt;
  }
  if (current < config.collapseExit) return Math.max(0, current);
  return clamp(current, 0, 1.8);
}

export interface PairCombatOutput {
  forcing: Float32Array;
  rawForcing: Float32Array;
  pressure: Float32Array;
}

export interface PairCombatGrid {
  width: number;
  height: number;
  terrainDefense: Float32Array;
  isFront: (index: number) => boolean;
  addConsumption: (x: number, y: number, combatIntensity: number) => void;
}

/**
 * Resolves one active front between two sides. Positive forcing means movement
 * in favour of `first`; negative forcing favours `second`. This is intentionally
 * pairwise so the resource/combat layer can be reused when territorial control
 * later supports more than two sides.
 */
export function resolvePairCombat(
  first: SideFields,
  second: SideFields,
  output: PairCombatOutput,
  grid: PairCombatGrid,
  time: number,
  seed: number,
  config: CombatConfig,
): void {
  output.forcing.fill(0);
  output.rawForcing.fill(0);
  output.pressure.fill(0);
  first.drain.fill(0);
  second.drain.fill(0);
  first.advanceDebug.fill(0);
  second.advanceDebug.fill(0);
  first.stressDebug.fill(0);
  second.stressDebug.fill(0);

  const noiseBucket = Math.floor(time / 2.5);
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const i = y * grid.width + x;
      if (!grid.isFront(i)) {
        first.instability[i] *= 0.985;
        second.instability[i] *= 0.985;
        if (first.instability[i] < config.collapseExit) first.collapse[i] = 0;
        if (second.instability[i] < config.collapseExit) second.collapse[i] = 0;
        continue;
      }

      const firstMass = first.mass[i];
      const secondMass = second.mass[i];
      const localNoise = 1 + config.noiseAmplitude * hashNoise(i, noiseBucket, seed);
      const firstAttack = firstMass * config.baseProbe * localNoise;
      const secondAttack = secondMass * config.baseProbe / localNoise;
      const firstDefence = firstMass * config.defenceAdvantage * grid.terrainDefense[i] + EPS;
      const secondDefence = secondMass * config.defenceAdvantage * grid.terrainDefense[i] + EPS;
      const firstStress = secondAttack / firstDefence;
      const secondStress = firstAttack / secondDefence;

      first.instability[i] = updateInstability(
        first.instability[i], firstStress, firstMass, first.incoming[i], config,
      );
      second.instability[i] = updateInstability(
        second.instability[i], secondStress, secondMass, second.incoming[i], config,
      );

      if (first.instability[i] >= config.collapseEnter) first.collapse[i] = 1;
      else if (first.instability[i] <= config.collapseExit) first.collapse[i] = 0;
      if (second.instability[i] >= config.collapseEnter) second.collapse[i] = 1;
      else if (second.instability[i] <= config.collapseExit) second.collapse[i] = 0;

      let firstAdvance = Math.max(0, secondStress - 1);
      let secondAdvance = Math.max(0, firstStress - 1);
      if (secondMass < config.emptyFrontMass && firstMass > config.unopposedTinyMass) {
        const strength = clamp(firstMass / config.unopposedUsefulMass, 0.15, 1);
        firstAdvance = Math.max(firstAdvance, config.unopposedAdvance * strength);
      }
      if (firstMass < config.emptyFrontMass && secondMass > config.unopposedTinyMass) {
        const strength = clamp(secondMass / config.unopposedUsefulMass, 0.15, 1);
        secondAdvance = Math.max(secondAdvance, config.unopposedAdvance * strength);
      }
      if (second.collapse[i]) firstAdvance *= config.collapseAdvanceMultiplier;
      if (first.collapse[i]) secondAdvance *= config.collapseAdvanceMultiplier;

      const rawForcing = firstAdvance - secondAdvance;
      output.forcing[i] = clamp(rawForcing, -2.5, 2.5);
      output.rawForcing[i] = rawForcing;
      output.pressure[i] = (firstMass - secondMass) / (firstMass + secondMass + EPS);
      first.advanceDebug[i] = firstAdvance;
      second.advanceDebug[i] = secondAdvance;
      first.stressDebug[i] = firstStress;
      second.stressDebug[i] = secondStress;

      const minMass = Math.min(firstMass, secondMass);
      grid.addConsumption(x, y, minMass / (8 + minMass));
    }
  }
}

export function applyFrontConsumption(
  side: Pick<SideFields, 'war' | 'committed' | 'drain'>,
  exposure: Float32Array,
  dt: number,
): void {
  for (let i = 0; i < exposure.length; i++) {
    if (exposure[i] <= 0) continue;
    const survival = Math.exp(-exposure[i] * dt);
    const before = side.committed[i];
    const after = before * survival;
    const loss = before - after;
    side.committed[i] = after;
    side.war[i] = Math.max(after, side.war[i] - loss);
    side.drain[i] = loss;
  }
}
