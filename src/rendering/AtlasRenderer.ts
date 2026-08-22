import { Application, Container, Graphics } from 'pixi.js';
import type { MapDefinition, SimulationSnapshot } from '../sim/types';
import { FrontInspector } from '../diagnostics/FrontInspector';
import type { FrontDebugInfo } from '../diagnostics/types';
import { FlowRenderer } from './FlowRenderer';
import { FrontRenderer } from './FrontRenderer';
import { TerrainRenderer } from './TerrainRenderer';
import { clientToWorld, worldToScreen, type Point, type ViewTransform } from './coordinates';

const BLUE_DARK = 0x164f91;
const RED_DARK = 0xb12620;
const RESOURCE_CLAMP = 18;

export { type FrontDebugInfo } from '../diagnostics/types';

export class AtlasRenderer {
  private readonly world = new Container();
  private readonly terrain = new Graphics();
  private readonly grid = new Graphics();
  private readonly historicalBorder = new Graphics();
  private readonly territory = new Graphics();
  private readonly resourceDensity = new Graphics();
  private readonly flows = new Graphics();
  private readonly front = new Graphics();
  private readonly instability = new Graphics();
  private readonly probe = new Graphics();

  private readonly terrainRenderer: TerrainRenderer;
  private readonly flowRenderer: FlowRenderer;
  private readonly frontRenderer: FrontRenderer;
  private readonly frontInspector: FrontInspector;

  private debug = false;
  private showFlows = false;

  constructor(
    private readonly app: Application,
    private readonly map: MapDefinition,
  ) {
    this.terrainRenderer = new TerrainRenderer(this.terrain, this.grid, this.historicalBorder, map);
    this.flowRenderer = new FlowRenderer(this.flows);
    this.frontRenderer = new FrontRenderer(this.front, this.probe);
    this.frontInspector = new FrontInspector(this.frontRenderer, () => this.mapScale());

    this.world.addChild(
      this.terrain,
      this.grid,
      this.historicalBorder,
      this.territory,
      this.resourceDensity,
      this.flows,
      this.front,
      this.instability,
      this.probe,
    );
    this.app.stage.addChild(this.world);
    this.terrainRenderer.draw();
    this.fit();
    window.addEventListener('resize', () => this.fit());
  }

  setDebug(value: boolean): void {
    this.debug = value;
    this.instability.visible = value;
    this.resourceDensity.visible = value;
  }

  setShowFlows(value: boolean): void {
    this.showFlows = value;
    this.flows.visible = value;
    if (!value) this.flowRenderer.clear();
  }

  toggleDebug(): boolean {
    this.setDebug(!this.debug);
    return this.debug;
  }

  mapScreenRect(): { left: number; top: number; width: number; height: number } {
    const canvasRect = this.app.canvas.getBoundingClientRect();
    return {
      left: canvasRect.left + this.world.x,
      top: canvasRect.top + this.world.y,
      width: this.map.width * this.world.scale.x,
      height: this.map.height * this.world.scale.y,
    };
  }

  resize(): void {
    this.fit();
  }

  worldToScreen(point: Point): Point {
    return worldToScreen(point, this.transform());
  }

  cityIdAtClientPoint(clientX: number, clientY: number): string | null {
    const { x, y } = this.clientToWorld(clientX, clientY);
    let best: string | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const city of this.map.cities) {
      const radius = (1.15 + city.baseProduction * 0.14) * this.mapScale();
      const distance = Math.hypot(x - city.x, y - city.y);
      if (distance <= radius && distance < bestDistance) {
        best = city.id;
        bestDistance = distance;
      }
    }

