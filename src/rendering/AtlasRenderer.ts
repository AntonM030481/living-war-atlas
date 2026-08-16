import { Application, Container, Graphics, Text } from 'pixi.js';
import type { SimulationSnapshot } from '../sim/types';
import type { MapDefinition } from '../sim/types';

const BLUE = 0x4f76a5;
const BLUE_DARK = 0x244d7e;
const RED = 0xb86154;
const RED_DARK = 0x81372f;
const PAPER = 0xd9cfb4;
const INK = 0x302d27;

export class AtlasRenderer {
  private readonly world = new Container();
  private readonly terrain = new Graphics();
  private readonly historicalBorder = new Graphics();
  private readonly territory = new Graphics();
  private readonly flows = new Graphics();
  private readonly front = new Graphics();
  private readonly instability = new Graphics();
  private readonly cities = new Graphics();
  private readonly labels = new Container();
  private debug = false;

  constructor(
    private readonly app: Application,
    private readonly map: MapDefinition,
  ) {
    this.world.addChild(
      this.terrain,
      this.historicalBorder,
      this.territory,
      this.flows,
      this.front,
      this.instability,
      this.cities,
      this.labels,
    );
    this.app.stage.addChild(this.world);
    this.drawTerrain();
    this.drawHistoricalBorder();
    this.createCityLabels();
    this.fit();
    window.addEventListener('resize', () => this.fit());
  }

  setDebug(value: boolean): void {
    this.debug = value;
    this.instability.visible = value;
  }

  toggleDebug(): boolean {
    this.setDebug(!this.debug);
    return this.debug;
  }

  render(snapshot: SimulationSnapshot): void {
    this.drawTerritory(snapshot);
    this.drawFront(snapshot);
    this.drawFlows(snapshot);
    this.drawCities(snapshot);
    if (this.debug) this.drawInstability(snapshot);
  }

  private fit(): void {
    const margin = 18;
    const sx = (this.app.screen.width - margin * 2) / this.map.width;
    const sy = (this.app.screen.height - margin * 2) / this.map.height;
    const scale = Math.max(0.1, Math.min(sx, sy));
    this.world.scale.set(scale);
    this.world.x = (this.app.screen.width - this.map.width * scale) / 2;
    this.world.y = (this.app.screen.height - this.map.height * scale) / 2;
  }

  private drawTerrain(): void {
    const g = this.terrain;
    g.clear();
    g.rect(0, 0, this.map.width, this.map.height).fill(PAPER);

    for (const m of this.map.mountains) {
      g.circle(m.x, m.y, m.r).fill({ color: 0x8e856f, alpha: 0.12 });
      for (let k = -2; k <= 2; k++) {
        const yy = m.y + (k * m.r) / 4;
        const half = Math.sqrt(Math.max(0, m.r * m.r - (yy - m.y) ** 2));
        g.moveTo(m.x - half * 0.75, yy + 1)
          .lineTo(m.x - half * 0.30, yy - 1)
          .lineTo(m.x + half * 0.10, yy + 1)
          .lineTo(m.x + half * 0.55, yy - 1);
      }
    }
    g.stroke({ color: 0x6f6757, width: 0.20, alpha: 0.42 });

    for (let y = 0; y < this.map.height - 1; y += 0.75) {
      const x1 = this.map.riverX(y);
      const x2 = this.map.riverX(y + 0.75);
      g.moveTo(x1, y).lineTo(x2, y + 0.75);
    }
    g.stroke({ color: 0x718aa0, width: 0.72, alpha: 0.78 });
    g.stroke({ color: 0xa9bac5, width: 0.28, alpha: 0.90 });
  }

  private drawHistoricalBorder(): void {
    const g = this.historicalBorder;
    g.clear();
    let dash = true;
    for (let y = 0; y < this.map.height - 1; y += 1.0) {
      if (dash) {
        g.moveTo(this.map.initialFrontX(y), y)
          .lineTo(this.map.initialFrontX(y + 0.75), y + 0.75);
      }
      dash = !dash;
    }
    g.stroke({ color: 0x4b4740, width: 0.20, alpha: 0.42 });
  }

  private drawTerritory(snapshot: SimulationSnapshot): void {
    const g = this.territory;
    g.clear();
    const { width, height, control } = snapshot;

    for (let y = 0; y < height; y++) {
      let runStart = 0;
      let runKey = this.controlKey(control[y * width]);
      for (let x = 1; x <= width; x++) {
        const key = x < width ? this.controlKey(control[y * width + x]) : 999;
        if (key !== runKey) {
          if (runKey !== 0) {
            const strength = Math.abs(runKey) / 4;
            const color = runKey > 0 ? BLUE : RED;
            g.rect(runStart, y, x - runStart, 1).fill({
              color,
              alpha: 0.10 + strength * 0.20,
            });
          }
          runStart = x;
          runKey = key;
        }
      }
    }
  }

