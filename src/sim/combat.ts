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

export function superiority(ownMass: number, enemyMass: number, epsilon = 1e-6): number {
  return clamp((ownMass - enemyMass) / (ownMass + enemyMass + epsilon), 0, 1);
}

export function stressRatio(attack: number, defence: number, epsilon = 1e-6): number {
  return attack / (defence + epsilon);
}
