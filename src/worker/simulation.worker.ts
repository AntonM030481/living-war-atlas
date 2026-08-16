/// <reference lib="webworker" />

import { type Speed } from '../sim/Config';
import { Simulation } from '../sim/Simulation';
import type { WorkerInMessage, WorkerOutMessage } from '../sim/types';
import { testMap } from '../map/testMap';

let sim: Simulation | null = null;
let speed: Speed = 1;
let paused = false;
let seed = 1;
let timer: ReturnType<typeof setInterval> | null = null;

function post(message: WorkerOutMessage): void {
  self.postMessage(message);
}

function createSimulation(nextSeed: number): void {
  seed = nextSeed >>> 0 || 1;
  sim = new Simulation(testMap, seed);
  post({ type: 'ready', seed });
  post({ type: 'snapshot', snapshot: sim.snapshot() });
}

function ensureLoop(): void {
  if (timer) return;
  timer = setInterval(() => {
    if (!sim || paused) return;
    for (let i = 0; i < speed; i++) sim.tick();
    post({ type: 'snapshot', snapshot: sim.snapshot() });
  }, 100);
}

self.onmessage = (event: MessageEvent<WorkerInMessage>) => {
  const message = event.data;
  switch (message.type) {
    case 'start':
      createSimulation(message.seed);
      ensureLoop();
      break;
    case 'speed':
      speed = message.speed;
      break;
    case 'reset':
      createSimulation(message.seed);
      break;
    case 'pause':
      paused = message.paused;
      break;
  }
};
