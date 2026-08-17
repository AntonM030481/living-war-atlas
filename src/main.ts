import './style.css';
import { Application } from 'pixi.js';
import { extensions, WebGLRenderer } from 'pixi.js';
import { AtlasRenderer, type FrontDebugInfo } from './rendering/AtlasRenderer';
import { testMap } from './map/testMap';
import type { HistoryInfo, SimulationSnapshot, WorkerInMessage, WorkerOutMessage } from './sim/types';
import { SPEEDS, type Speed } from './sim/Config';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('Missing #app');

const mapStage = document.createElement('div');
mapStage.className = 'map-stage';
root.appendChild(mapStage);

extensions.add(WebGLRenderer);

console.log('PIX1: before Application');

const app = new Application();

console.log('PIX2: before init');

const initPromise = app.init({
  resizeTo: mapStage,
  backgroundColor: 0xd9cfb4,
  antialias: true,
  preference: 'webgl', // Оставляем строкой
  resolution: Math.min(window.devicePixelRatio, 2),
  autoDensity: true,
});

setTimeout(() => {
  console.log('PIX init still pending after 5s', app);
}, 5000);

try {
  await initPromise;
  console.log('PIX3: after init', app.canvas);
  mapStage.appendChild(app.canvas);
} catch (err) {
  console.error('PixiJS error:', err);
}


console.log('PIX4: canvas attached');

const renderer = new AtlasRenderer(app, testMap);
const worker = new Worker(new URL('./worker/simulation.worker.ts', import.meta.url), {
  type: 'module',
});

function resizeMapStage(): void {
  const { width, height } = mapStage.getBoundingClientRect();
  app.renderer.resize(Math.max(1, Math.round(width)), Math.max(1, Math.round(height)));
  renderer.resize();
  if (latestSnapshot) updateMapOverlays(latestSnapshot);
}

const bluePointsBadge = document.createElement('div');
bluePointsBadge.className = 'city-points-badge blue';
bluePointsBadge.innerHTML = '<span>Blue --/--</span><small>war --</small>';
document.body.appendChild(bluePointsBadge);

const redPointsBadge = document.createElement('div');
redPointsBadge.className = 'city-points-badge red';
redPointsBadge.innerHTML = '<span>Red --/--</span><small>war --</small>';
document.body.appendChild(redPointsBadge);

const cityPowerLabels = new Map<string, HTMLDivElement>();
const cityNameLabels = new Map<string, HTMLDivElement>();
for (const city of testMap.cities) {
  const label = document.createElement('div');
  label.className = `city-power-label ${city.owner}`;
  label.textContent = `${city.baseProduction}`;
  label.title = `${city.name}: ${city.baseProduction} production points. Left click: production on/off. Right click: switch side.`;
  document.body.appendChild(label);
  cityPowerLabels.set(city.id, label);

  const nameLabel = document.createElement('div');
  nameLabel.className = `city-name-label ${city.owner}`;
  nameLabel.textContent = city.name;
  nameLabel.title = `${city.name}: ${city.baseProduction} production points. Left click: production on/off. Right click: switch side.`;
  document.body.appendChild(nameLabel);
  cityNameLabels.set(city.id, nameLabel);
}

let currentSeed = 20260816;
let speed: Speed = 4;
let paused = false;
let diagnosticsEnabled = false;
const speedButtons = SPEEDS.map((value) =>
  `<button data-speed="${value}" class="${value === speed ? 'active' : ''}" title="Set simulation speed to ${value}×">${value}×</button>`,
).join('');

const sidePanel = document.createElement('div');
sidePanel.className = 'side-panel';
root.appendChild(sidePanel);

const hud = document.createElement('div');
hud.className = 'hud';
hud.innerHTML = `
  <strong>Living War Atlas</strong>
  <span id="status">warming up…</span>
  <span id="history-status">history --/--</span>
  <div class="speed-row">
    ${speedButtons}
  </div>
  <div class="transport-row">
    <button id="history-back" disabled title="Back 5 seconds">-5s</button>
    <button id="pause" title="Pause or resume simulation">Pause</button>
    <button id="history-forward" disabled title="Forward 5 seconds">+5s</button>
  </div>
  <div class="action-row">
    <button id="reset" title="Start a new game with a new seed">New game</button>
    <button id="debug" title="Show city resource diagnostics">Diag</button>
  </div>
`;
sidePanel.appendChild(hud);

