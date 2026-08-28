import type { HistoryInfo, SimulationState } from '../sim/types';
import { HistoryStorage, type PersistedHistory } from './HistoryStorage';

const EPS = 1e-6;
export const HISTORY_INTERVAL_SECONDS = 5;
export const MAX_HISTORY_CHECKPOINTS = 120;

export interface RecentCaptures {
  time: Float32Array;
  side: Int8Array;
}

export class HistoryManager {
  private history: SimulationState[] = [];
  private historyIndex = -1;
  private nextHistoryTime = 0;
  private trackedControl: Float32Array | null = null;
  private trackedTime = -Infinity;
  private captureTime = new Float32Array(0);
  private captureSide = new Int8Array(0);

  constructor(private readonly storage: HistoryStorage) {}

  async load(): Promise<PersistedHistory | null> {
    const persisted = await this.storage.load();
    if (!persisted || persisted.history.length === 0) return null;
    const dropped = Math.max(0, persisted.history.length - MAX_HISTORY_CHECKPOINTS);
    this.history = persisted.history.slice(dropped);
    this.historyIndex = Math.max(0, Math.min(this.history.length - 1, persisted.historyIndex - dropped));
    this.nextHistoryTime = persisted.nextHistoryTime;
    this.resetCaptureTracking();
    return { ...persisted, history: this.history, historyIndex: this.historyIndex };
  }

  reset(gameTime: number): void {
    this.history = [];
    this.historyIndex = -1;
    this.scheduleNext(gameTime);
    this.resetCaptureTracking();
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

  recentCaptures(control: Float32Array, currentTime: number, maxAgeSeconds: number): RecentCaptures {
    if (!this.trackedControl || this.trackedControl.length !== control.length) {
      this.initializeCaptureTracking(control, currentTime);
      return { time: this.captureTime, side: this.captureSide };
    }

    if (currentTime + EPS < this.trackedTime) {
      this.rebuildCaptureTracking(control.length, currentTime, maxAgeSeconds);
    }

    const trackedControl = this.trackedControl;
    if (!trackedControl || trackedControl.length !== control.length) {
      this.initializeCaptureTracking(control, currentTime);
      return { time: this.captureTime, side: this.captureSide };
    }

    this.recordCrossings(trackedControl, control, currentTime);
    trackedControl.set(control);
    this.trackedTime = currentTime;
    return { time: this.captureTime, side: this.captureSide };
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

  private resetCaptureTracking(): void {
    this.trackedControl = null;
    this.trackedTime = -Infinity;
    this.captureTime = new Float32Array(0);
    this.captureSide = new Int8Array(0);
  }

  private initializeCaptureTracking(control: Float32Array, currentTime: number): void {
    this.trackedControl = control.slice();
    this.trackedTime = currentTime;
    this.captureTime = new Float32Array(control.length);
    this.captureTime.fill(Number.NEGATIVE_INFINITY);
    this.captureSide = new Int8Array(control.length);
  }

  private rebuildCaptureTracking(size: number, currentTime: number, maxAgeSeconds: number): void {
    this.captureTime = new Float32Array(size);
    this.captureTime.fill(Number.NEGATIVE_INFINITY);
    this.captureSide = new Int8Array(size);

    const firstRelevantTime = currentTime - maxAgeSeconds;
    let start = 0;
    while (start + 1 <= this.historyIndex && this.history[start + 1].gameTime < firstRelevantTime) start += 1;

    let previous = this.history[start]?.control ?? null;
    if (previous) {
      for (let index = start + 1; index <= this.historyIndex; index++) {
        const state = this.history[index];
        if (state.gameTime > currentTime + EPS) break;
        this.recordCrossings(previous, state.control, state.gameTime);
        previous = state.control;
      }
      this.trackedControl = previous.slice();
    } else {
      this.trackedControl = null;
    }
    this.trackedTime = currentTime;
  }

  private recordCrossings(before: Float32Array, after: Float32Array, time: number): void {
    const size = Math.min(before.length, after.length, this.captureTime.length);
    for (let i = 0; i < size; i++) {
      const crossed = (before[i] < 0 && after[i] >= 0) || (before[i] >= 0 && after[i] < 0);
      if (!crossed) continue;
      this.captureTime[i] = time;
      this.captureSide[i] = after[i] >= 0 ? 1 : -1;
    }
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
