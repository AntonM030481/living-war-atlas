import { Application } from 'pixi.js';
import { SPEEDS, type Speed } from '../sim/Config';
import type { HistoryInfo, MapDefinition, SimulationSnapshot, WorkerOutMessage } from '../sim/types';
import { AtlasRenderer } from '../rendering/AtlasRenderer';
import { buildCityDiagnostics } from '../diagnostics/CityDiagnostics';
import type { FrontDebugInfo } from '../diagnostics/types';
import { CityOverlays } from '../ui/CityOverlays';
import { DiagnosticsPanel } from '../ui/DiagnosticsPanel';
import { FrontProbe } from '../ui/FrontProbe';
import { Hud } from '../ui/Hud';
import { InputController } from './InputController';
import { SimulationClient } from './SimulationClient';

export class GameApp {
  private readonly pixi = new Application();
  private readonly simulation = new SimulationClient();
  private renderer!: AtlasRenderer;
  private overlays!: CityOverlays;
  private hud!: Hud;
  private probe!: FrontProbe;
  private diagnosticsPanel!: DiagnosticsPanel;
  private input!: InputController;
  private readonly mapStage = document.createElement('div');
  private readonly sidePanel = document.createElement('div');

  private currentSeed = 20260816;
  private speed: Speed = 4;
  private paused = false;
  private diagnosticsEnabled = false;
  private latestSnapshot: SimulationSnapshot | null = null;
  private latestHistory: HistoryInfo | null = null;
  private selectedProbe: FrontDebugInfo | null = null;
  private suppressNextPrimaryClickUntil = 0;
  private lastCityFlipAt = 0;
  private lastCityFlipId: string | null = null;

  constructor(private readonly root: HTMLDivElement, private readonly map: MapDefinition) {}

  async start(): Promise<void> {
    this.mapStage.className = 'map-stage';
    this.sidePanel.className = 'side-panel';
    this.root.append(this.mapStage, this.sidePanel);

    await this.initPixi();
    this.renderer = new AtlasRenderer(this.pixi, this.map);
    this.renderer.setDebug(true);
    this.renderer.setShowFlows(false);

    this.overlays = new CityOverlays(this.map, this.renderer);
    this.createUi();
    this.attachResizeHandling();
    this.attachInput();
    this.simulation.onMessage((message) => this.handleWorkerMessage(message));
    this.simulation.start(this.currentSeed);
    this.simulation.setSpeed(this.speed);
  }

  private async initPixi(): Promise<void> {
    await this.pixi.init({
      width: Math.max(1, Math.round(this.mapStage.clientWidth)),
      height: Math.max(1, Math.round(this.mapStage.clientHeight)),
      backgroundColor: 0xd9cfb4,
      antialias: true,
      preference: 'webgl',
      resolution: Math.min(window.devicePixelRatio, 2),
      autoDensity: true,
    });
    this.mapStage.appendChild(this.pixi.canvas);
  }

  private createUi(): void {
    this.hud = new Hud(this.speed, {
      onSpeed: (speed) => this.setSpeed(speed),
      onPauseToggle: () => this.setPaused(!this.paused),
      onHistoryStep: (delta) => this.stepHistory(delta),
      onReset: () => this.reset(),
      onDiagnosticsToggle: () => this.setDiagnostics(!this.diagnosticsEnabled),
    });
    this.probe = new FrontProbe();
    this.diagnosticsPanel = new DiagnosticsPanel();
    this.sidePanel.append(this.hud.element, this.hud.legend, this.probe.element, this.diagnosticsPanel.element);
  }

  private attachResizeHandling(): void {
    const resize = () => {
      const { width, height } = this.mapStage.getBoundingClientRect();
      this.pixi.renderer.resize(Math.max(1, Math.round(width)), Math.max(1, Math.round(height)));
      this.renderer.resize();
      if (this.latestSnapshot) this.overlays.update(this.latestSnapshot);
    };
    new ResizeObserver(resize).observe(this.mapStage);
    window.addEventListener('resize', resize);
    resize();
  }

  private attachInput(): void {
    this.input = new InputController(this.pixi.canvas, {
      onPrimaryClick: (event) => this.handlePrimaryClick(event),
      onSecondaryClick: (event, force) => this.handleSecondaryCityClick(event, force),
      onPauseToggle: () => this.setPaused(!this.paused),
      onDiagnosticsToggle: () => this.setDiagnostics(!this.diagnosticsEnabled),
      onHistoryStep: (delta) => this.stepHistory(delta),
      onSpeedStep: (delta) => this.stepSpeed(delta),
      onSpeed: (speed) => this.setSpeed(speed),
    });
    this.input.attach();
  }

