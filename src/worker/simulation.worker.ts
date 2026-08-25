/// <reference lib="webworker" />

import type { Side, Speed } from '../sim/Config';
import { clearPotential, winnerFromState } from '../sim/completion';
import { forceCityEnclave } from '../sim/DebugActions';
import { Simulation } from '../sim/Simulation';
import type { MapDefinition, MapId, SimulationState, WorkerInMessage, WorkerOutMessage } from '../sim/types';
import { getMapDefinition } from '../map/maps';
import { HistoryManager } from './HistoryManager';
import { HistoryStorage } from './HistoryStorage';

let sim: Simulation | null = null;
let speed: Speed = 1;
let paused = false;
let seed = 1;
let mapId: MapId = 'theatre';
let timer: ReturnType<typeof setInterval> | null = null;
let launchToken = 0;

const history = new HistoryManager(new HistoryStorage());

function post(message: WorkerOutMessage): void {
  self.postMessage(message);
}

function currentWinner() {
  if (!sim) return null;
  return winnerFromState(sim.control, sim.terrainBlocked, sim.cities, sim.sides);
}

function postSnapshot(): void {
  if (!sim) return;
  post({ type: 'snapshot', snapshot: sim.snapshot(), history: history.info(sim.gameTime), winner: currentWinner() });
}

function saveHistoryCheckpoint(force = false): void {
  if (!sim) return;
  history.checkpoint(sim.saveState(), seed, force);
}

function isStateCompatible(state: SimulationState, map: MapDefinition): boolean {
  return state.width === map.width
    && state.height === map.height
    && state.cities.length === map.cities.length
    && state.cities.every((city, index) => city.id === map.cities[index]?.id);
}

function finishIfDecided(): boolean {
  const winner = currentWinner();
  if (!sim || !winner) return false;
  clearPotential(sim.sides);
  paused = true;
  saveHistoryCheckpoint(true);
  return true;
}

function seededIndex(value: number, count: number): number {
  let x = value >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return (x >>> 0) % count;
}

function seedInitialEnclaves(simulation: Simulation, map: MapDefinition, simulationSeed: number): void {
  const sides: readonly Side[] = ['blue', 'red'];
  for (let sideIndex = 0; sideIndex < sides.length; sideIndex++) {
    const side = sides[sideIndex];
    const candidates = map.cities.filter((city) => city.owner === side && city.baseProduction === 2);
    if (candidates.length === 0) continue;
    const index = seededIndex(simulationSeed ^ Math.imul(0x9e3779b9, sideIndex + 1), candidates.length);
    forceCityEnclave(simulation, candidates[index].id);
  }
}

async function createSimulation(nextMapId: MapId, nextSeed: number, loadSavedState: boolean): Promise<void> {
  const token = ++launchToken;
  const fallbackSeed = nextSeed >>> 0 || 1;
  const map = getMapDefinition(nextMapId);
  mapId = nextMapId;

  if (loadSavedState) {
    try {
      const persisted = await history.load();
      if (token !== launchToken) return;
      const savedState = history.currentState();
      if (persisted && savedState && isStateCompatible(savedState, map)) {
        seed = persisted.seed >>> 0 || fallbackSeed;
        sim = new Simulation(map, seed);
        sim.restoreState(savedState);
        if (persisted.nextHistoryTime <= sim.gameTime) history.scheduleNext(sim.gameTime);
        if (currentWinner()) {
          clearPotential(sim.sides);
          paused = true;
        }
        post({ type: 'ready', seed, mapId });
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
  sim = new Simulation(map, seed);
  if (nextMapId === 'theatre') seedInitialEnclaves(sim, map, seed);
  paused = false;
  history.reset(sim.gameTime);
  saveHistoryCheckpoint(true);
  post({ type: 'ready', seed, mapId });
  postSnapshot();
}

function ensureLoop(): void {
  if (timer) return;
  timer = setInterval(() => {
    if (!sim || paused) return;
    for (let i = 0; i < speed; i++) {
      sim.tick();
      saveHistoryCheckpoint();
      if (finishIfDecided()) break;
    }
    postSnapshot();
  }, 100);
}

self.onmessage = (event: MessageEvent<WorkerInMessage>) => {
  const message = event.data;
  switch (message.type) {
    case 'start':
      void createSimulation(message.mapId, message.seed, message.loadSavedState);
      ensureLoop();
      break;
    case 'speed':
      speed = message.speed;
      break;
    case 'reset':
      void createSimulation(message.mapId, message.seed, false);
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
