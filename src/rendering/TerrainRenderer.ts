import { Graphics } from 'pixi.js';
import type { MapDefinition } from '../sim/types';
import type { Point } from './coordinates';

const PAPER = 0xe6ddb7;
const PAPER_LIGHT = 0xf6efd7;
const INK = 0x2f2b24;
const RIVER = 0x4fa6bd;
const GRID = 0x8b7a59;

export class TerrainRenderer {
  constructor(
    private readonly terrain: Graphics,
    private readonly grid: Graphics,
    private readonly historicalBorder: Graphics,
    private readonly map: MapDefinition,
  ) {}

  draw(): void {
    this.drawTerrain();
    this.drawGrid();
    this.drawHistoricalBorder();
  }

  private drawTerrain(): void {
    const g = this.terrain;
    g.clear();
    g.rect(0, 0, this.map.width, this.map.height).fill(PAPER);

    for (let y = 2; y < this.map.height; y += 2.8) {
      const wobble = Math.sin(y * 1.73) * 0.16;
      g.moveTo(0, y).lineTo(this.map.width, y + wobble);
    }
    g.stroke({ color: 0x8a806d, width: 0.055, alpha: 0.12 });

    for (let x = 4; x < this.map.width; x += 6) {
      g.moveTo(x, 0).lineTo(x + Math.sin(x) * 0.25, this.map.height);
    }
    g.stroke({ color: 0xb8a77d, width: 0.04, alpha: 0.06 });

    for (const forest of this.map.forests) {
      const boundary: Point[] = [];
      const points = 42;
      for (let i = 0; i < points; i++) {
        const a = (i / points) * Math.PI * 2;
        const wobble = 1
          + 0.13 * Math.sin(a * 3 + forest.x * 0.13)
          + 0.08 * Math.sin(a * 5 - forest.y * 0.11)
          + 0.05 * Math.sin(a * 9 + forest.x * 0.07);
        boundary.push({
          x: forest.x + Math.cos(a) * forest.r * wobble * 0.92,
          y: forest.y + Math.sin(a) * forest.r * wobble * 0.78,
        });
      }
      g.moveTo(boundary[0].x, boundary[0].y);
      for (let i = 1; i < boundary.length; i++) g.lineTo(boundary[i].x, boundary[i].y);
      g.closePath().fill({ color: 0x83a96b, alpha: 0.30 });
    }

    for (let y = 0; y < this.map.height - 0.5; y += 0.5) {
      g.moveTo(this.map.riverX(y), y).lineTo(this.map.riverX(y + 0.5), y + 0.5);
    }
    g.stroke({ color: PAPER_LIGHT, width: 1.10, alpha: 0.75 });
    for (let y = 0; y < this.map.height - 0.5; y += 0.5) {
      g.moveTo(this.map.riverX(y), y).lineTo(this.map.riverX(y + 0.5), y + 0.5);
    }
    g.stroke({ color: RIVER, width: 0.46, alpha: 0.82 });
  }

  private drawGrid(): void {
    const g = this.grid;
    g.clear();
    for (let x = 16; x < this.map.width; x += 16) {
      g.moveTo(x, 0.7).lineTo(x, this.map.height - 0.7);
    }
    for (let y = 13; y < this.map.height; y += 13) {
      g.moveTo(0.7, y).lineTo(this.map.width - 0.7, y);
    }
    g.stroke({ color: GRID, width: 0.06, alpha: 0.28 });
  }

  private drawHistoricalBorder(): void {
    const g = this.historicalBorder;
    g.clear();
    let draw = true;
    for (let y = 0; y < this.map.height - 0.8; y += 0.8) {
      if (draw) {
        g.moveTo(this.map.initialFrontX(y), y)
          .lineTo(this.map.initialFrontX(y + 0.55), y + 0.55);
      }
      draw = !draw;
    }
    g.stroke({ color: INK, width: 0.26, alpha: 0.24 });
  }
}
