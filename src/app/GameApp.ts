import { Application } from 'pixi.js';
import {
  getGameModeOption,
  type GameAction,
  type GameModeId,
  type GameModeView,
} from '../game/GameMode';
import { SPEEDS, type Side, type Speed } from '../sim/Config';
import type { HistoryInfo, MapDefinition, MapId, SimulationSnapshot, WorkerOutMessage } from '../sim/types';
import { AtlasRenderer } from '../rendering/AtlasRenderer';
import { buildCityDiagnostics } from '../diagnostics/CityDiagnostics';
import { inspectPoint } from '../diagnostics/PointInspector';
import type { FrontDebugInfo, PointDebugInfo } from '../diagnostics/types';
import { getMapOption } from '../map/maps';
import { CityOverlays } from '../ui/CityOverlays';
import { DiagnosticsPanel } from '../ui/DiagnosticsPanel';
import { FrontProbe } from '../ui/FrontProbe';
import { Hud } from '../ui/Hud';
import { PointProbe } from '../ui/PointProbe';
import { InputController } from './InputController';
import { SimulationClient } from './SimulationClient';

interface NewGameSelection {
  modeId: GameModeId;
  mapId: MapId;
}

export class GameApp {
  private readonly pixi = new Application();
  private readonly simulation = new SimulationClient();
  private renderer!: AtlasRenderer;
  private overlays!: CityOverlays;
  private hud!: Hud;
  private probe!: FrontProbe;
  private pointProbe!: PointProbe;
  private diagnosticsPanel!: DiagnosticsPanel;
  private input!: InputController;
  private readonly mapStage = document.createElement('div');
  private readonly sidePanel = document.createElement('div');
  private readonly pointMarker = document.createElement('div');

  private currentSeed = 20260816;
  private speed: Speed = 2;
  private paused = false;
  private finished = false;
  private diagnosticsEnabled = false;
  private latestSnapshot: SimulationSnapshot | null = null;
  private latestHistory: HistoryInfo | null = null;
  private latestActions: readonly GameAction[] = [];
  private selectedProbe: FrontDebugInfo | null = null;
  private selectedPoint: PointDebugInfo | null = null;
  private suppressNextPrimaryClickUntil = 0;
  private lastCityFlipAt = 0;
  private lastCityFlipId: string | null = null;

  constructor(
    private readonly root: HTMLDivElement,
    private readonly modeId: GameModeId,
    private readonly mapId: MapId,
    private readonly map: MapDefinition,
    private readonly chooseNewGame: (
      currentModeId: GameModeId,
      currentMapId: MapId,
    ) => Promise<NewGameSelection | null>,
  ) {}

  async start(): Promise<void> {
    this.mapStage.className = 'map-stage';
    this.sidePanel.className = 'side-panel';
    this.pointMarker.className = 'point-probe-marker';
    this.pointMarker.hidden = true;
    this.root.append(this.mapStage, this.sidePanel);

    await this.initPixi();
    this.mapStage.append(this.pointMarker);
    this.renderer = new AtlasRenderer(this.pixi, this.map);
    this.renderer.setDebug(false);
    this.renderer.setShowFlows(false);

    this.overlays = new CityOverlays(this.map, this.renderer, this.mapStage);
    this.createUi();
    this.attachResizeHandling();
    this.attachInput();
    this.simulation.onMessage((message) => this.handleWorkerMessage(message));
    this.simulation.start(this.mapId, this.modeId, this.currentSeed);
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
    const mode = getGameModeOption(this.modeId);
    this.hud = new Hud(
      getMapOption(this.mapId).name,
      mode.name,
      mode.interactionNote,
      this.speed,
      {
        onSpeed: (speed) => this.setSpeed(speed),
        onPauseToggle: () => {
          if (!this.finished) this.setPaused(!this.paused);
        },
        onHistoryStep: (delta) => this.stepHistory(delta),
        onReset: () => void this.reset(),
        onDiagnosticsToggle: () => this.setDiagnostics(!this.diagnosticsEnabled),
      },
    );
    this.pointProbe = new PointProbe();
    this.probe = new FrontProbe();
    this.diagnosticsPanel = new DiagnosticsPanel();
    this.sidePanel.append(
      this.hud.element,
      this.hud.legend,
      this.pointProbe.element,
      this.probe.element,
      this.diagnosticsPanel.element,
    );
  }

  private attachResizeHandling(): void {
    const resize = () => {
      const { width, height } = this.mapStage.getBoundingClientRect();
      this.pixi.renderer.resize(Math.max(1, Math.round(width)), Math.max(1, Math.round(height)));
      this.renderer.resize();
      if (this.latestSnapshot) {
        this.overlays.update(this.latestSnapshot, this.modeId, this.latestActions);
      }
      this.updatePointMarker();
    };
    new ResizeObserver(resize).observe(this.mapStage);
    window.addEventListener('resize', resize);
    resize();
  }

