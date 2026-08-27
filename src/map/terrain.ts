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

export function rasterizeTerrainRegions(
  width: number,
  height: number,
  regions: readonly TerrainRegion[],
): Uint8Array {
  const mask = new Uint8Array(width * height);
  for (const region of regions) {
    const minX = Math.max(0, Math.floor(region.x - region.r * 1.25));
    const maxX = Math.min(width - 1, Math.ceil(region.x + region.r * 1.25));
    const minY = Math.max(0, Math.floor(region.y - region.r));
    const maxY = Math.min(height - 1, Math.ceil(region.y + region.r));
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (pointInTerrainRegion(x + 0.5, y + 0.5, region)) mask[y * width + x] = 1;
      }
    }
  }
  return mask;
}

export function blockedPerimeter(width: number, height: number) {
  return (x: number, y: number): TerrainType =>
    x === 0 || y === 0 || x === width - 1 || y === height - 1 ? 'blocked' : 'open';
}