const legend = document.createElement('details');
legend.className = 'legend';
legend.open = true;
legend.innerHTML = `
  <summary>MAP LEGEND</summary>
  <div class="legend-grid">
    <span class="legend-mark front-line"></span><span>front line</span>
    <span class="legend-mark old-border"></span><span>prewar border</span>
    <span class="legend-mark blue-flow"></span><span>Blue flow arrows (Diag)</span>
    <span class="legend-mark red-flow"></span><span>Red flow arrows (Diag)</span>
    <span class="legend-mark blue-city"></span><span>Blue city</span>
    <span class="legend-mark red-city"></span><span>Red city</span>
    <span class="legend-mark river-mark"></span><span>river</span>
    <span class="legend-mark forest-mark"></span><span>forest</span>
    <span class="legend-mark stress-mark"></span><span>front instability</span>
  </div>
  <div class="legend-note">City left click: production on/off<br>City right click: switch side<br>Space: pause · ←/→: rewind · ↑/↓: speed</div>
`;
sidePanel.appendChild(legend);

const probePanel = document.createElement('div');
probePanel.className = 'probe-panel';
probePanel.innerHTML = `
  <b>FRONT PROBE</b>
  <div id="probe-content" class="probe-empty">click the front line</div>
`;
sidePanel.appendChild(probePanel);

const diagnosticsPanel = document.createElement('div');
diagnosticsPanel.className = 'diagnostics-panel';
diagnosticsPanel.hidden = true;
diagnosticsPanel.innerHTML = `
  <b>CITY DIAGNOSTICS</b>
  <div id="diagnostics-content" class="diagnostics-empty">off</div>
`;
sidePanel.appendChild(diagnosticsPanel);

const status = hud.querySelector<HTMLSpanElement>('#status')!;
const historyStatus = hud.querySelector<HTMLSpanElement>('#history-status')!;
const pauseButton = hud.querySelector<HTMLButtonElement>('#pause')!;
const debugButton = hud.querySelector<HTMLButtonElement>('#debug')!;
const historyBackButton = hud.querySelector<HTMLButtonElement>('#history-back')!;
const historyForwardButton = hud.querySelector<HTMLButtonElement>('#history-forward')!;
const probeContent = probePanel.querySelector<HTMLDivElement>('#probe-content')!;
const diagnosticsContent = diagnosticsPanel.querySelector<HTMLDivElement>('#diagnostics-content')!;
renderer.setDebug(true);
renderer.setShowFlows(false);
let latestSnapshot: SimulationSnapshot | null = null;
let selectedProbe: FrontDebugInfo | null = null;
let latestHistory: HistoryInfo | null = null;
let suppressNextPrimaryClickUntil = 0;
let lastCityFlipAt = 0;
let lastCityFlipId: string | null = null;

new ResizeObserver(resizeMapStage).observe(mapStage);
resizeMapStage();

window.addEventListener('resize', () => {
  resizeMapStage();
  if (latestSnapshot) updateMapOverlays(latestSnapshot);
});

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
  pauseButton.title = paused ? 'Resume simulation' : 'Pause simulation';
  pauseButton.classList.toggle('active', paused);
  send({ type: 'pause', paused });
}

function setDiagnostics(next: boolean): void {
  diagnosticsEnabled = next;
  diagnosticsPanel.hidden = !diagnosticsEnabled;
  debugButton.textContent = diagnosticsEnabled ? 'Diag on' : 'Diag';
  debugButton.title = diagnosticsEnabled
    ? 'Hide flow arrows and city resource diagnostics'
    : 'Show flow arrows and city resource diagnostics';
  debugButton.classList.toggle('active', diagnosticsEnabled);
  renderer.setShowFlows(diagnosticsEnabled);
  renderDiagnostics(diagnosticsEnabled ? latestSnapshot : null);
}