  private setSpeed(next: Speed): void {
    this.speed = next;
    this.simulation.setSpeed(next);
    this.hud.setSpeed(next);
  }

  private setPaused(next: boolean): void {
    this.paused = next;
    this.hud.setPaused(next);
    this.simulation.setPaused(next);
  }

  private setDiagnostics(next: boolean): void {
    this.diagnosticsEnabled = next;
    this.hud.setDiagnostics(next);
    this.diagnosticsPanel.setVisible(next);
    this.renderer.setShowFlows(next);
    this.renderDiagnostics();
    if (!next) {
      this.selectedProbe = null;
      this.probe.render(null);
    }
  }

  private renderDiagnostics(): void {
    const rows = this.diagnosticsEnabled && this.latestSnapshot
      ? buildCityDiagnostics(this.latestSnapshot)
      : null;
    this.diagnosticsPanel.render(rows, this.diagnosticsEnabled);
  }

  private stepHistory(delta: -1 | 1): void {
    if (this.latestHistory && ((delta < 0 && !this.latestHistory.canRewind) || (delta > 0 && !this.latestHistory.canForward))) return;
    this.setPaused(true);
    this.simulation.stepHistory(delta);
  }

  private stepSpeed(delta: -1 | 1): void {
    const index = SPEEDS.indexOf(this.speed);
    const nextIndex = Math.max(0, Math.min(SPEEDS.length - 1, index + delta));
    this.setSpeed(SPEEDS[nextIndex]);
  }

  private reset(): void {
    this.setPaused(true);
    const confirmed = window.confirm('Start a new game? This clears the current rewind history.');
    if (confirmed) {
      this.currentSeed = (this.currentSeed + 104729) >>> 0;
      this.hud.setStatus(`seed ${this.currentSeed} · starting…`);
      this.simulation.reset(this.currentSeed);
    }
    this.setPaused(false);
  }

  private handlePrimaryClick(event: MouseEvent): void {
    if (Date.now() < this.suppressNextPrimaryClickUntil || event.ctrlKey || event.button !== 0) return;
    const cityId = this.renderer.cityIdAtClientPoint(event.clientX, event.clientY);
    if (cityId) {
      this.simulation.toggleCity(cityId);
      return;
    }
    if (!this.diagnosticsEnabled || !this.latestSnapshot) return;
    this.selectedProbe = this.renderer.inspectFrontAtClientPoint(this.latestSnapshot, event.clientX, event.clientY);
    this.probe.render(this.selectedProbe);
  }

  private handleSecondaryCityClick(event: MouseEvent | PointerEvent, force = false): void {
    const secondary = force || event.button === 2 || (event.button === 0 && event.ctrlKey);
    if (!secondary) return;
    const cityId = this.renderer.cityIdAtClientPoint(event.clientX, event.clientY);
    if (!cityId) return;
    event.preventDefault();
    event.stopPropagation();
    this.suppressNextPrimaryClickUntil = Date.now() + 500;
    if (this.lastCityFlipId === cityId && Date.now() - this.lastCityFlipAt < 250) return;
    this.lastCityFlipId = cityId;
    this.lastCityFlipAt = Date.now();
    this.simulation.flipCityOwner(cityId);
  }

  private handleWorkerMessage(message: WorkerOutMessage): void {
    if (message.type === 'ready') {
      this.currentSeed = message.seed;
      this.hud.setStatus(`seed ${message.seed} · ready`);
      return;
    }
    if (message.type !== 'snapshot') return;

    this.latestSnapshot = message.snapshot;
    this.latestHistory = message.history;
    this.hud.setHistory(message.history);
    this.renderer.render(message.snapshot);
    this.overlays.update(message.snapshot);
    this.renderDiagnostics();

    if (this.selectedProbe) {
      this.selectedProbe = this.renderer.inspectFrontAtWorldPoint(message.snapshot, this.selectedProbe);
      this.probe.render(this.selectedProbe);
    }

    const minutes = Math.floor(message.snapshot.gameTime / 60);
    const seconds = Math.floor(message.snapshot.gameTime % 60).toString().padStart(2, '0');
    this.hud.setStatus(`${minutes}:${seconds}`);
  }
}
