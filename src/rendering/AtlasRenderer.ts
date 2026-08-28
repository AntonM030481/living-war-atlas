import { Application, Container, Graphics } from 'pixi.js';
import { CFG } from '../sim/Config';
import type { MapDefinition, SimulationSnapshot } from '../sim/types';
import { FrontInspector } from '../diagnostics/FrontInspector';
import type { FrontDebugInfo } from '../diagnostics/types';
import { FlowRenderer } from './FlowRenderer';
import { FrontRenderer } from './FrontRenderer';
import { PotentialContourRenderer } from './PotentialContourRenderer';
import { TerrainRenderer } from './TerrainRenderer';
import { clientToWorld, worldToScreen, type Point, type ViewTransform } from './coordinates';

const BLUE_DARK = 0x164f91;
const RED_DARK = 0xb12620;
const TOUCH_CITY_HIT_RADIUS_PX = 24;
const INSTABILITY_WARNING_THRESHOLD = 0.08;
const INSTABILITY_WARNING_SPACING = 10;

export { type FrontDebugInfo } from '../diagnostics/types';

export class AtlasRenderer {
  private readonly world = new Container();
  private readonly terrain = new Graphics();
  private readonly grid = new Graphics();
  private readonly historicalBorder = new Graphics();
  private readonly territory = new Graphics();
  private readonly resourceDensity = new Graphics();
  private readonly potentialContours = new Graphics();
  private readonly flows = new Graphics();
  private readonly front = new Graphics();
  private readonly instability = new Graphics();
  private readonly probe = new Graphics();

  private readonly terrainRenderer: TerrainRenderer;
  private readonly flowRenderer: FlowRenderer;
  private readonly potentialContourRenderer: PotentialContourRenderer;
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
    this.potentialContourRenderer = new PotentialContourRenderer(this.potentialContours);
    this.frontRenderer = new FrontRenderer(this.front, this.probe);
    this.frontInspector = new FrontInspector(this.frontRenderer, () => this.mapScale());

    this.world.addChild(
      this.terrain,
      this.grid,
      this.historicalBorder,
      this.territory,
      this.resourceDensity,
      this.potentialContours,
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
    this.potentialContours.visible = value;
    this.instability.visible = value;
    this.probe.visible = value;
    if (!value) this.potentialContourRenderer.clear();
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
    const transform = this.transform();
    return {
      left: transform.canvasRect.left + transform.worldX * transform.canvasScaleX,
      top: transform.canvasRect.top + transform.worldY * transform.canvasScaleY,
      width: this.map.width * transform.scaleX * transform.canvasScaleX,
      height: this.map.height * transform.scaleY * transform.canvasScaleY,
    };
  }

  resize(): void {
    this.fit();
  }

  worldToScreen(point: Point): Point {
    return worldToScreen(point, this.transform());
  }

  cityIdAtClientPoint(clientX: number, clientY: number): string | null {
    const transform = this.transform();
    const { x, y } = clientToWorld(clientX, clientY, transform);
    const touchFriendly = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1;
    const touchRadiusWorld = touchFriendly
      ? TOUCH_CITY_HIT_RADIUS_PX / Math.max(0.001, Math.min(
          transform.scaleX * transform.canvasScaleX,
          transform.scaleY * transform.canvasScaleY,
        ))
      : 0;
    let best: string | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const city of this.map.cities) {
      const visualRadius = (1.15 + city.baseProduction * 0.14) * this.mapScale();
      const radius = Math.max(visualRadius, touchRadiusWorld);
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
    return this.inspectFront(snapshot, this.clientToWorld(clientX, clientY));
  }

  inspectFrontAtWorldPoint(snapshot: SimulationSnapshot, point: Point): FrontDebugInfo | null {
    return this.inspectFront(snapshot, point);
  }