function updateHistoryControls(history: HistoryInfo): void {
  latestHistory = history;
  historyBackButton.disabled = !history.canRewind;
  historyForwardButton.disabled = !history.canForward;
  historyStatus.textContent =
    history.length > 0
      ? `history ${history.currentIndex + 1}/${history.length}`
      : 'history --/--';
  historyBackButton.title =
    history.length > 0
      ? `Back ${history.intervalSeconds}s (${history.currentIndex + 1}/${history.length})`
      : 'No saved states yet';
  historyForwardButton.title =
    history.length > 0
      ? `Forward ${history.intervalSeconds}s (${history.currentIndex + 1}/${history.length})`
      : 'No saved states yet';
}

function stepHistory(delta: -1 | 1): void {
  if (latestHistory && ((delta < 0 && !latestHistory.canRewind) || (delta > 0 && !latestHistory.canForward))) {
    return;
  }
  setPaused(true);
  send({ type: 'historyStep', delta });
}

function stepSpeed(delta: -1 | 1): void {
  const index = SPEEDS.indexOf(speed);
  const nextIndex = Math.max(0, Math.min(SPEEDS.length - 1, index + delta));
  setSpeed(SPEEDS[nextIndex]);
}

function fmt(value: number): string {
  return value.toFixed(Math.abs(value) >= 10 ? 1 : 3);
}

function fmtDiag(value: number): string {
  return value.toFixed(Math.abs(value) >= 10 ? 1 : 2);
}

