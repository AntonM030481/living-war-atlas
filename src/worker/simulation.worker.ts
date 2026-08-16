/// <reference lib="webworker" />

import type { Speed } from '../sim/Config';
import { Simulation } from '../sim/Simulation';
import type { HistoryInfo, SimulationState, WorkerInMessage, WorkerOutMessage } from '../sim/types';
import { testMap } from '../map/testMap';

const HISTORY_INTERVAL_SECONDS = 5;
const MAX_HISTORY_CHECKPOINTS = 120;
const EPS = 1e-6;
const DB_NAME = 'living-war-atlas';
const DB_VERSION = 1;
const STATE_STORE = 'simulation-state';
const HISTORY_STATE_KEY = 'history';

interface PersistedHistory {
  key: typeof HISTORY_STATE_KEY;
  seed: number;
  savedAt: number;
  history: SimulationState[];
  historyIndex: number;
  nextHistoryTime: number;
}

let sim: Simulation | null = null;
let speed: Speed = 1;
let paused = false;
let seed = 1;
let timer: ReturnType<typeof setInterval> | null = null;
let history: SimulationState[] = [];
let historyIndex = -1;
let nextHistoryTime = 0;
let dbPromise: Promise<IDBDatabase> | null = null;
let launchToken = 0;
let persistVersion = 0;
let persistQueue: Promise<void> = Promise.resolve();

function post(message: WorkerOutMessage): void {
  self.postMessage(message);
}

function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STATE_STORE, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function loadPersistedHistory(): Promise<PersistedHistory | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STATE_STORE, 'readonly');
    const request = transaction.objectStore(STATE_STORE).get(HISTORY_STATE_KEY);
    request.onsuccess = () => resolve((request.result as PersistedHistory | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

async function writePersistedHistory(record: PersistedHistory, version: number): Promise<void> {
  const db = await openDatabase();
  if (version !== persistVersion) return;
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STATE_STORE, 'readwrite');
    transaction.objectStore(STATE_STORE).put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

function schedulePersistHistory(): void {
  const version = ++persistVersion;
  const record: PersistedHistory = {
    key: HISTORY_STATE_KEY,
    seed,
    savedAt: Date.now(),
    history: history.slice(),
    historyIndex,
    nextHistoryTime,
  };
  persistQueue = persistQueue
    .then(() => writePersistedHistory(record, version))
    .catch((error) => {
      console.warn('Could not persist simulation history', error);
    });
}

function historyInfo(): HistoryInfo {
  return {
    currentIndex: historyIndex,
    length: history.length,
    intervalSeconds: HISTORY_INTERVAL_SECONDS,
    canRewind: historyIndex > 0,
    canForward: historyIndex >= 0 && historyIndex + 1 < history.length,
    currentTime: sim?.gameTime ?? 0,
  };
}

function postSnapshot(): void {
  if (!sim) return;
  post({ type: 'snapshot', snapshot: sim.snapshot(), history: historyInfo() });
}

function truncateFuture(): void {
  if (historyIndex >= 0 && historyIndex + 1 < history.length) {
    history.length = historyIndex + 1;
  }
}

function trimOldHistory(): void {
  while (history.length > MAX_HISTORY_CHECKPOINTS) {
    history.shift();
    historyIndex = Math.max(0, historyIndex - 1);
  }
}

function scheduleNextHistoryTime(fromTime: number): void {
  nextHistoryTime =
    (Math.floor(fromTime / HISTORY_INTERVAL_SECONDS) + 1) * HISTORY_INTERVAL_SECONDS;
}

function saveHistoryCheckpoint(force = false): void {
  if (!sim) return;
  if (!force && sim.gameTime + EPS < nextHistoryTime) return;

  truncateFuture();
  const state = sim.saveState();
  const last = history[history.length - 1];
  if (force && last && Math.abs(last.gameTime - state.gameTime) < EPS) {
    history[history.length - 1] = state;
  } else {
    history.push(state);
  }
  historyIndex = history.length - 1;
  trimOldHistory();

  while (nextHistoryTime <= sim.gameTime + EPS) {
    nextHistoryTime += HISTORY_INTERVAL_SECONDS;
  }

  schedulePersistHistory();
}

async function createSimulation(nextSeed: number, loadSavedState: boolean): Promise<void> {
  const token = ++launchToken;
  const fallbackSeed = nextSeed >>> 0 || 1;
  if (loadSavedState) {
    try {
      const persisted = await loadPersistedHistory();
      if (token !== launchToken) return;
      if (persisted && persisted.history.length > 0) {
        seed = persisted.seed >>> 0 || fallbackSeed;
        const dropped = Math.max(0, persisted.history.length - MAX_HISTORY_CHECKPOINTS);
        history = persisted.history.slice(dropped);
        historyIndex = Math.max(0, Math.min(history.length - 1, persisted.historyIndex - dropped));
        nextHistoryTime = persisted.nextHistoryTime;
        sim = new Simulation(testMap, seed);
        sim.restoreState(history[historyIndex]);
        if (nextHistoryTime <= sim.gameTime + EPS) scheduleNextHistoryTime(sim.gameTime);
        post({ type: 'ready', seed });
        postSnapshot();
        return;
      }
    } catch (error) {
      if (token !== launchToken) return;
      console.warn('Could not restore latest simulation state', error);
    }
  }

  if (token !== launchToken) return;
  seed = fallbackSeed;
  sim = new Simulation(testMap, seed);
  history = [];
  historyIndex = -1;
  scheduleNextHistoryTime(sim.gameTime);
  saveHistoryCheckpoint(true);
  post({ type: 'ready', seed });
  postSnapshot();
}

function ensureLoop(): void {
  if (timer) return;
  timer = setInterval(() => {
    if (!sim || paused) return;
    for (let i = 0; i < speed; i++) {
      sim.tick();
      saveHistoryCheckpoint();
    }
    postSnapshot();
  }, 100);
}

self.onmessage = (event: MessageEvent<WorkerInMessage>) => {
  const message = event.data;
  switch (message.type) {
    case 'start':
      void createSimulation(message.seed, true);
      ensureLoop();
      break;
    case 'speed':
      speed = message.speed;
      break;
    case 'reset':
      void createSimulation(message.seed, false);
      break;
    case 'toggleCity':
      sim?.toggleCityEnabled(message.cityId);
      saveHistoryCheckpoint(true);
      postSnapshot();
      break;
    case 'flipCityOwner':
      sim?.flipCityOwner(message.cityId);
      saveHistoryCheckpoint(true);
      postSnapshot();
      break;
    case 'pause':
      paused = message.paused;
      break;
    case 'historyStep':
      if (!sim) break;
      historyIndex = Math.max(0, Math.min(history.length - 1, historyIndex + message.delta));
      sim.restoreState(history[historyIndex]);
      scheduleNextHistoryTime(sim.gameTime);
      schedulePersistHistory();
      postSnapshot();
      break;
  }
};
