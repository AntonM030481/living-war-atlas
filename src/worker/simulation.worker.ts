/// <reference lib="webworker" />

import type { Speed } from '../sim/Config';
import { forceCityEnclave } from '../sim/DebugActions';
import { Simulation } from '../sim/Simulation';
import type { WorkerInMessage, WorkerOutMessage } from '../sim/types';
import { testMap } from '../map/testMap';
import { HistoryManager } from './HistoryManager';
import { HistoryStorage } from './HistoryStorage';

let sim: Simulation | null = null;
let speed: Speed = 1;
let paused = false;
let seed = 1;
let timer: ReturnType<typeof setInterval> | null = null;
let launchToken = 0;

const history = new HistoryManager(new HistoryStorage());

function post(message: WorkerOutMessage): void {
  self.postMessage(message);
}

function postSnapshot(): void {
  if (!sim) return;
  post({ type: 'snapshot', snapshot: sim.snapshot(), history: history.info(sim.gameTime) });
}

function saveHistoryCheckpoint(force = false): void {
  if (!sim) return;
  history.checkpoint(sim.saveState(), seed, force);
}

async function createSimulation(nextSeed: number, loadSavedState: boolean): Promise<void> {
  const token = ++launchToken;
  const fallbackSeed = nextSeed >>> 0 || 1;

  if (loadSavedState) {
    try {
      const persisted = await history.load();
      if (token !== launchToken) return;
      const savedState = history.currentState();
      if (persisted && savedState) {
        seed = persisted.seed >>> 0 || fallbackSeed;
        sim = new Simulation(testMap, seed);
        sim.restoreState(savedState);
        if (persisted.nextHistoryTime <= sim.gameTime) history.scheduleNext(sim.gameTime);
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
  history.reset(sim.gameTime);
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
      if (sim) forceCityEnclave(sim, message.cityId);
      saveHistoryCheckpoint(true);
      postSnapshot();
      break;
    case 'pause':
      paused = message.paused;
      break;
    case 'historyStep': {
      if (!sim) break;
      const state = history.step(message.delta, seed);
      if (!state) break;
      sim.restoreState(state);
      postSnapshot();
      break;
    }
  }
};
