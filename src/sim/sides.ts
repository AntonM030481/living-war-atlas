export type SideId = string;

export const CURRENT_SIDE_IDS = ['blue', 'red'] as const;
export type CurrentSideId = typeof CURRENT_SIDE_IDS[number];

export interface SideFields {
  war: Float32Array;
  committed: Float32Array;
  instability: Float32Array;
  potential: Float32Array;
  need: Float32Array;
  mass: Float32Array;
  commitmentTarget: Float32Array;
  availableMass: Float32Array;
  incoming: Float32Array;
  outgoing: Float32Array;
  delta: Float32Array;
  drain: Float32Array;
  advanceDebug: Float32Array;
  stressDebug: Float32Array;
  collapse: Uint8Array;
  flow: {
    x: Float32Array;
    y: Float32Array;
  };
}

export type SideFieldMap = Record<SideId, SideFields>;

export function createSideFields(size: number): SideFields {
  return {
    war: new Float32Array(size),
    committed: new Float32Array(size),
    instability: new Float32Array(size),
    potential: new Float32Array(size),
    need: new Float32Array(size),
    mass: new Float32Array(size),
    commitmentTarget: new Float32Array(size),
    availableMass: new Float32Array(size),
    incoming: new Float32Array(size),
    outgoing: new Float32Array(size),
    delta: new Float32Array(size),
    drain: new Float32Array(size),
    advanceDebug: new Float32Array(size),
    stressDebug: new Float32Array(size),
    collapse: new Uint8Array(size),
    flow: {
      x: new Float32Array(size),
      y: new Float32Array(size),
    },
  };
}

export function createSideFieldMap(sideIds: readonly SideId[], size: number): SideFieldMap {
  return Object.fromEntries(sideIds.map((sideId) => [sideId, createSideFields(size)]));
}

export function requireSide(fields: SideFieldMap, sideId: SideId): SideFields {
  const side = fields[sideId];
  if (!side) throw new Error(`Unknown side: ${sideId}`);
  return side;
}
