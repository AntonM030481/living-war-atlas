import type { Application } from 'pixi.js';
import type { SimulationSnapshot, WorkerPerformanceStats } from '../sim/types';

interface MemoryPerformance extends Performance {
  memory?: {
    usedJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
}

function fmt(value: number, digits = 1): string {
  return Number.isFinite(value) ? value.toFixed(digits) : '-';
}

function megabytes(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(0);
}

export class PerformancePanel {
  readonly element: HTMLDetailsElement;
  private readonly content: HTMLDivElement;

  private fps = 0;
  private frameMs = 0;
  private maxFrameMs = 0;
  private simTickMs = 0;
  private ticksPerSecond = 0;
  private renderMs = 0;
  private frontCells = 0;

  private lastFrameAt = 0;
  private sampleStartedAt = performance.now();
  private sampleFrames = 0;
  private sampleFrameMs = 0;
  private sampleMaxFrameMs = 0;

  constructor(
    private readonly pixi: Application,
    private readonly cells: number,
  ) {
    this.element = document.createElement('details');
    this.element.className = 'diagnostics-panel performance-panel';
    this.element.hidden = true;
    this.element.open = true;

    const summary = document.createElement('summary');
    summary.innerHTML = '<b>PERFORMANCE</b>';
    this.content = document.createElement('div');
    this.element.append(summary, this.content);

    this.render();
    requestAnimationFrame((now) => this.onFrame(now));
  }

  setVisible(visible: boolean): void {
    this.element.hidden = !visible;
    if (visible) this.render();
  }

  recordSnapshot(
    snapshot: SimulationSnapshot,
    worker: WorkerPerformanceStats,
    renderMs: number,
  ): void {
    this.simTickMs = worker.simTickMs;
    this.ticksPerSecond = worker.ticksPerSecond;
    this.renderMs = renderMs;
    this.frontCells = snapshot.stats.frontCells;
  }

  private onFrame(now: number): void {
    if (this.lastFrameAt > 0) {
      const elapsed = now - this.lastFrameAt;
      this.sampleFrames++;
      this.sampleFrameMs += elapsed;
      this.sampleMaxFrameMs = Math.max(this.sampleMaxFrameMs, elapsed);
    }
    this.lastFrameAt = now;

    const sampleElapsed = now - this.sampleStartedAt;
    if (sampleElapsed >= 1000 && this.sampleFrames > 0) {
      this.fps = (this.sampleFrames * 1000) / sampleElapsed;
      this.frameMs = this.sampleFrameMs / this.sampleFrames;
      this.maxFrameMs = this.sampleMaxFrameMs;

      this.sampleStartedAt = now;
      this.sampleFrames = 0;
      this.sampleFrameMs = 0;
      this.sampleMaxFrameMs = 0;

      if (!this.element.hidden) this.render();
    }

    requestAnimationFrame((next) => this.onFrame(next));
  }

  private render(): void {
    const canvas = this.pixi.canvas;
    const renderer = this.pixi.renderer as typeof this.pixi.renderer & { resolution?: number };
    const rendererName = renderer.constructor.name.replace(/Renderer$/, '') || 'unknown';
    const resolution = renderer.resolution ?? 1;
    const memory = (performance as MemoryPerformance).memory;
    const heap = memory
      ? `${megabytes(memory.usedJSHeapSize)} / ${megabytes(memory.jsHeapSizeLimit)} MB`
      : 'n/a';

    this.content.innerHTML = `
      <table class="diagnostics-table performance-table">
        <tbody>
          <tr><th>FPS</th><td>${fmt(this.fps)} &nbsp; ${fmt(this.frameMs)} ms</td></tr>
          <tr><th>Frame max</th><td>${fmt(this.maxFrameMs)} ms</td></tr>
          <tr><th>Simulation</th><td>${fmt(this.simTickMs, 2)} ms/tick &nbsp; ${fmt(this.ticksPerSecond)} ticks/s</td></tr>
          <tr><th>Render</th><td>${fmt(this.renderMs, 2)} ms</td></tr>
          <tr><th>Cells</th><td>${this.cells.toLocaleString()} &nbsp; front ${this.frontCells.toLocaleString()}</td></tr>
          <tr><th>Renderer</th><td>${rendererName}</td></tr>
          <tr><th>Buffer</th><td>${canvas.width}×${canvas.height} @${fmt(resolution)}x &nbsp; DPR ${fmt(window.devicePixelRatio)}</td></tr>
          <tr><th>Heap</th><td>${heap}</td></tr>
        </tbody>
      </table>
    `;
  }
}
