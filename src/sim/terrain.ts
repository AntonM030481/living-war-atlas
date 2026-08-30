import { rasterizeTerrainRegions } from '../map/terrain';
import { CFG } from './Config';
import { rasterizeRivers } from './rivers';
import type { MapDefinition } from './types';

export interface TerrainFields {
  defense: Float32Array;
  mobility: Float32Array;
  capacity: Float32Array;
  blocked: Uint8Array;
  forest: Uint8Array;
  riverCrossingX: Float32Array;
  riverCrossingY: Float32Array;
}

export function initializeTerrainFields(map: MapDefinition, fields: TerrainFields): void {
  const { width, height } = map;
  fields.defense.fill(1);
  fields.mobility.fill(1);
  fields.capacity.fill(1);

  const river = rasterizeRivers(width, height, map.rivers);
  fields.riverCrossingX.set(river.crossingX);
  fields.riverCrossingY.set(river.crossingY);
  fields.forest.set(rasterizeTerrainRegions(width, height, map.forests));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const terrain = map.terrainAt?.(x, y) ?? 'open';
      if (terrain !== 'open') {
        fields.blocked[i] = 1;
        fields.mobility[i] = 0;
        fields.capacity[i] = 0;
        continue;
      }

      const riverStrength = river.strength[i];
      if (riverStrength > 0) {
        fields.defense[i] *= 1 + CFG.riverDefenseBonus * riverStrength;
        fields.mobility[i] *= 1 - CFG.riverMobilityPenalty * riverStrength;
        fields.capacity[i] *= 1 - CFG.riverCapacityPenalty * riverStrength;
      }

      if (fields.forest[i]) {
        fields.defense[i] *= CFG.forestDefenseMultiplier;
        fields.mobility[i] *= CFG.forestMobilityMultiplier;
        fields.capacity[i] *= CFG.forestCapacityMultiplier;
      }
    }
  }
}
