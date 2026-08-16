import './style.css';
import { Application } from 'pixi.js';
import { AtlasRenderer, type FrontDebugInfo } from './rendering/AtlasRenderer';
import { testMap } from './map/testMap';
import type { SimulationSnapshot, WorkerInMessage, WorkerOutMessage } from './sim/types';
import { SPEEDS, type Speed } from './sim/Config';

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
let speed: Speed = SPEEDS[0];
let paused = false;
let debug = true;
const speedButtons = SPEEDS.map((value) =>
  `<button data-speed="${value}" class="${value === speed ? 'active' : ''}">${value}×</button>`,
).join('');

const hud = document.createElement('div');
hud.className = 'hud';
hud.innerHTML = `
  <strong>Living War Atlas · M0</strong>
  <span id="status">warming up…</span>
  <span id="telemetry">front -- · stress --</span>
  <div class="hud-buttons">
    ${speedButtons}
    <button id="pause">Pause</button>
    <button id="debug" class="active">Debug</button>
    <button id="reset">New seed</button>
  </div>
`;
document.body.appendChild(hud);

const legend = document.createElement('details');
legend.className = 'legend';
legend.innerHTML = `
  <summary>УСЛОВНЫЕ ОБОЗНАЧЕНИЯ</summary>
  <div class="legend-grid">
    <span class="legend-mark front-line"></span><span>линия фронта</span>
    <span class="legend-mark old-border"></span><span>довоенная граница</span>
    <span class="legend-mark blue-flow"></span><span>ресурс синих</span>
    <span class="legend-mark red-flow"></span><span>ресурс красных</span>
    <span class="legend-mark blue-city"></span><span>город синих</span>
    <span class="legend-mark red-city"></span><span>город красных</span>
    <span class="legend-mark river-mark"></span><span>река</span>
    <span class="legend-mark mountain-mark"></span><span>трудная местность</span>
    <span class="legend-mark stress-mark"></span><span>нестабильность</span>
  </div>
  <div class="legend-note">Click city: resource on/off<br>Debug: resource density + stress<br>Space: pause</div>
`;
document.body.appendChild(legend);

const probePanel = document.createElement('div');
probePanel.className = 'probe-panel';
probePanel.innerHTML = `
  <b>ТОЧКА ФРОНТА</b>
  <div id="probe-content" class="probe-empty">клик по линии фронта</div>
`;
document.body.appendChild(probePanel);

const status = hud.querySelector<HTMLSpanElement>('#status')!;
const telemetry = hud.querySelector<HTMLSpanElement>('#telemetry')!;
const pauseButton = hud.querySelector<HTMLButtonElement>('#pause')!;
const debugButton = hud.querySelector<HTMLButtonElement>('#debug')!;
const probeContent = probePanel.querySelector<HTMLDivElement>('#probe-content')!;
renderer.setDebug(debug);
let latestSnapshot: SimulationSnapshot | null = null;
let selectedProbe: FrontDebugInfo | null = null;

function send(message: WorkerInMessage): void {
  worker.postMessage(message);
}

function isSpeed(value: number): value is Speed {
  return (SPEEDS as readonly number[]).includes(value);
}

function setSpeed(next: Speed): void {
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

function fmt(value: number): string {
  return value.toFixed(Math.abs(value) >= 10 ? 1 : 3);
}

function renderProbe(info: FrontDebugInfo | null): void {
  if (!info) {
    probeContent.className = 'probe-empty';
    probeContent.textContent = 'клик по линии фронта';
    return;
  }

  probeContent.className = '';
  probeContent.innerHTML = `
    <div class="probe-row"><span>x,y</span><b>${info.x.toFixed(1)}, ${info.y.toFixed(1)}</b></div>
    <div class="probe-row"><span>radius</span><b>${info.radius}</b></div>
    <div class="probe-row"><span>avg control</span><b>${fmt(info.control)}</b></div>
    <div class="probe-split">
      <b></b><b>синие</b><b>красные</b>
      <span>avg war</span><code>${fmt(info.warBlue)}</code><code>${fmt(info.warRed)}</code>
      <span>avg mass</span><code>${fmt(info.frontMassBlue)}</code><code>${fmt(info.frontMassRed)}</code>
      <span>avg incoming</span><code>${fmt(info.incomingBlue)}</code><code>${fmt(info.incomingRed)}</code>
      <span>avg drain</span><code>${fmt(info.drainBlue)}</code><code>${fmt(info.drainRed)}</code>
      <span>advance raw</span><code>${fmt(info.advanceBlue)}</code><code>${fmt(info.advanceRed)}</code>
      <span>stress raw</span><code>${fmt(info.stressBlue)}</code><code>${fmt(info.stressRed)}</code>
      <span>avg instab</span><code>${fmt(info.instabilityBlue)}</code><code>${fmt(info.instabilityRed)}</code>
      <span>avg flow</span><code>${fmt(info.flowBlue)}</code><code>${fmt(info.flowRed)}</code>
      <span>sum war</span><code>${fmt(info.localWarBlue)}</code><code>${fmt(info.localWarRed)}</code>
      <span>sum drain</span><code>${fmt(info.localDrainBlue)}</code><code>${fmt(info.localDrainRed)}</code>
    </div>
    <div class="probe-row"><span>avg raw force</span><b>${fmt(info.rawForcing)}</b></div>
    <div class="probe-row"><span>avg clamped force</span><b>${fmt(info.forcing)}</b></div>
    <div class="probe-row"><span>avg pressure</span><b>${fmt(info.pressure)}</b></div>
    <div class="probe-row"><span>avg terrain def/mob</span><b>${fmt(info.terrainDefense)} / ${fmt(info.terrainMobility)}</b></div>
  `;
}

hud.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((button) => {
  button.addEventListener('click', () => {
    const next = Number(button.dataset.speed);
    if (isSpeed(next)) setSpeed(next);
  });
});
pauseButton.addEventListener('click', () => setPaused(!paused));
debugButton.addEventListener('click', () => setDebug(!debug));
hud.querySelector<HTMLButtonElement>('#reset')!.addEventListener('click', () => {
  currentSeed = (currentSeed + 104729) >>> 0;
  status.textContent = `seed ${currentSeed} · warming up…`;
  send({ type: 'reset', seed: currentSeed });
});
app.canvas.addEventListener('click', (event) => {
  const cityId = renderer.cityIdAtClientPoint(event.clientX, event.clientY);
  if (cityId) {
    send({ type: 'toggleCity', cityId });
    return;
  }
  if (!latestSnapshot) return;
  selectedProbe = renderer.inspectFrontAtClientPoint(latestSnapshot, event.clientX, event.clientY);
  renderProbe(selectedProbe);
});

window.addEventListener('keydown', (event) => {
  const nextSpeed = Number(event.key);
  if (isSpeed(nextSpeed)) setSpeed(nextSpeed);
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
    latestSnapshot = message.snapshot;
    renderer.render(message.snapshot);
    if (selectedProbe) {
      selectedProbe = renderer.inspectFrontAtWorldPoint(message.snapshot, selectedProbe);
      renderProbe(selectedProbe);
    }
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