  private controlKey(c: number): number {
    const strength = Math.abs(c);
    if (strength < 0.05) return 0;
    const q = Math.min(4, Math.max(1, Math.ceil(strength * 4)));
    return c > 0 ? q : -q;
  }

  private drawFront(snapshot: SimulationSnapshot): void {
    const g = this.front;
    g.clear();
    const { width, height, control } = snapshot;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width - 1; x++) {
        const a = control[y * width + x];
        const b = control[y * width + x + 1];
        if ((a >= 0) !== (b >= 0)) {
          const t = Math.abs(a) / (Math.abs(a) + Math.abs(b) + 1e-6);
          const xx = x + t;
          g.moveTo(xx, y).lineTo(xx, y + 1);
        }
      }
    }

    for (let y = 0; y < height - 1; y++) {
      for (let x = 0; x < width; x++) {
        const a = control[y * width + x];
        const b = control[(y + 1) * width + x];
        if ((a >= 0) !== (b >= 0)) {
          const t = Math.abs(a) / (Math.abs(a) + Math.abs(b) + 1e-6);
          const yy = y + t;
          g.moveTo(x, yy).lineTo(x + 1, yy);
        }
      }
    }

    g.stroke({ color: 0xf4eedf, width: 0.90, alpha: 0.82 });
    g.stroke({ color: INK, width: 0.34, alpha: 0.98 });
  }

  private drawFlows(snapshot: SimulationSnapshot): void {
    const g = this.flows;
    g.clear();
    const strideX = 6;
    const strideY = 5;

    const drawSide = (
      flowX: Float32Array,
      flowY: Float32Array,
      side: 'blue' | 'red',
    ) => {
      for (let y = 2; y < snapshot.height - 2; y += strideY) {
        for (let x = 2; x < snapshot.width - 2; x += strideX) {
          const i = y * snapshot.width + x;
          const c = snapshot.control[i];
          if (side === 'blue' ? c < -0.05 : c > 0.05) continue;
          const fx = flowX[i];
          const fy = flowY[i];
          const mag = Math.hypot(fx, fy);
          if (mag < 0.10) continue;
          const inv = 1 / mag;
          const len = Math.min(2.8, 0.45 + Math.sqrt(mag) * 0.65);
          const dx = fx * inv * len;
          const dy = fy * inv * len;
          g.moveTo(x, y).lineTo(x + dx, y + dy);
        }
      }
      g.stroke({
        color: side === 'blue' ? BLUE_DARK : RED_DARK,
        width: 0.24,
        alpha: 0.42,
      });
    };

    drawSide(snapshot.flowBlueX, snapshot.flowBlueY, 'blue');
    drawSide(snapshot.flowRedX, snapshot.flowRedY, 'red');
  }

  private drawInstability(snapshot: SimulationSnapshot): void {
    const g = this.instability;
    g.clear();
    for (let y = 0; y < snapshot.height; y += 2) {
      for (let x = 0; x < snapshot.width; x += 2) {
        const i = y * snapshot.width + x;
        if (Math.abs(snapshot.control[i]) > 0.48) continue;
        const b = snapshot.instabilityBlue[i];
        const r = snapshot.instabilityRed[i];
        const v = Math.max(b, r);
        if (v < 0.12) continue;
        g.circle(x + 0.5, y + 0.5, 0.25 + Math.min(0.8, v) * 0.55).fill({
          color: b > r ? RED_DARK : BLUE_DARK,
          alpha: Math.min(0.7, 0.15 + v * 0.40),
        });
      }
    }
  }

  private drawCities(snapshot: SimulationSnapshot): void {
    const g = this.cities;
    g.clear();
    for (const city of snapshot.cities) {
      const radius = 0.75 + city.baseProduction * 0.13;
      const color = city.owner === 'blue' ? BLUE_DARK : RED_DARK;
      g.circle(city.x, city.y, radius + 0.34).fill({ color: 0xf5efdf, alpha: 0.92 });
      g.circle(city.x, city.y, radius).fill({ color, alpha: 0.92 });
      if (city.integration < 0.999) {
        g.circle(city.x, city.y, radius * city.integration).fill({ color: 0xf5efdf, alpha: 0.42 });
      }
    }
  }

  private createCityLabels(): void {
    for (const city of this.map.cities) {
      const label = new Text({
        text: city.name,
        style: {
          fontFamily: 'Arial, sans-serif',
          fontSize: 2.3,
          fontWeight: '600',
          fill: '#2d2a25',
          stroke: { color: '#eee7d5', width: 0.35 },
        },
      });
      label.x = city.x + 1.5;
      label.y = city.y - 1.3;
      label.resolution = 3;
      this.labels.addChild(label);
    }
  }
}
