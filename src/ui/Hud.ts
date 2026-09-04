import { SPEEDS, type Side, type Speed } from '../sim/Config';
import type { HistoryInfo } from '../sim/types';

function usesTouchControls(): boolean {
  return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
}

export interface HudHandlers {
  onSpeed(speed: Speed): void;
  onPauseToggle(): void;
  onHistoryStep(delta: -1 | 1): void;
  onReset(): void;
  onDiagnosticsToggle(): void;
  onAbout(): void;
}

export class Hud {
  readonly element: HTMLDivElement;
  readonly legend: HTMLDetailsElement;
  private readonly time: HTMLSpanElement;
  private readonly status: HTMLSpanElement;
  private readonly guerrillaStatus: HTMLDivElement;
  private readonly historyStatus: HTMLSpanElement;
  private readonly pauseButton: HTMLButtonElement;
  private readonly debugButton: HTMLButtonElement;
  private readonly historyBackButton: HTMLButtonElement;
  private readonly historyForwardButton: HTMLButtonElement;

  constructor(
    title: string,
    modeName: string,
    interactionNoteClick: string,
    interactionNoteTouch: string,
    initialSpeed: Speed,
    handlers: HudHandlers,
  ) {
    this.element = document.createElement('div');
    this.element.className = 'hud';
    this.element.innerHTML = `
      <div class="hud-title-row">
        <strong>${title}</strong>
      </div>
      <button type="button" id="about" class="hud-about" title="About Living War Atlas" aria-label="About Living War Atlas">i</button>
      <span class="mode-name">${modeName}</span>
      <div class="time-row"><span id="time">0:00</span><span id="status" hidden></span></div>
      <div id="guerrilla-status" class="guerrilla-status" hidden>
        ${(['blue', 'red'] as const).map((side) => `
          <div class="guerrilla-row ${side}">
            <div class="guerrilla-label"><span>${side}</span><span data-guerrilla-value="${side}">0</span></div>
            <div class="guerrilla-track">
              <div class="guerrilla-fill" data-guerrilla-fill="${side}"></div>
              <i style="left:33.333%"></i><i style="left:66.667%"></i><i style="left:100%"></i>
            </div>
            <div class="guerrilla-threshold-labels"><span>1</span><span>2</span><span>3</span></div>
          </div>
        `).join('')}
      </div>
      <span id="history-status">history --/--</span>
      <div class="speed-row">
        ${SPEEDS.map((speed) => `<button data-speed="${speed}" class="${speed === initialSpeed ? 'active' : ''}" title="Set simulation speed to ${speed}×">${speed}×</button>`).join('')}
      </div>
      <div class="transport-row">
        <button id="history-back" disabled title="Back 5 seconds">-5s</button>
        <button id="pause" title="Pause or resume simulation">Pause</button>
        <button id="history-forward" disabled title="Forward 5 seconds">+5s</button>
      </div>
      <div class="action-row">
        <button id="reset" title="Choose a game mode and map">New game</button>
        <button id="debug" title="Show debug overlays and diagnostics">Debug</button>
      </div>
    `;

    this.time = this.element.querySelector('#time')!;
    this.status = this.element.querySelector('#status')!;
    this.guerrillaStatus = this.element.querySelector('#guerrilla-status')!;
    this.historyStatus = this.element.querySelector('#history-status')!;
    this.pauseButton = this.element.querySelector('#pause')!;
    this.debugButton = this.element.querySelector('#debug')!;
    this.historyBackButton = this.element.querySelector('#history-back')!;
    this.historyForwardButton = this.element.querySelector('#history-forward')!;

    this.element.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((button) => {
      button.addEventListener('click', () => handlers.onSpeed(Number(button.dataset.speed) as Speed));
    });
    this.pauseButton.addEventListener('click', handlers.onPauseToggle);
    this.historyBackButton.addEventListener('click', () => handlers.onHistoryStep(-1));
    this.historyForwardButton.addEventListener('click', () => handlers.onHistoryStep(1));
    this.element.querySelector<HTMLButtonElement>('#reset')!.addEventListener('click', handlers.onReset);
    this.debugButton.addEventListener('click', handlers.onDiagnosticsToggle);
    this.element.querySelector<HTMLButtonElement>('#about')!.addEventListener('click', handlers.onAbout);

    const interactionNote = usesTouchControls()
      ? interactionNoteTouch
      : interactionNoteClick + '<br>Space: pause · ←/→: rewind · ↑/↓: speed';

    this.legend = document.createElement('details');
    this.legend.className = 'legend';
    this.legend.open = true;
    this.legend.innerHTML = `
      <summary>MAP LEGEND</summary>
      <div class="legend-grid">
        <span class="legend-mark front-line"></span><span>front line</span>
        <span class="legend-mark force-mark"></span><span>force</span>
        <span class="legend-mark old-border"></span><span>prewar border</span>
        <span class="legend-mark recent-capture-mark"></span><span>recently captured</span>
        <span class="legend-mark blue-flow debug-only"></span><span class="debug-only">Blue flow arrows</span>
        <span class="legend-mark red-flow debug-only"></span><span class="debug-only">Red flow arrows</span>
        <span class="legend-mark city-pair"></span><span>city</span>
        <span class="legend-mark river-mark"></span><span>river</span>
        <span class="legend-mark forest-mark"></span><span>forest</span>
        <span class="legend-mark stress-mark debug-only"></span><span class="debug-only">front instability</span>
      </div>
      <div class="legend-note">${interactionNote}</div>
    `;
  }

