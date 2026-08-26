import { Graphics } from 'pixi.js';
import type { MapDefinition } from '../sim/types';
import { initializeControlFromCities } from '../sim/initialControl';
import type { Point } from './coordinates';

const PAPER = 0xe6ddb7;
const PAPER_LIGHT = 0xf6efd7;
const INK = 0x2f2b24;
const RIVER = 0x4fa6bd;
const GRID = 0x8b7a59;
const BLOCKED = 0x68655f;

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

    if (this.map.terrainAt) {
      for (let y = 0; y < this.map.height; y++) {
        for (let x = 0; x < this.map.width; x++) {
          if (this.map.terrainAt(x, y) === 'open') continue;
          g.rect(x, y, 1, 1).fill({ color: BLOCKED, alpha: 0.88 });
        }
      }
    }
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

    const { width, height } = this.map;
    const blocked = new Uint8Array(width * height);
    if (this.map.terrainAt) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (this.map.terrainAt(x, y) !== 'open') blocked[y * width + x] = 1;
        }
      }
    }

    const control = new Float32Array(width * height);
    if (this.map.initialControl === 'city-distance') {
      initializeControlFromCities(control, width, height, blocked, this.map.cities);
    } else if (this.map.initialFrontX) {
      for (let y = 0; y < height; y++) {
        const frontX = this.map.initialFrontX(y);
        for (let x = 0; x < width; x++) {
          const i = y * width + x;
          control[i] = blocked[i] ? 0 : Math.tanh((frontX - x) / 2.4);
        }
      }
    } else {
      return;
    }

    this.drawControlZeroContour(g, control, blocked);
  }

  private drawControlZeroContour(g: Graphics, control: Float32Array, blocked: Uint8Array): void {
    const { width, height } = this.map;
    const intersection = (a: Point, b: Point, va: number, vb: number): Point => {
      const denominator = va - vb;
      const t = Math.abs(denominator) < 1e-6 ? 0.5 : va / denominator;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    };

    let segmentIndex = 0;
    for (let y = 0; y < height - 1; y++) {
      for (let x = 0; x < width - 1; x++) {
        const i00 = y * width + x;
        const i10 = i00 + 1;
        const i01 = i00 + width;
        const i11 = i01 + 1;
        if (blocked[i00] || blocked[i10] || blocked[i01] || blocked[i11]) continue;

        const v00 = control[i00];
        const v10 = control[i10];
        const v11 = control[i11];
        const v01 = control[i01];
        const points: Point[] = [];

        if ((v00 >= 0) !== (v10 >= 0)) points.push(intersection({ x, y }, { x: x + 1, y }, v00, v10));
        if ((v10 >= 0) !== (v11 >= 0)) points.push(intersection({ x: x + 1, y }, { x: x + 1, y: y + 1 }, v10, v11));
        if ((v11 >= 0) !== (v01 >= 0)) points.push(intersection({ x: x + 1, y: y + 1 }, { x, y: y + 1 }, v11, v01));
        if ((v01 >= 0) !== (v00 >= 0)) points.push(intersection({ x, y: y + 1 }, { x, y }, v01, v00));

        if (points.length === 2) {
          if ((segmentIndex++ & 1) === 0) g.moveTo(points[0].x, points[0].y).lineTo(points[1].x, points[1].y);
        } else if (points.length === 4) {
          const center = (v00 + v10 + v11 + v01) * 0.25;
          const pairs: Array<[Point, Point]> = center >= 0
            ? [[points[0], points[3]], [points[1], points[2]]]
            : [[points[0], points[1]], [points[2], points[3]]];
          for (const [a, b] of pairs) {
            if ((segmentIndex++ & 1) === 0) g.moveTo(a.x, a.y).lineTo(b.x, b.y);
          }
        }
      }
    }

    g.stroke({ color: INK, width: 0.38, alpha: 0.40 });
  }
}
