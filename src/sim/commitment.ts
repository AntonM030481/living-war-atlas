import type { SideFields } from './sides';

const EPS = 1e-6;

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

function smoothFalloff(distance: number, radius: number): number {
  const t = clamp(1 - distance / Math.max(radius, EPS), 0, 1);
  return t * t * (3 - 2 * t);
}

export interface CommitmentConfig {
  baseProbe: number;
  frontCommitmentSafety: number;
  defenceAdvantage: number;
  frontCommitmentFloor: number;
  frontOffensiveCommitmentShare: number;
  frontCommitmentMax: number;
  frontUnopposedCommitment: number;
  collapseCommitmentFactor: number;
  commitmentEngagePerSecond: number;
  commitmentReleasePerSecond: number;
  collapseReleaseMultiplier: number;
  dt: number;
}

export function frontCommitment(
  ownMass: number,
  enemyMass: number,
  terrainDefense: number,
  collapsed: boolean,
  config: CommitmentConfig,
): number {
  if (ownMass <= EPS) return 0;
  if (enemyMass <= EPS) {
    const commitment = config.frontUnopposedCommitment;
    return collapsed ? commitment * config.collapseCommitmentFactor : commitment;
  }

  const requiredMass =
    (enemyMass * config.baseProbe * config.frontCommitmentSafety) /
    (config.defenceAdvantage * terrainDefense + EPS);
  const defensiveAmount = Math.max(ownMass * config.frontCommitmentFloor, requiredMass);
  const superiority = clamp((ownMass - enemyMass) / (ownMass + enemyMass + EPS), 0, 1);
  const offensiveAmount = Math.max(0, ownMass - defensiveAmount) *
    config.frontOffensiveCommitmentShare * superiority;
  let commitment = clamp(
    (defensiveAmount + offensiveAmount) / ownMass,
    0,
    config.frontCommitmentMax,
  );
  if (collapsed) commitment *= config.collapseCommitmentFactor;
  return commitment;
}

export function updateCommittedAmounts(
  fields: Pick<SideFields, 'war' | 'committed' | 'commitmentTarget' | 'collapse'>,
  config: CommitmentConfig,
): void {
  const { war, committed, commitmentTarget, collapse } = fields;
  for (let i = 0; i < war.length; i++) {
    committed[i] = Math.min(committed[i], war[i]);
    const desired = war[i] * commitmentTarget[i];
    const current = committed[i];
    if (desired > current) {
      const alpha = 1 - Math.exp(-config.commitmentEngagePerSecond * config.dt);
      committed[i] = Math.min(war[i], current + (desired - current) * alpha);
    } else if (desired < current) {
      const releaseRate = config.commitmentReleasePerSecond *
        (collapse[i] ? config.collapseReleaseMultiplier : 1);
      const alpha = 1 - Math.exp(-releaseRate * config.dt);
      committed[i] = Math.max(desired, current - (current - desired) * alpha);
    }
  }
}

export interface PairCommitmentGrid {
  width: number;
  height: number;
  radius: number;
  terrainDefense: Float32Array;
  isFront: (index: number) => boolean;
  firstAccess: (index: number) => number;
  secondAccess: (index: number) => number;
}

/** Derives committed front mass and demand for one pair of opposing sides. */
export function computePairCommitment(
  first: SideFields,
  second: SideFields,
  grid: PairCommitmentGrid,
  config: CommitmentConfig,
): void {
  for (const side of [first, second]) {
    side.mass.fill(0);
    side.availableMass.fill(0);
    side.commitmentTarget.fill(0);
    side.need.fill(0);
  }

  const size = grid.width * grid.height;
  const firstTargetWeighted = new Float32Array(size);
  const secondTargetWeighted = new Float32Array(size);
  const firstTargetWeight = new Float32Array(size);
  const secondTargetWeight = new Float32Array(size);

  const radius = grid.radius;
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const i = y * grid.width + x;
      if (!grid.isFront(i)) continue;

      let firstAvailable = 0;
      let secondAvailable = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= grid.height) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= grid.width) continue;
          const j = yy * grid.width + xx;
          const weight = 1 / (1 + Math.hypot(dx, dy));
          firstAvailable += first.war[j] * weight;
          secondAvailable += second.war[j] * weight;
        }
      }
      first.availableMass[i] = firstAvailable;
      second.availableMass[i] = secondAvailable;

      const firstTarget = frontCommitment(
        firstAvailable,
        secondAvailable,
        grid.terrainDefense[i],
        first.collapse[i] === 1,
        config,
      );
      const secondTarget = frontCommitment(
        secondAvailable,
        firstAvailable,
        grid.terrainDefense[i],
        second.collapse[i] === 1,
        config,
      );

      // Spread each front target as a smooth radial field instead of assigning
      // the strongest nearby target wholesale. The denominator deliberately
      // uses the unattenuated spatial weight: with one source this reduces to
      // target * falloff, while overlapping front segments blend continuously.
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= grid.height) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= grid.width) continue;
          const distance = Math.hypot(dx, dy);
          if (distance > radius) continue;
          const j = yy * grid.width + xx;
          const weight = 1 / (1 + distance);
          const falloff = smoothFalloff(distance, radius);

          if (firstTarget > 0 && grid.firstAccess(j) > 0.01) {
            firstTargetWeighted[j] += firstTarget * falloff * weight;
            firstTargetWeight[j] += weight;
          }
          if (secondTarget > 0 && grid.secondAccess(j) > 0.01) {
            secondTargetWeighted[j] += secondTarget * falloff * weight;
            secondTargetWeight[j] += weight;
          }
        }
      }
    }
  }

  for (let i = 0; i < size; i++) {
    if (firstTargetWeight[i] > EPS) {
      first.commitmentTarget[i] = firstTargetWeighted[i] / firstTargetWeight[i];
    }
    if (secondTargetWeight[i] > EPS) {
      second.commitmentTarget[i] = secondTargetWeighted[i] / secondTargetWeight[i];
    }
  }

  updateCommittedAmounts(first, config);
  updateCommittedAmounts(second, config);

  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const i = y * grid.width + x;
      if (!grid.isFront(i)) continue;
      let firstMass = 0;
      let secondMass = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= grid.height) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= grid.width) continue;
          const j = yy * grid.width + xx;
          const weight = 1 / (1 + Math.hypot(dx, dy));
          firstMass += first.committed[j] * weight;
          secondMass += second.committed[j] * weight;
        }
      }
      first.mass[i] = firstMass;
      second.mass[i] = secondMass;
      const firstShortage = Math.max(0, secondMass - firstMass);
      const secondShortage = Math.max(0, firstMass - secondMass);
      first.need[i] = 0.65 + 1.8 * first.instability[i] + 0.025 * secondMass + 0.018 * firstShortage;
      second.need[i] = 0.65 + 1.8 * second.instability[i] + 0.025 * firstMass + 0.018 * secondShortage;
    }
  }
}
