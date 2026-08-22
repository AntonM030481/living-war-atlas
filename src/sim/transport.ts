import type { Side } from './Config';

export function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function sideAccess(side: Side, control: number): number {
  const signedControl = side === 'blue' ? control : -control;
  return smoothstep(-0.10, 0.78, signedControl);
}

export interface SideTransportFields {
  war: Float32Array;
  committed: Float32Array;
  potential: Float32Array;
  delta: Float32Array;
  incoming: Float32Array;
  flowX: Float32Array;
  flowY: Float32Array;
}

export function reserveAt(fields: SideTransportFields, index: number): number {
  return Math.max(0, fields.war[index] - fields.committed[index]);
}

export function clearTransportBuffers(fields: SideTransportFields): void {
  fields.delta.fill(0);
  fields.incoming.fill(0);
  fields.flowX.fill(0);
  fields.flowY.fill(0);
}

export function applyTransportDelta(fields: SideTransportFields): void {
  for (let i = 0; i < fields.war.length; i++) {
    fields.war[i] = Math.max(fields.committed[i], fields.war[i] + fields.delta[i]);
  }
}
