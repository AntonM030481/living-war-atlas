import './style.css';
import { Application } from 'pixi.js';
import { AtlasRenderer } from './rendering/AtlasRenderer';
import { testMap } from './map/testMap';
import type { WorkerInMessage, WorkerOutMessage } from './sim/types';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('Missing #app');

const app = new Application();
await app.init({
  resizeTo: window,
  backgroundColor: 0xd9cfb4,
  antialias: true,
  preference: 'webgl',
  resolution: Math.min(window.devicePixelRatio, 2),
  autoDensity: true,
});
root.appendChild(app.canvas);

const renderer = new AtlasRenderer(app, testMap);
const worker = new Worker(new URL('./worker/simulation.worker.ts', import.meta.url), {
  type: 'module',
});

let currentSeed = 20260816;
let speed: 1 | 2 | 4 = 1;
let paused = false;
let debug = false;

const hud = document.createElement('div');
hud.className = 'hud';
hud.innerHTML = `
  <strong>Living War Atlas · M0</strong>
  <span id="status">warming up…</span>
  <span id="telemetry">front -- · stress --</span>
  <button data-speed="1" class="active">1×</button>
  <button data-speed="2">2×</button>
  <button data-speed="4">4×</button>
  <button id="pause">Pause</button>
  <button id="debug">Debug</button>
  <button id="reset">New seed</button>
`;
document.body.appendChild(hud);

const legend = document.createElement('div');
legend.className = 'legend';
legend.innerHTML = `
  <b>M0: autonomous front</b><br>
  dashed arrows = physical War Resource flow<br>
  pale dashed line = pre-war border<br>
  Debug shows instability · Space = pause
`;
document.body.appendChild(legend);

const status = hud.querySelector<HTMLSpanElement>('#status')!;
const telemetry = hud.querySelector<HTMLSpanElement>('#telemetry')!;
const pauseButton = hud.querySelector<HTMLButtonElement>('#pause')!;
const debugButton = hud.querySelector<HTMLButtonElement>('#debug')!;

function send(message: WorkerInMessage): void {
  worker.postMessage(message);
}

function setSpeed(next: 1 | 2 | 4): void {
  speed = next;
  send({ type: 'speed', speed });
  hud.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((button) => {
    button.classList.toggle('active', Number(button.dataset.speed) === speed);
  });
}

function setPaused(next: boolean): void {
  paused = next;
  pauseButton.textContent = paused ? 'Resume' : 'Pause';
  pauseButton.classList.toggle('active', paused);
  send({ type: 'pause', paused });
}

function setDebug(next: boolean): void {
  debug = next;
  renderer.setDebug(debug);
  debugButton.classList.toggle('active', debug);
}

hud.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((button) => {
  button.addEventListener('click', () => setSpeed(Number(button.dataset.speed) as 1 | 2 | 4));
});
pauseButton.addEventListener('click', () => setPaused(!paused));
debugButton.addEventListener('click', () => setDebug(!debug));
hud.querySelector<HTMLButtonElement>('#reset')!.addEventListener('click', () => {
  currentSeed = (currentSeed + 104729) >>> 0;
  status.textContent = `seed ${currentSeed} · warming up…`;
  send({ type: 'reset', seed: currentSeed });
});

window.addEventListener('keydown', (event) => {
  if (event.key === '1') setSpeed(1);
  if (event.key === '2') setSpeed(2);
  if (event.key === '4') setSpeed(4);
  if (event.key === ' ') {
    event.preventDefault();
    setPaused(!paused);
  }
  if (event.key === 'F3') {
    event.preventDefault();
    setDebug(!debug);
  }
});

worker.onmessage = (event: MessageEvent<WorkerOutMessage>) => {
  const message = event.data;
  if (message.type === 'ready') {
    status.textContent = `seed ${message.seed} · ready`;
    return;
  }
  if (message.type === 'snapshot') {
    renderer.render(message.snapshot);
    const minutes = Math.floor(message.snapshot.gameTime / 60);
    const seconds = Math.floor(message.snapshot.gameTime % 60).toString().padStart(2, '0');
    const stats = message.snapshot.stats;
    const maxInstability = Math.max(stats.maxInstabilityBlue, stats.maxInstabilityRed);
    const collapseCells = stats.collapseBlueCells + stats.collapseRedCells;
    const totalWar = Math.round(stats.totalWarBlue + stats.totalWarRed);
    const totalFlow = Math.round(stats.activeFlowBlue + stats.activeFlowRed);
    status.textContent = `seed ${currentSeed} · ${minutes}:${seconds} · ${speed}×`;
    telemetry.textContent = `front ${stats.frontCells} · stress ${maxInstability.toFixed(2)} · collapse ${collapseCells} · war ${totalWar} · flow ${totalFlow}`;
  }
};

send({ type: 'start', seed: currentSeed });
