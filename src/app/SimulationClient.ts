import type { Speed } from '../sim/Config';
import type { MapId, WorkerInMessage, WorkerOutMessage } from '../sim/types';
import { showAppError } from '../ui/AppError';

const NEW_GAME_MAP_KEY = 'living-war-atlas:new-game-map';
const WORKER_START_TIMEOUT_MS = 15_000;

export class SimulationClient {
  private readonly worker = new Worker(new URL('../worker/simulation.worker.ts', import.meta.url), { type: 'module' });
  private startupTimer: ReturnType<typeof setTimeout> | null = null;
  private workerResponded = false;

  constructor() {
    this.worker.addEventListener('error', (event) => {
      this.clearStartupTimer();
      showAppError(
        'Simulation worker failed',
        event.message || 'The simulation worker could not start.',
      );
    });
    this.worker.addEventListener('messageerror', () => {
      this.clearStartupTimer();
      showAppError(
        'Simulation worker failed',
        'The simulation worker returned a message that could not be decoded.',
      );
    });
  }

  onMessage(handler: (message: WorkerOutMessage) => void): void {
    this.worker.onmessage = (event: MessageEvent<WorkerOutMessage>) => {
      this.workerResponded = true;
      this.clearStartupTimer();
      handler(event.data);
    };
  }

  start(mapId: MapId, seed: number): void {
    this.workerResponded = false;
    this.armStartupTimer();
    const pendingMapId = sessionStorage.getItem(NEW_GAME_MAP_KEY);
    const loadSavedState = pendingMapId !== mapId;
    if (!loadSavedState) sessionStorage.removeItem(NEW_GAME_MAP_KEY);
    this.send({ type: 'start', mapId, seed, loadSavedState });
  }

  setSpeed(speed: Speed): void {
    this.send({ type: 'speed', speed });
  }

  setPaused(paused: boolean): void {
    this.send({ type: 'pause', paused });
  }

  reset(mapId: MapId, seed: number): void {
    this.send({ type: 'reset', mapId, seed });
  }

  toggleCity(cityId: string): void {
    this.send({ type: 'toggleCity', cityId });
  }

  flipCityOwner(cityId: string): void {
    this.send({ type: 'flipCityOwner', cityId });
  }

  stepHistory(delta: -1 | 1): void {
    this.send({ type: 'historyStep', delta });
  }

  private send(message: WorkerInMessage): void {
    this.worker.postMessage(message);
  }

  private armStartupTimer(): void {
    this.clearStartupTimer();
    this.startupTimer = setTimeout(() => {
      this.startupTimer = null;
      if (this.workerResponded) return;
      showAppError(
        'Simulation worker did not start',
        `No response was received from the simulation worker within ${WORKER_START_TIMEOUT_MS / 1000} seconds.`,
      );
    }, WORKER_START_TIMEOUT_MS);
  }

  private clearStartupTimer(): void {
    if (this.startupTimer === null) return;
    clearTimeout(this.startupTimer);
    this.startupTimer = null;
  }
}