  render(snapshot: SimulationSnapshot): void {
    this.territory.clear();
    this.drawResourceDensity(snapshot);

    if (this.debug) {
      this.potentialContourRenderer.draw(snapshot);
    } else {
      this.potentialContourRenderer.clear();
    }

    if (this.showFlows) this.flowRenderer.draw(snapshot);
    else this.flowRenderer.clear();

    this.frontRenderer.draw(snapshot);
    this.drawInstability(snapshot);
    this.updateFrontProbe(snapshot);
  }

  private inspectFront(snapshot: SimulationSnapshot, point: Point): FrontDebugInfo | null {
    const info = this.frontInspector.inspect(snapshot, point);
    this.updateFrontProbe(snapshot);
    return info;
  }

  private updateFrontProbe(snapshot: SimulationSnapshot): void {
    this.frontRenderer.drawProbe(snapshot, this.frontInspector.selectedFrontIndex);
  }

  private transform(): ViewTransform {
    const canvasRect = this.app.canvas.getBoundingClientRect();
    return {
      canvasRect,
      worldX: this.world.x,
      worldY: this.world.y,
      scaleX: this.world.scale.x,
      scaleY: this.world.scale.y,
      canvasScaleX: canvasRect.width / this.app.screen.width,
      canvasScaleY: canvasRect.height / this.app.screen.height,
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
  }

  private drawResourceHeightmap(
    g: Graphics,
    snapshot: SimulationSnapshot,
    side: 'blue' | 'red',
  ): void {
    const color = side === 'blue' ? BLUE_DARK : RED_DARK;
    const war = side === 'blue' ? snapshot.warBlue : snapshot.warRed;
    const capacity = CFG.resourceCellCapacity;

    for (let y = 0; y < snapshot.height; y++) {
      for (let x = 0; x < snapshot.width; x++) {
        const i = y * snapshot.width + x;
        const control = side === 'blue' ? snapshot.control[i] : -snapshot.control[i];
        if (control < -0.12) continue;
        const utilization = Math.max(0, Math.min(1, war[i] / capacity));
        if (utilization <= 0) continue;
        const strength = Math.pow(utilization, 0.70);
        g.rect(x, y, 1, 1).fill({ color, alpha: 0.035 + strength * 0.31 });
      }
    }
  }

  private drawInstability(snapshot: SimulationSnapshot): void {
    const g = this.instability;
    g.clear();
    if (!this.debug) return;

    const samples = this.frontRenderer.samples(snapshot).map((sample) => {
      const i = sample.sampleIndex;
      const blue = snapshot.instabilityBlue[i];
      const red = snapshot.instabilityRed[i];
      return { sample, blue, red, value: Math.max(blue, red) };
    });

    const candidates = samples
      .filter(({ value }) => value >= INSTABILITY_WARNING_THRESHOLD)
      .filter(({ value }, index) => {
        const previous = samples[index - 1]?.value ?? -Infinity;
        const next = samples[index + 1]?.value ?? -Infinity;
        return value >= previous && value >= next;
      })
      .sort((a, b) => b.value - a.value);

    const selected: typeof candidates = [];
    for (const candidate of candidates) {
      if (selected.some(({ sample }) => Math.hypot(
        candidate.sample.x - sample.x,
        candidate.sample.y - sample.y,
      ) < INSTABILITY_WARNING_SPACING)) continue;
      selected.push(candidate);
    }

    for (const { sample, blue, red, value } of selected) {
      const color = blue > red ? BLUE_DARK : RED_DARK;
      const strength = Math.min(1, value);
      const size = 0.75 + strength * 0.75;
      const alpha = Math.min(0.82, 0.42 + value * 0.35);
      const width = 0.16 + strength * 0.12;
      g.moveTo(sample.x - size, sample.y - size).lineTo(sample.x + size, sample.y + size);
      g.moveTo(sample.x - size, sample.y + size).lineTo(sample.x + size, sample.y - size);
      g.stroke({ color, width, alpha });
    }
  }
}