function formatPoints(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

function updateMapOverlays(snapshot: SimulationSnapshot): void {
  updateCityPointBadges(snapshot);
  updateCityPowerLabels(snapshot);
  if (diagnosticsEnabled) renderDiagnostics(snapshot);
}

function updateCityPointBadges(snapshot: SimulationSnapshot): void {
  const s = snapshot.stats;
  const rect = renderer.mapScreenRect();
  bluePointsBadge.innerHTML = `
    <span>Blue ${formatPoints(s.activeCityPointsBlue)}/${formatPoints(s.controlledCityPointsBlue)}</span>
    <small>war ${Math.round(s.totalWarBlue)}</small>
  `;
  redPointsBadge.innerHTML = `
    <span>Red ${formatPoints(s.activeCityPointsRed)}/${formatPoints(s.controlledCityPointsRed)}</span>
    <small>war ${Math.round(s.totalWarRed)}</small>
  `;
  bluePointsBadge.style.left = `${rect.left + 10}px`;
  bluePointsBadge.style.top = `${rect.top + 10}px`;
  redPointsBadge.style.left = `${rect.left + rect.width - redPointsBadge.offsetWidth - 10}px`;
  redPointsBadge.style.right = 'auto';
  redPointsBadge.style.top = `${rect.top + 10}px`;
}

function updateCityPowerLabels(snapshot: SimulationSnapshot): void {
  for (const city of snapshot.cities) {
    const label = cityPowerLabels.get(city.id);
    const nameLabel = cityNameLabels.get(city.id);
    if (!label || !nameLabel) continue;
    const point = renderer.worldToScreen({ x: city.x, y: city.y });
    const control = snapshot.control[city.y * snapshot.width + city.x];
    const ownerControl = city.owner === 'blue' ? control : -control;
    const contested = ownerControl < 0.72;

    label.hidden = contested;
    nameLabel.hidden = contested;
    label.textContent = `${city.baseProduction}`;
    label.title = `${city.name}: ${city.baseProduction} production points. Left click: production on/off. Right click: switch side.`;
    label.className =
      `city-power-label ${city.owner} power-${city.baseProduction}${city.enabled === false ? ' disabled' : ''}`;
    label.style.left = `${point.x}px`;
    label.style.top = `${point.y}px`;

    nameLabel.textContent = city.name;
    nameLabel.title = `${city.name}: ${city.baseProduction} production points. Left click: production on/off. Right click: switch side.`;
    nameLabel.className = `city-name-label ${city.owner}${city.enabled === false ? ' disabled' : ''}`;
    nameLabel.style.left = `${point.x}px`;
    nameLabel.style.top = `${point.y + 22}px`;
  }
}


function renderProbe(info: FrontDebugInfo | null): void {
  if (!info) {
    probeContent.className = 'probe-empty';
    probeContent.textContent = 'click the front line';
    return;
  }

  probeContent.className = '';
  probeContent.innerHTML = `
    <div class="probe-row"><span>x,y</span><b>${info.x.toFixed(1)}, ${info.y.toFixed(1)}</b></div>
    <div class="probe-row"><span>radius</span><b>${info.radius}</b></div>
    <div class="probe-row"><span>avg control</span><b>${fmt(info.control)}</b></div>
    <div class="probe-split">
      <b></b><b>Blue</b><b>Red</b>
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

function localWeightedSum(snapshot: SimulationSnapshot, field: Float32Array, cx: number, cy: number, radius: number): number {
  let sum = 0;
  const minY = Math.max(0, Math.floor(cy - radius));
  const maxY = Math.min(snapshot.height - 1, Math.ceil(cy + radius));
  const minX = Math.max(0, Math.floor(cx - radius));
  const maxX = Math.min(snapshot.width - 1, Math.ceil(cx + radius));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > radius * radius) continue;
      const weight = 1 - Math.sqrt(d2) / radius;
      sum += field[y * snapshot.width + x] * weight;
    }
  }
  return sum;
}

function localFlowSum(snapshot: SimulationSnapshot, flowX: Float32Array, flowY: Float32Array, cx: number, cy: number, radius: number): number {
  let sum = 0;
  const minY = Math.max(0, Math.floor(cy - radius));
  const maxY = Math.min(snapshot.height - 1, Math.ceil(cy + radius));
  const minX = Math.max(0, Math.floor(cx - radius));
  const maxX = Math.min(snapshot.width - 1, Math.ceil(cx + radius));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > radius * radius) continue;
      const index = y * snapshot.width + x;
      const weight = 1 - Math.sqrt(d2) / radius;
      sum += Math.hypot(flowX[index], flowY[index]) * weight;
    }
  }
  return sum;
}

function renderDiagnostics(snapshot: SimulationSnapshot | null): void {
  if (!diagnosticsEnabled) {
    diagnosticsContent.className = 'diagnostics-empty';
    diagnosticsContent.textContent = 'off';
    return;
  }
  if (!snapshot) {
    diagnosticsContent.className = 'diagnostics-empty';
    diagnosticsContent.textContent = 'waiting for snapshot';
    return;
  }

  diagnosticsContent.className = '';
  const rows = snapshot.cities.map((city) => {
    const index = city.y * snapshot.width + city.x;
    const war = city.owner === 'blue' ? snapshot.warBlue : snapshot.warRed;
    const flowX = city.owner === 'blue' ? snapshot.flowBlueX : snapshot.flowRedX;
    const flowY = city.owner === 'blue' ? snapshot.flowBlueY : snapshot.flowRedY;
    const cityWar = war[index];
    const localWar = localWeightedSum(snapshot, war, city.x, city.y, 5);
    const cityFlow = Math.hypot(flowX[index], flowY[index]);
    const localFlow = localFlowSum(snapshot, flowX, flowY, city.x, city.y, 5);
    const production = city.enabled === false ? 0 : city.baseProduction * city.integration;
    const weak = production > 0 && localWar < 0.5 && localFlow < 0.05;
    return `
      <tr class="${weak ? 'weak' : ''}">
        <th>${city.name}</th>
        <td>${fmtDiag(production)}</td>
        <td>${fmtDiag(cityWar)} / ${fmtDiag(localWar)}</td>
        <td>${fmtDiag(cityFlow)} / ${fmtDiag(localFlow)}</td>
      </tr>
    `;
  }).join('');

  diagnosticsContent.innerHTML = `
    <table class="diagnostics-table">
      <thead>
        <tr><th>city</th><th>prod</th><th>war cell/local</th><th>flow cell/local</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

hud.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((button) => {
  button.addEventListener('click', () => {
    const next = Number(button.dataset.speed);
    if (isSpeed(next)) setSpeed(next);
  });
});
pauseButton.addEventListener('click', () => setPaused(!paused));
debugButton.addEventListener('click', () => setDiagnostics(!diagnosticsEnabled));
historyBackButton.addEventListener('click', () => stepHistory(-1));
historyForwardButton.addEventListener('click', () => stepHistory(1));
hud.querySelector<HTMLButtonElement>('#reset')!.addEventListener('click', () => {
  setPaused(true);
  const confirmed = window.confirm('Start a new game? This clears the current rewind history.');
  if (confirmed) {
    currentSeed = (currentSeed + 104729) >>> 0;
    status.textContent = `seed ${currentSeed} · starting…`;
    send({ type: 'reset', seed: currentSeed });
  }
  setPaused(false);
});
app.canvas.addEventListener('click', (event) => {
  if (Date.now() < suppressNextPrimaryClickUntil) return;
  if (event.ctrlKey) return;
  if (event.button !== 0) return;
  const cityId = renderer.cityIdAtClientPoint(event.clientX, event.clientY);
  if (cityId) {
    send({ type: 'toggleCity', cityId });
    return;
  }
  if (!diagnosticsEnabled || !latestSnapshot) return;
  selectedProbe = renderer.inspectFrontAtClientPoint(latestSnapshot, event.clientX, event.clientY);
  renderProbe(selectedProbe);
});

function handleSecondaryCityClick(event: MouseEvent | PointerEvent, force = false): void {
  const secondary = force || event.button === 2 || (event.button === 0 && event.ctrlKey);
  if (!secondary) return;
  const cityId = renderer.cityIdAtClientPoint(event.clientX, event.clientY);
  if (!cityId) return;
  event.preventDefault();
  event.stopPropagation();
  suppressNextPrimaryClickUntil = Date.now() + 500;
  if (lastCityFlipId === cityId && Date.now() - lastCityFlipAt < 250) return;
  lastCityFlipId = cityId;
  lastCityFlipAt = Date.now();
  send({ type: 'flipCityOwner', cityId });
}

window.addEventListener('contextmenu', (event) => handleSecondaryCityClick(event, true), true);

window.addEventListener('keydown', (event) => {
  const nextSpeed = Number(event.key);
  if (isSpeed(nextSpeed)) setSpeed(nextSpeed);
  if (event.key === ' ') {
    event.preventDefault();
    setPaused(!paused);
  }
  if (event.key === 'F3') {
    event.preventDefault();
    setDiagnostics(!diagnosticsEnabled);
  }
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    stepHistory(-1);
  }
  if (event.key === 'ArrowRight') {
    event.preventDefault();
    stepHistory(1);
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    stepSpeed(1);
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    stepSpeed(-1);
  }
  if (event.key === '[') {
    event.preventDefault();
    stepHistory(-1);
  }
  if (event.key === ']') {
    event.preventDefault();
    stepHistory(1);
  }
});

worker.onmessage = (event: MessageEvent<WorkerOutMessage>) => {
  const message = event.data;
  if (message.type === 'ready') {
    currentSeed = message.seed;
    status.textContent = `seed ${message.seed} · ready`;
    return;
  }
  if (message.type === 'snapshot') {
    latestSnapshot = message.snapshot;
    updateHistoryControls(message.history);
    renderer.render(message.snapshot);
    updateMapOverlays(message.snapshot);
    if (selectedProbe) {
      selectedProbe = renderer.inspectFrontAtWorldPoint(message.snapshot, selectedProbe);
      renderProbe(selectedProbe);
    }
    const minutes = Math.floor(message.snapshot.gameTime / 60);
    const seconds = Math.floor(message.snapshot.gameTime % 60).toString().padStart(2, '0');
    status.textContent = `${minutes}:${seconds}`;
  }
};

send({ type: 'start', seed: currentSeed });
send({ type: 'speed', speed });