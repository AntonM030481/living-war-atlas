import type { TerrainType } from '../sim/types';

export function blockedPerimeter(width: number, height: number) {
  return (x: number, y: number): TerrainType =>
    x === 0 || y === 0 || x === width - 1 || y === height - 1 ? 'blocked' : 'open';
}
