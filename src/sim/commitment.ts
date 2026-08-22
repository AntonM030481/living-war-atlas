import type { Side } from './Config';

const EPS = 1e-6;

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
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
  side: Side,
  size: number,
  fields: {
    warBlue: Float32Array;
    warRed: Float32Array;
    committedBlue: Float32Array;
    committedRed: Float32Array;
    commitmentTargetBlue: Float32Array;
    commitmentTargetRed: Float32Array;
    collapseBlue: Uint8Array;
    collapseRed: Uint8Array;
  },
  config: CommitmentConfig,
): void {
  const war = side === 'blue' ? fields.warBlue : fields.warRed;
  const committed = side === 'blue' ? fields.committedBlue : fields.committedRed;
  const targetFraction = side === 'blue' ? fields.commitmentTargetBlue : fields.commitmentTargetRed;
  const collapsed = side === 'blue' ? fields.collapseBlue : fields.collapseRed;

  for (let i = 0; i < size; i++) {
    committed[i] = Math.min(committed[i], war[i]);
    const desired = war[i] * targetFraction[i];
    const current = committed[i];
    if (desired > current) {
      const alpha = 1 - Math.exp(-config.commitmentEngagePerSecond * config.dt);
      committed[i] = Math.min(war[i], current + (desired - current) * alpha);
    } else if (desired < current) {
      const releaseRate = config.commitmentReleasePerSecond *
        (collapsed[i] ? config.collapseReleaseMultiplier : 1);
      const alpha = 1 - Math.exp(-releaseRate * config.dt);
      committed[i] = Math.max(desired, current - (current - desired) * alpha);
    }
  }
}
