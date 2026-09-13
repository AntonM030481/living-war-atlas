// All amounts are the existing War Resource, not a second economy.
export const CONQUEST = {
  mobilizationSeconds: 120, // Finite production allotment, scaled by capital production.
  disclosureForceSeconds: 12, // Immediate deployment near the disclosed capital.
  resistanceForceSeconds: 24, // One-off local defenders when war first enters a country.
  opponentDecisionSeconds: 8, // Opponent observation cadence; no player cooldown.
  invasionStrengthRatio: 1.3, // Conservative opponent commitment against visible force + resistance.
} as const;