  setTime(text: string): void {
    this.time.textContent = text;
  }

  setStatus(text: string | null): void {
    this.status.textContent = text ?? '';
    this.status.hidden = text === null;
  }

  setGuerrillaPoints(points: Record<Side, number> | null, maxPoints = 300): void {
    this.guerrillaStatus.hidden = points === null;
    if (!points) return;

    for (const side of ['blue', 'red'] as const) {
      const value = Math.max(0, Math.min(maxPoints, points[side]));
      const valueElement = this.guerrillaStatus.querySelector<HTMLElement>(`[data-guerrilla-value="${side}"]`)!;
      const fill = this.guerrillaStatus.querySelector<HTMLElement>(`[data-guerrilla-fill="${side}"]`)!;
      valueElement.textContent = `${Math.floor(value)} / ${maxPoints}`;
      fill.style.width = `${(value / maxPoints) * 100}%`;
    }
  }

  setSpeed(speed: Speed): void {
    this.element.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((button) => {
      button.classList.toggle('active', Number(button.dataset.speed) === speed);
    });
  }

  setPaused(paused: boolean): void {
    this.pauseButton.textContent = paused ? 'Resume' : 'Pause';
    this.pauseButton.title = paused ? 'Resume simulation' : 'Pause simulation';
    this.pauseButton.classList.toggle('active', paused);
  }

  setFinished(finished: boolean): void {
    this.pauseButton.disabled = finished;
  }

  setDiagnostics(enabled: boolean): void {
    this.debugButton.textContent = enabled ? 'Debug on' : 'Debug';
    this.debugButton.title = enabled
      ? 'Hide debug overlays and diagnostics'
      : 'Show debug overlays and diagnostics';
    this.debugButton.classList.toggle('active', enabled);
  }

  setHistory(history: HistoryInfo): void {
    this.historyBackButton.disabled = !history.canRewind;
    this.historyForwardButton.disabled = !history.canForward;
    this.historyStatus.textContent = history.length > 0
      ? `history ${history.currentIndex + 1}/${history.length}`
      : 'history --/--';
    this.historyBackButton.title = history.length > 0
      ? `Back ${history.intervalSeconds}s (${history.currentIndex + 1}/${history.length})`
      : 'No saved states yet';
    this.historyForwardButton.title = history.length > 0
      ? `Forward ${history.intervalSeconds}s (${history.currentIndex + 1}/${history.length})`
      : 'No saved states yet';
  }
}
