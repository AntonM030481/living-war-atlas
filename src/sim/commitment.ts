import type { Side } from './Config';
import type { SideFields } from './sides';

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

type CommitmentFields = Pick<SideFields, 'war' | 'committed' | 'commitmentTarget' | 'collapse'>;

type LegacyCommitmentFields = {
  warBlue: Float32Array;
  warRed: Float32Array;
  committedBlue: Float32Array;
  committedRed: Float32Array;
  commitmentTargetBlue: Float32Array;
  commitmentTargetRed: Float32Array;
  collapseBlue: Uint8Array;
  collapseRed: Uint8Array;
};

export function updateCommittedAmounts(fields: CommitmentFields, config: CommitmentConfig): void;
export function updateCommittedAmounts(
  side: Side,
  size: number,
  fields: LegacyCommitmentFields,
  config: CommitmentConfig,
): void;
export function updateCommittedAmounts(
  fieldsOrSide: CommitmentFields | Side,
  configOrSize: CommitmentConfig | number,
  legacyFields?: LegacyCommitmentFields,
  legacyConfig?: CommitmentConfig,
): void {
  let fields: CommitmentFields;
  let config: CommitmentConfig;

  if (typeof fieldsOrSide === 'string') {
    const side = fieldsOrSide;
    if (!legacyFields || !legacyConfig) throw new Error('Missing legacy commitment arguments');
    fields = side === 'blue'
      ? {
          war: legacyFields.warBlue,
          committed: legacyFields.committedBlue,
          commitmentTarget: legacyFields.commitmentTargetBlue,
          collapse: legacyFields.collapseBlue,
        }
      : {
          war: legacyFields.warRed,
          committed: legacyFields.committedRed,
          commitmentTarget: legacyFields.commitmentTargetRed,
          collapse: legacyFields.collapseRed,
        };
    config = legacyConfig;
    void configOrSize;
  } else {
    fields = fieldsOrSide;
    config = configOrSize as CommitmentConfig;
  }

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