    return best;
  }

  inspectFrontAtClientPoint(
    snapshot: SimulationSnapshot,
    clientX: number,
    clientY: number,
  ): FrontDebugInfo | null {
    return this.frontInspector.inspect(snapshot, this.clientToWorld(clientX, clientY));
  }

  inspectFrontAtWorldPoint(snapshot: SimulationSnapshot, point: Point): FrontDebugInfo | null {
    return this.frontInspector.inspect(snapshot, point);
  }

  render(snapshot: SimulationSnapshot): void {
    this.territory.clear();
    if (this.debug) this.drawResourceDensity(snapshot);
    else this.resourceDensity.clear();

    if (this.showFlows) this.flowRenderer.draw(snapshot);
    else this.flowRenderer.clear();

    this.frontRenderer.draw(snapshot);
    if (this.debug) this.drawInstability(snapshot);
    else this.instability.clear();
    this.frontRenderer.drawProbe(snapshot, this.frontInspector.selectedFrontIndex);
  }

  private transform(): ViewTransform {
    return {
      canvasRect: this.app.canvas.getBoundingClientRect(),
      worldX: this.world.x,
      worldY: this.world.y,
      scaleX: this.world.scale.x,
      scaleY: this.world.scale.y,
    };
  }

  private clientToWorld(clientX: number, clientY: number): Point {
    return clientToWorld(clientX, clientY, this.transform());
  }

  private mapScale(): number {
    return this.map.width / 128;
  }

  private fit(): void {
    const availableWidth = Math.max(240, this.app.screen.width);
    const sx = availableWidth / this.map.width;
    const sy = this.app.screen.height / this.map.height;
    const scale = Math.max(0.1, Math.min(sx, sy));
    this.world.scale.set(scale);
    this.world.x = (availableWidth - this.map.width * scale) / 2;
    this.world.y = (this.app.screen.height - this.map.height * scale) / 2;
  }

  private drawResourceDensity(snapshot: SimulationSnapshot): void {
    const g = this.resourceDensity;
    g.clear();
    this.drawResourceHeightmap(g, snapshot, 'blue');
    this.drawResourceHeightmap(g, snapshot, 'red');
    this.drawResourceOverloadGlow(g, snapshot, 'blue');
    this.drawResourceOverloadGlow(g, snapshot, 'red');
    this.drawCityResourceClouds(g, snapshot);
  }

  private drawResourceHeightmap(
    g: Graphics,
    snapshot: SimulationSnapshot,
    side: 'blue' | 'red',
  ): void {
    const color = side === 'blue' ? BLUE_DARK : RED_DARK;
    const war = side === 'blue' ? snapshot.warBlue : snapshot.warRed;

    for (let y = 0; y < snapshot.height; y++) {
      for (let x = 0; x < snapshot.width; x++) {
        const i = y * snapshot.width + x;
        const control = side === 'blue' ? snapshot.control[i] : -snapshot.control[i];
        if (control < -0.12) continue;
        const value = war[i];
        if (value < 0.08) continue;
        const strength = Math.max(0, Math.min(1, Math.pow(value / RESOURCE_CLAMP, 0.70)));
        g.rect(x, y, 1, 1).fill({ color, alpha: 0.035 + strength * 0.31 });
      }
    }
  }

  private drawResourceOverloadGlow(
    g: Graphics,
    snapshot: SimulationSnapshot,
    side: 'blue' | 'red',
  ): void {
    const color = side === 'blue' ? BLUE_DARK : RED_DARK;
    const war = side === 'blue' ? snapshot.warBlue : snapshot.warRed;

    for (let y = 0; y < snapshot.height; y += 2) {
      for (let x = 0; x < snapshot.width; x += 2) {
        const i = y * snapshot.width + x;
        const control = side === 'blue' ? snapshot.control[i] : -snapshot.control[i];
        if (control < -0.12) continue;
        const overload = war[i] - RESOURCE_CLAMP;
        if (overload <= 0) continue;
        const strength = Math.min(1, Math.log1p(overload) / Math.log1p(160));
        g.circle(x + 0.5, y + 0.5, 1.8 + strength * 3.4).fill({
          color,
          alpha: 0.035 + strength * 0.17,
        });
      }
    }
  }

  private drawCityResourceClouds(g: Graphics, snapshot: SimulationSnapshot): void {
    for (const city of snapshot.cities) {
      const blue = city.owner === 'blue';
      const war = blue ? snapshot.warBlue : snapshot.warRed;
      const color = blue ? BLUE_DARK : RED_DARK;
      const localWar = this.localSum(snapshot, war, city.x, city.y, 5);
      if (localWar < 6) continue;

      const strength = Math.min(1, Math.log1p(localWar) / Math.log1p(900));
      const radius = 1.5 + strength * 6.5;
      const alpha = 0.11 + strength * 0.27;
      g.circle(city.x, city.y, radius * 1.45).fill({ color, alpha: alpha * 0.22 });
      g.circle(city.x, city.y, radius).fill({ color, alpha });
    }
  }

  private drawInstability(snapshot: SimulationSnapshot): void {
    const g = this.instability;
    g.clear();
    for (let y = 1; y < snapshot.height - 1; y += 2) {
      for (let x = 1; x < snapshot.width - 1; x += 2) {
        const i = y * snapshot.width + x;
        if (Math.abs(snapshot.control[i]) > 0.24) continue;
        const blue = snapshot.instabilityBlue[i];
        const red = snapshot.instabilityRed[i];
        const value = Math.max(blue, red);
        if (value < 0.08) continue;
        const color = blue > red ? BLUE_DARK : RED_DARK;
        const strength = Math.min(1, value);
        const size = 0.42 + strength * 0.92;
        const alpha = Math.min(0.62, 0.16 + value * 0.32);
        const width = 0.13 + strength * 0.13;
        g.moveTo(x - size, y - size).lineTo(x + size, y + size);
        g.moveTo(x - size, y + size).lineTo(x + size, y - size);
        g.stroke({ color, width, alpha });
      }
    }
  }

  private localSum(
    snapshot: SimulationSnapshot,
    field: Float32Array,
    x: number,
    y: number,
    radius: number,
  ): number {
    let total = 0;
    const cx = Math.round(x);
    const cy = Math.round(y);
    for (let dy = -radius; dy <= radius; dy++) {
      const yy = cy + dy;
      if (yy < 0 || yy >= snapshot.height) continue;
      for (let dx = -radius; dx <= radius; dx++) {
        const xx = cx + dx;
        if (xx < 0 || xx >= snapshot.width) continue;
        const distance = Math.hypot(dx, dy);
        if (distance > radius) continue;
        const weight = 1 - distance / (radius + 1);
        total += field[yy * snapshot.width + xx] * weight;
      }
    }
    return total;
  }
}
