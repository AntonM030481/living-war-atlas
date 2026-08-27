import type { MapPoint, TerrainRegion, TerrainType } from '../sim/types';

const terrainRegionWobble = (angle: number, region: TerrainRegion): number =>
  1
  + 0.13 * Math.sin(angle * 3 + region.x * 0.13)
  + 0.08 * Math.sin(angle * 5 - region.y * 0.11)
  + 0.05 * Math.sin(angle * 9 + region.x * 0.07);

export function terrainRegionBoundary(region: TerrainRegion, points = 42): MapPoint[] {
  return Array.from({ length: points }, (_, i) => {
    const angle = (i / points) * Math.PI * 2;
    const wobble = terrainRegionWobble(angle, region);
    return {
      x: region.x + Math.cos(angle) * region.r * wobble * 0.92,
      y: region.y + Math.sin(angle) * region.r * wobble * 0.78,
    };
  });
}

export function pointInTerrainRegion(x: number, y: number, region: TerrainRegion): boolean {
  const dx = (x - region.x) / 0.92;
  const dy = (y - region.y) / 0.78;
  const angle = Math.atan2(dy, dx);
  const radius = Math.hypot(dx, dy);
  return radius < region.r * terrainRegionWobble(angle, region);
}

export function blockedPerimeter(width: number, height: number) {
  return (x: number, y: number): TerrainType =>
    x === 0 || y === 0 || x === width - 1 || y === height - 1 ? 'blocked' : 'open';
}
