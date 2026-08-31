/// <reference lib="webworker" />

import { createGameModeRuntime, createSimulationForMode, type GameModeId } from '../game/GameMode';
import { GameSession, type GameSessionState } from '../game/GameSession';
import { CFG, type Speed } from '../sim/Config';
import { clearPotential } from '../sim/completion';
import { seedInitialEnclaves } from '../sim/DebugActions';
import type { MapDefinition, MapId, WorkerInMessage, WorkerOutMessage } from '../sim/types';
import { getMapDefinition } from '../map/maps';
import { HistoryManager } from './HistoryManager';
import { HistoryStorage } from './HistoryStorage';

let session: GameSession | null = null;
let speed: Speed = 1;
let paused = false;
let seed = 1;
let mapId: MapId = 'theatre';
let modeId: GameModeId = 'sandbox';
let timer: ReturnType<typeof setInterval> | null = null;
let launchToken = 0;

const history = new HistoryManager(new HistoryStorage());

function post(message: WorkerOutMessage): void {
  self.postMessage(message);
}

function currentWinner() {
  return session?.status().winner ?? null;
}

function postSnapshot(): void {
  if (!session) return;
  const snapshot = session.simulation.snapshot();
  const recentCaptures = history.recentCaptures(snapshot.control, snapshot.gameTime, CFG.recentCaptureFadeSeconds);
  snapshot.recentCaptureTime = recentCaptures.time;
  snapshot.recentCaptureSide = recentCaptures.side;
  post({
    type: 'snapshot',
    snapshot,
    history: history.info(session.simulation.gameTime),
    winner: currentWinner(),
    actions: session.availableActions(),
    modeView: session.view(),
  });
}

function saveHistoryCheckpoint(force = false): void {
  if (!session) return;
  history.checkpoint(session.saveState(), seed, mapId, modeId, force);
}

function isStateCompatible(state: GameSessionState, map: MapDefinition, expectedModeId: GameModeId): boolean {
  const simulation = state.simulation;
  return state.mode.id === expectedModeId
    && simulation.width === map.width
    && simulation.height === map.height
    && simulation.cities.length === map.cities.length
    && simulation.cities.every((city, index) => city.id === map.cities[index]?.id);
}

function finishIfDecided(): boolean {
  const winner = currentWinner();
  if (!session || !winner) return false;
  clearPotential(session.simulation.sides);
  paused = true;
  saveHistoryCheckpoint(true);
  return true;
}

function createFreshSession(map: MapDefinition, nextModeId: GameModeId, nextSeed: number): GameSession {
  const simulation = createSimulationForMode(nextModeId, map, nextSeed);
  const game = new GameSession(simulation, createGameModeRuntime(nextModeId, map, 'blue', nextSeed));
  if (nextModeId === 'sandbox' && mapId === 'theatre') seedInitialEnclaves(simulation, map, nextSeed);
  return game;
}

async function createSession(
  nextMapId: MapId,
  nextModeId: GameModeId,
  nextSeed: number,
  loadSavedState: boolean,
): Promise<void> {
  const token = ++launchToken;
  const fallbackSeed = nextSeed >>> 0 || 1;
  const map = getMapDefinition(nextMapId);
  mapId = nextMapId;
  modeId = nextModeId;

  if (loadSavedState) {
    try {
      const persisted = await history.load();
      if (token !== launchToken) return;
      const savedState = history.currentState();
      if (
        persisted
        && persisted.mapId === nextMapId
        && persisted.modeId === nextModeId
        && savedState
        && isStateCompatible(savedState, map, nextModeId)
      ) {
        seed = persisted.seed >>> 0 || fallbackSeed;
        session = new GameSession(
          createSimulationForMode(nextModeId, map, seed),
          createGameModeRuntime(nextModeId, map, 'blue', seed),
        );
        session.restoreState(savedState);
        if (persisted.nextHistoryTime <= session.simulation.gameTime) {
          history.scheduleNext(session.simulation.gameTime);
        }
        if (currentWinner()) {
          clearPotential(session.simulation.sides);
          paused = true;
        }
        post({ type: 'ready', seed, mapId, modeId });
        postSnapshot();
        return;
      }
    } catch (error) {
      if (token !== launchToken) return;
      console.warn('Could not restore latest game session', error);
    }
  }

  if (token !== launchToken) return;
  seed = fallbackSeed;
  session = createFreshSession(map, nextModeId, seed);
  paused = false;
  history.reset(session.simulation.gameTime);
  saveHistoryCheckpoint(true);
  post({ type: 'ready', seed, mapId, modeId });
  postSnapshot();
}

function ensureLoop(): void {
  if (timer) return;
  timer = setInterval(() => {
    if (!session || paused) return;
    for (let i = 0; i < speed; i++) {
      session.tick();
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
      void createSession(message.mapId, message.modeId, message.seed, message.loadSavedState);
      ensureLoop();
      break;
    case 'speed':
      speed = message.speed;
      break;
    case 'reset':
      void createSession(message.mapId, message.modeId, message.seed, false);
      break;
    case 'gameAction':
      if (!session) break;
      session.apply(message.action);
      saveHistoryCheckpoint(true);
      postSnapshot();
      break;
    case 'pause':
      paused = message.paused;
      break;
    case 'historyStep': {
      if (!session) break;
      const state = history.step(message.delta, seed, mapId, modeId);
      if (!state) break;
      session.restoreState(state);
      postSnapshot();
      break;
    }
  }
};
