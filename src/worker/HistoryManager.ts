import type { HistoryInfo, SimulationState } from '../sim/types';
import { HistoryStorage, type PersistedHistory } from './HistoryStorage';

const EPS = 1e-6;
export const HISTORY_INTERVAL_SECONDS = 5;
export const MAX_HISTORY_CHECKPOINTS = 120;

export class HistoryManager {
  private history: SimulationState[] = [];
  private historyIndex = -1;
  private nextHistoryTime = 0;

  constructor(private readonly storage: HistoryStorage) {}

  async load(): Promise<PersistedHistory | null> {
    const persisted = await this.storage.load();
    if (!persisted || persisted.history.length === 0) return null;
    const dropped = Math.max(0, persisted.history.length - MAX_HISTORY_CHECKPOINTS);
    this.history = persisted.history.slice(dropped);
    this.historyIndex = Math.max(0, Math.min(this.history.length - 1, persisted.historyIndex - dropped));
    this.nextHistoryTime = persisted.nextHistoryTime;
    return { ...persisted, history: this.history, historyIndex: this.historyIndex };
  }

  reset(gameTime: number): void {
    this.history = [];
    this.historyIndex = -1;
    this.scheduleNext(gameTime);
  }

  currentState(): SimulationState | null {
    return this.historyIndex >= 0 ? this.history[this.historyIndex] : null;
  }

  info(currentTime: number): HistoryInfo {
    return {
      currentIndex: this.historyIndex,
      length: this.history.length,
      intervalSeconds: HISTORY_INTERVAL_SECONDS,
      canRewind: this.historyIndex > 0,
      canForward: this.historyIndex >= 0 && this.historyIndex + 1 < this.history.length,
      currentTime,
    };
  }

  checkpoint(state: SimulationState, seed: number, force = false): boolean {
    if (!force && state.gameTime + EPS < this.nextHistoryTime) return false;
    this.truncateFuture();
    const last = this.history[this.history.length - 1];
    if (force && last && Math.abs(last.gameTime - state.gameTime) < EPS) {
      this.history[this.history.length - 1] = state;
    } else {
      this.history.push(state);
    }
    this.historyIndex = this.history.length - 1;
    this.trimOld();
    while (this.nextHistoryTime <= state.gameTime + EPS) {
      this.nextHistoryTime += HISTORY_INTERVAL_SECONDS;
    }
    this.persist(seed);
    return true;
  }

  step(delta: -1 | 1, seed: number): SimulationState | null {
    if (this.history.length === 0) return null;
    this.historyIndex = Math.max(0, Math.min(this.history.length - 1, this.historyIndex + delta));
    const state = this.history[this.historyIndex];
    this.scheduleNext(state.gameTime);
    this.persist(seed);
    return state;
  }

  scheduleNext(fromTime: number): void {
    this.nextHistoryTime = (Math.floor(fromTime / HISTORY_INTERVAL_SECONDS) + 1) * HISTORY_INTERVAL_SECONDS;
  }

  persist(seed: number): void {
    this.storage.schedule({
      seed,
      history: this.history.slice(),
      historyIndex: this.historyIndex,
      nextHistoryTime: this.nextHistoryTime,
    });
  }

  private truncateFuture(): void {
    if (this.historyIndex >= 0 && this.historyIndex + 1 < this.history.length) {
      this.history.length = this.historyIndex + 1;
    }
  }

  private trimOld(): void {
    while (this.history.length > MAX_HISTORY_CHECKPOINTS) {
      this.history.shift();
      this.historyIndex = Math.max(0, this.historyIndex - 1);
    }
  }
}