  private attachInput(): void {
    this.input = new InputController(this.pixi.canvas, {
      onPrimaryClick: (event) => this.handlePrimaryClick(event),
      onPrimaryDrag: (event) => this.handlePrimaryDrag(event),
      onSecondaryClick: (event, force) => this.handleSecondaryCityClick(event, force),
      onPauseToggle: () => {
        if (!this.finished) this.setPaused(!this.paused);
      },
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

  private setCompletion(winner: Side | null): void {
    this.finished = winner !== null;
    if (this.finished) {
      this.paused = true;
      this.hud.setPaused(true);
    }
    this.hud.setFinished(this.finished);
    this.hud.setStatus(winner ? `${winner[0].toUpperCase()}${winner.slice(1)} wins` : null);
  }

  private setDiagnostics(next: boolean): void {
    this.diagnosticsEnabled = next;
    this.hud.setDiagnostics(next);
    this.diagnosticsPanel.setVisible(next);
    if (next) {
      this.hud.legend.open = false;
      this.diagnosticsPanel.element.open = false;
    }
    this.renderer.setDebug(next);
    this.renderer.setShowFlows(false);
    this.renderDiagnostics();
    this.updatePointMarker();
  }

  private renderDiagnostics(): void {
    const rows = this.diagnosticsEnabled && this.latestSnapshot
      ? buildCityDiagnostics(this.latestSnapshot)
      : null;
    this.diagnosticsPanel.render(rows, this.diagnosticsEnabled);
  }

  private stepHistory(delta: -1 | 1): void {
    if (
      this.latestHistory
      && ((delta < 0 && !this.latestHistory.canRewind) || (delta > 0 && !this.latestHistory.canForward))
    ) return;
    this.setPaused(true);
    this.simulation.stepHistory(delta);
  }

  private stepSpeed(delta: -1 | 1): void {
    const index = SPEEDS.indexOf(this.speed);
    const nextIndex = Math.max(0, Math.min(SPEEDS.length - 1, index + delta));
    this.setSpeed(SPEEDS[nextIndex]);
  }

  private async reset(): Promise<void> {
    this.setPaused(true);
    const next = await this.chooseNewGame(this.modeId, this.mapId);
    if (!next) {
      if (!this.finished) this.setPaused(false);
      return;
    }

    if (next.mapId !== this.mapId || next.modeId !== this.modeId) {
      sessionStorage.setItem('living-war-atlas:new-game-map', next.mapId);
      sessionStorage.setItem('living-war-atlas:new-game-mode', next.modeId);
      window.location.reload();
      return;
    }

    this.currentSeed = (this.currentSeed + 104729) >>> 0;
    this.finished = false;
    this.hud.setFinished(false);
    this.hud.setStatus(null);
    this.simulation.reset(this.mapId, this.modeId, this.currentSeed);
    this.setPaused(false);
  }

  private handlePrimaryClick(event: MouseEvent): void {
    if (Date.now() < this.suppressNextPrimaryClickUntil || event.ctrlKey || event.button !== 0) return;

    if (this.diagnosticsEnabled && this.latestSnapshot) {
      this.setPointProbeAtClient(event.clientX, event.clientY);
    }

    const cityId = this.renderer.cityIdAtClientPoint(event.clientX, event.clientY);
    const cityAction = cityId ? this.primaryActionForCity(cityId) : null;
    if (cityAction) {
      this.simulation.applyGameAction(cityAction);
      return;
    }

    const regionAction = this.primaryActionForRegion(event.clientX, event.clientY);
    if (regionAction) {
      this.simulation.applyGameAction(regionAction);
      return;
    }

    if (!this.diagnosticsEnabled || !this.latestSnapshot) return;
    this.setFrontProbeAtClient(event.clientX, event.clientY);
  }

  private primaryActionForCity(cityId: string): GameAction | null {
    if (this.modeId === 'sandbox') {
      return this.latestActions.find(
        (action) => action.type === 'sandboxToggleCity' && action.cityId === cityId,
      ) ?? null;
    }
    if (this.modeId === 'partisan') {
      return this.latestActions.find(
        (action) => action.type === 'partisanCaptureSource' && action.cityId === cityId,
      ) ?? null;
    }
    return null;
  }

  private primaryActionForRegion(clientX: number, clientY: number): GameAction | null {
    if (this.modeId !== 'conquest' || !this.map.regionAt) return null;
    const point = this.clientToMapPoint(clientX, clientY);
    if (!point) return null;
    const x = Math.max(0, Math.min(this.map.width - 1, Math.floor(point.x)));
    const y = Math.max(0, Math.min(this.map.height - 1, Math.floor(point.y)));
    const regionId = this.map.regionAt(x, y);
    if (!regionId) return null;
    return this.latestActions.find((action) =>
      (action.type === 'conquestActivate' || action.type === 'conquestInvade')
      && action.regionId === regionId,
    ) ?? null;
  }

  private handlePrimaryDrag(event: PointerEvent): void {
    if (!this.diagnosticsEnabled || !this.latestSnapshot || event.ctrlKey) return;
    this.setPointProbeAtClient(event.clientX, event.clientY);
    this.setFrontProbeAtClient(event.clientX, event.clientY);
  }

  private setPointProbeAtClient(clientX: number, clientY: number): void {
    if (!this.latestSnapshot) return;
    const point = this.clientToMapPoint(clientX, clientY);
    if (!point) return;
    this.selectedPoint = inspectPoint(this.latestSnapshot, point.x, point.y);
    this.pointProbe.render(this.selectedPoint);
    this.updatePointMarker();
  }

  private setFrontProbeAtClient(clientX: number, clientY: number): void {
    if (!this.latestSnapshot) return;
    this.selectedProbe = this.renderer.inspectFrontAtClientPoint(this.latestSnapshot, clientX, clientY);
    this.probe.render(this.selectedProbe);
  }

  private updatePointMarker(): void {
    if (!this.diagnosticsEnabled || !this.selectedPoint) {
      this.pointMarker.hidden = true;
      return;
    }
    const mapRect = this.renderer.mapScreenRect();
    const stageRect = this.mapStage.getBoundingClientRect();
    this.pointMarker.style.left = `${mapRect.left - stageRect.left + (this.selectedPoint.x / this.map.width) * mapRect.width}px`;
    this.pointMarker.style.top = `${mapRect.top - stageRect.top + (this.selectedPoint.y / this.map.height) * mapRect.height}px`;
    this.pointMarker.hidden = false;
  }

  private clientToMapPoint(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = this.renderer.mapScreenRect();
    if (clientX < rect.left || clientY < rect.top || clientX >= rect.left + rect.width || clientY >= rect.top + rect.height) {
      return null;
    }
    return {
      x: ((clientX - rect.left) / rect.width) * this.map.width,
      y: ((clientY - rect.top) / rect.height) * this.map.height,
    };
  }

  private handleSecondaryCityClick(event: MouseEvent | PointerEvent, force = false): void {
    if (this.modeId !== 'sandbox' && this.modeId !== 'partisan') return;
    const secondary = force || event.button === 2 || (event.button === 0 && event.ctrlKey);
    if (!secondary) return;
    const cityId = this.renderer.cityIdAtClientPoint(event.clientX, event.clientY);
    if (!cityId) return;
    const action = this.latestActions.find((candidate) => {
      if (this.modeId === 'sandbox') {
        return candidate.type === 'sandboxFlipCity' && candidate.cityId === cityId;
      }
      return candidate.type === 'partisanCaptureSource' && candidate.cityId === cityId;
    });
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    this.suppressNextPrimaryClickUntil = Date.now() + 500;
    if (this.lastCityFlipId === cityId && Date.now() - this.lastCityFlipAt < 250) return;
    this.lastCityFlipId = cityId;
    this.lastCityFlipAt = Date.now();
    this.simulation.applyGameAction(action);
  }

  private handleWorkerMessage(message: WorkerOutMessage): void {
    if (message.type === 'ready') {
      this.currentSeed = message.seed;
      return;
    }
    if (message.type !== 'snapshot') return;

    this.latestSnapshot = message.snapshot;
    this.latestHistory = message.history;
    this.latestActions = message.actions;
    this.hud.setHistory(message.history);
    this.hud.setModeStatus(this.modeStatusText(message.snapshot, message.modeView, message.actions));
    this.renderer.render(message.snapshot);
    this.overlays.update(message.snapshot, this.modeId, message.actions);
    this.renderDiagnostics();

    if (this.selectedPoint) {
      this.selectedPoint = inspectPoint(message.snapshot, this.selectedPoint.x, this.selectedPoint.y);
      this.pointProbe.render(this.selectedPoint);
      this.updatePointMarker();
    }

    if (this.selectedProbe) {
      this.selectedProbe = this.renderer.inspectFrontAtWorldPoint(message.snapshot, this.selectedProbe);
      this.probe.render(this.selectedProbe);
    }

    const minutes = Math.floor(message.snapshot.gameTime / 60);
    const seconds = Math.floor(message.snapshot.gameTime % 60).toString().padStart(2, '0');
    this.hud.setTime(`${minutes}:${seconds}`);
    this.setCompletion(message.winner);
  }

  private modeStatusText(
    snapshot: SimulationSnapshot,
    view: GameModeView,
    actions: readonly GameAction[],
  ): string {
    if (view.mode === 'sandbox') return 'Direct sandbox controls';
    if (view.mode === 'partisan') {
      const remaining = Math.max(0, view.nextActionTime - snapshot.gameTime);
      return remaining <= 1e-6 ? 'Partisan action ready' : `Partisan action in ${Math.ceil(remaining)}s`;
    }
    const activations = actions.filter((action) => action.type === 'conquestActivate').length;
    const invasions = actions.filter((action) => action.type === 'conquestInvade').length;
    if (activations || invasions) return `Available: activate ${activations} · invade ${invasions}`;
    return 'No strategic action available';
  }
}
