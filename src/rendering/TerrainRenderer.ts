import { Graphics } from 'pixi.js';
import type { MapDefinition } from '../sim/types';

const PAPER = 0xe6ddb7;
const RIVER = 0x4fa6bd;

export class TerrainRenderer {
  constructor(readonly graphics: Graphics, private readonly map: MapDefinition) {}

  drawBase(): void {
    this.graphics.clear();
    this.graphics.rect(0, 0, this.map.width, this.map.height).fill(PAPER);
  }

  drawRiver(): void {
    const g = this.graphics;
    g.moveTo(this.map.riverX(0), 0);
    for (let y = 1; y < this.map.height; y++) g.lineTo(this.map.riverX(y), y);
    g.stroke({ width: 1.1, color: RIVER, alpha: 0.8 });
  }
}
