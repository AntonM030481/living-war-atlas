import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { annotateTimelineSvg, firstSampleEvent, recoveryEvents } from './EventMarkers';
import { Simulation } from '../../src/sim/Simulation';
import { CFG, ticks } from '../../src/sim/Config';
import { testMap } from '../../src/map/testMap';
import type { City, MapDefinition, SimulationSnapshot } from '../../src/sim/types';

interface CommitmentSample {
  phase: string;
  t: number;
  committed: number;
  reserve: number;
}

interface RecoverySample {
  t: number;
  frontX: number;
  blueCityOwner: string;
  blueCityBaseProduction: number;
  blueCommitted: number;
  blueReserve: number;
  redCommitted: number;
  redReserve: number;
  fixedBlueCommitted: number;
  fixedBlueReserve: number;
  fixedRedCommitted: number;
  fixedRedReserve: number;
  totalWarBlue: number;
  totalWarRed: number;
  blueInstability: number;
  blueCollapse: number;
}

interface TippingSample {
  duration: number;
  loss: number;
  final: number;
  owner: string;
}

interface CityFlowSample {
  t: number;
  city: string;
  owner: string;
  baseProduction: number;
  activeProduction: number;
  control: number;
  ownWarCell: number;
  ownWarLocal: number;
  sourceFlow: number;
  localFlow: number;
  tracePoints: number;
  traceAverageMagnitude: number;
  traceMaxMagnitude: number;
  renderStrength: number;
}

interface Series {
  label: string;
  color: string;
  values: Array<{ x: number; y: number }>;
}

const outDir = resolve(dirname(fileURLToPath(import.meta.url)));
const diagnostics = (name: string) => resolve(outDir, name);

Object.defineProperty(Simulation.prototype, 'collapseBlue', {
  configurable: true,
  get(this: Simulation) {
    return this.sides.blue.collapse;
  },
});

function oneDimensionalMap(width = 80): MapDefinition {
  return {
    width,
    height: 1,
    initialFrontX: () => 40.4,
    rivers: [],
    forests: [],
    cities: [
      { id: 'b', name: 'Blue', x: 8, y: 0, baseProduction: 4, owner: 'blue', integration: 1 },
      { id: 'r', name: 'Red', x: 71, y: 0, baseProduction: 4, owner: 'red', integration: 1 },
    ],
  };
}

function frontPosition1D(sim: Simulation, width: number): number {
  for (let x = 0; x < width - 1; x++) {
    const a = sim.control[x];
    const b = sim.control[x + 1];
    if (a >= 0 && b <= 0) {
      const t = a / (a - b || 1);
      return x + t;
    }
  }
  return sim.control[0] < 0 ? 0 : width - 1;
}

function csv<T extends object>(rows: T[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]) as Array<keyof T>;
  return [
    headers.map(String).join(','),
    ...rows.map((row) => headers.map((header) => String(row[header])).join(',')),
  ].join('\n') + '\n';
}

function writeText(path: string, text: string): void {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, path), text);
}

function localMass(sim: Simulation, side: 'blue' | 'red', center: number, radius = 4): { committed: number; reserve: number } {
  const war = side === 'blue' ? sim.warBlue : sim.warRed;
  const committed = side === 'blue' ? sim.committedBlue : sim.committedRed;
  let committedTotal = 0;
  let reserveTotal = 0;
  for (let dx = -radius; dx <= radius; dx++) {
    const x = center + dx;
    if (x < 0 || x >= sim.width) continue;
    const weight = 1 - Math.abs(dx) / (radius + 1);
    committedTotal += committed[x] * weight;
    reserveTotal += Math.max(0, war[x] - committed[x]) * weight;
  }
  return { committed: committedTotal, reserve: reserveTotal };
}

function total(field: Float32Array): number {
  let sum = 0;
  for (const value of field) sum += value;
  return sum;
}

function localWeightedSum(snapshot: SimulationSnapshot, field: Float32Array, cx: number, cy: number, radius = 5): number {
  let sum = 0;
  for (let dy = -radius; dy <= radius; dy++) {
    const y = cy + dy;
    if (y < 0 || y >= snapshot.height) continue;
    for (let dx = -radius; dx <= radius; dx++) {
      const x = cx + dx;
      if (x < 0 || x >= snapshot.width) continue;
      const d = Math.hypot(dx, dy);
      if (d > radius) continue;
      const weight = 1 - d / (radius + 1);
      sum += field[y * snapshot.width + x] * weight;
    }
  }
  return sum;
}

function localVectorMagnitudeSum(snapshot: SimulationSnapshot, flowX: Float32Array, flowY: Float32Array, cx: number, cy: number, radius = 5): number {
  let sum = 0;
  for (let dy = -radius; dy <= radius; dy++) {
    const y = cy + dy;
    if (y < 0 || y >= snapshot.height) continue;
    for (let dx = -radius; dx <= radius; dx++) {
      const x = cx + dx;
      if (x < 0 || x >= snapshot.width) continue;
      const d = Math.hypot(dx, dy);
      if (d > radius) continue;
      const weight = 1 - d / (radius + 1);
      const i = y * snapshot.width + x;
      sum += Math.hypot(flowX[i], flowY[i]) * weight;
    }
  }
  return sum;
}

function sampleVector(snapshot: SimulationSnapshot, flowX: Float32Array, flowY: Float32Array, x: number, y: number): { x: number; y: number } {
  const ix = Math.max(0, Math.min(snapshot.width - 1, Math.round(x)));
  const iy = Math.max(0, Math.min(snapshot.height - 1, Math.round(y)));
  const i = iy * snapshot.width + ix;
  return { x: flowX[i], y: flowY[i] };
}

function traceCityFlow(snapshot: SimulationSnapshot, city: City): { points: number; averageMagnitude: number; maxMagnitude: number } {
  const blue = city.owner === 'blue';
  const flowX = blue ? snapshot.flowBlueX : snapshot.flowRedX;
  const flowY = blue ? snapshot.flowBlueY : snapshot.flowRedY;
  let x = city.x;
  let y = city.y;
  let points = 1;
  let stale = 0;
  let magnitudeSum = 0;
  let magnitudeSamples = 0;
  let maxMagnitude = 0;

  for (let step = 0; step < 150; step++) {
    const v = sampleVector(snapshot, flowX, flowY, x, y);
    const mag = Math.hypot(v.x, v.y);
    if (mag < 0.018) {
      stale += 1;
      if (stale > 5) break;
      const sign = city.owner === 'blue' ? 1 : -1;
      x += sign * 0.42;
    } else {
      stale = 0;
      magnitudeSum += mag;
      magnitudeSamples += 1;
      maxMagnitude = Math.max(maxMagnitude, mag);
      const stepSize = 0.55;
      x += (v.x / mag) * stepSize;
      y += (v.y / mag) * stepSize;
    }

    if (x < 0 || x >= snapshot.width || y < 0 || y >= snapshot.height) break;
    points += 1;
    const i = Math.round(y) * snapshot.width + Math.round(x);
    if (i >= 0 && i < snapshot.control.length && Math.abs(snapshot.control[i]) < 0.22) break;
  }

  return {
    points,
    averageMagnitude: magnitudeSamples > 0 ? magnitudeSum / magnitudeSamples : 0,
    maxMagnitude,
  };
}

function cityFlowDiagnostics(totalSeconds = 120): CityFlowSample[] {
  const sim = new Simulation(testMap, 20260816);
  const rows: CityFlowSample[] = [];
  const sampleEverySteps = ticks(5);

  for (let step = 0; step <= ticks(totalSeconds); step++) {
    sim.tick();
    if (step % sampleEverySteps !== 0) continue;

    const snapshot = sim.snapshot();
    for (const city of snapshot.cities) {
      const blue = city.owner === 'blue';
      const war = blue ? snapshot.warBlue : snapshot.warRed;
      const flowX = blue ? snapshot.flowBlueX : snapshot.flowRedX;
      const flowY = blue ? snapshot.flowBlueY : snapshot.flowRedY;
      const i = city.y * snapshot.width + city.x;
      const trace = traceCityFlow(snapshot, city);
      rows.push({
        t: Number(snapshot.gameTime.toFixed(1)),
        city: city.name,
        owner: city.owner,
        baseProduction: city.baseProduction,
        activeProduction: city.enabled === false ? 0 : city.baseProduction * city.integration,
        control: Number(snapshot.control[i].toFixed(4)),
        ownWarCell: Number(war[i].toFixed(4)),
        ownWarLocal: Number(localWeightedSum(snapshot, war, city.x, city.y).toFixed(4)),
        sourceFlow: Number(Math.hypot(flowX[i], flowY[i]).toFixed(4)),
        localFlow: Number(localVectorMagnitudeSum(snapshot, flowX, flowY, city.x, city.y).toFixed(4)),
        tracePoints: trace.points,
        traceAverageMagnitude: Number(trace.averageMagnitude.toFixed(4)),
        traceMaxMagnitude: Number(trace.maxMagnitude.toFixed(4)),
        renderStrength: Number(Math.min(1, Math.sqrt(trace.averageMagnitude / 4.5)).toFixed(4)),
      });
    }
  }

  return rows;
}

function snapshotRecoverySample(sim: Simulation, t: number, fixedFrontX: number): RecoverySample {
  const frontX = frontPosition1D(sim, sim.width);
  const blueCenter = Math.max(0, Math.floor(frontX) - 1);
  const redCenter = Math.min(sim.width - 1, Math.ceil(frontX) + 1);
  const fixedBlueCenter = Math.max(0, Math.floor(fixedFrontX) - 1);
  const fixedRedCenter = Math.min(sim.width - 1, Math.ceil(fixedFrontX) + 1);
  const blue = localMass(sim, 'blue', blueCenter);
  const red = localMass(sim, 'red', redCenter);
  const fixedBlue = localMass(sim, 'blue', fixedBlueCenter);
  const fixedRed = localMass(sim, 'red', fixedRedCenter);
  const frontCell = Math.max(0, Math.min(sim.width - 1, Math.round(frontX)));
  const internals = sim as unknown as { collapseBlue: Uint8Array };
  const blueCity = sim.cities.find((city) => city.id === 'b');
  return {
    t,
    frontX,
    blueCityOwner: blueCity?.owner ?? 'unknown',
    blueCityBaseProduction: blueCity?.baseProduction ?? 0,
    blueCommitted: blue.committed,
    blueReserve: blue.reserve,
    redCommitted: red.committed,
    redReserve: red.reserve,
    fixedBlueCommitted: fixedBlue.committed,
    fixedBlueReserve: fixedBlue.reserve,
    fixedRedCommitted: fixedRed.committed,
    fixedRedReserve: fixedRed.reserve,
    totalWarBlue: total(sim.warBlue),
    totalWarRed: total(sim.warRed),
    blueInstability: sim.instabilityBlue[frontCell],
    blueCollapse: internals.collapseBlue[frontCell],
  };
}

function commitmentTransition(): CommitmentSample[] {
  const map: MapDefinition = {
    width: 9,
    height: 1,
    initialFrontX: () => 4,
    rivers: [],
    forests: [],
    cities: [],
  };
  const sim = new Simulation(map, 1);
  sim.warBlue.fill(0);
  sim.warRed.fill(0);
  sim.warBlue[3] = 10;
  sim.warRed[5] = 1;

  const internals = sim as unknown as { computeFrontMassAndNeed(): void };
  const samples: CommitmentSample[] = [];
  for (let step = 0; step < ticks(4); step++) {
    internals.computeFrontMassAndNeed();
    if (step % ticks(0.2) === 0) {
      samples.push({
        phase: 'engage',
        t: (step + 1) * CFG.dt,
        committed: sim.committedBlue[3],
        reserve: sim.warBlue[3] - sim.committedBlue[3],
      });
    }
  }

  sim.warRed.fill(0);
  sim.control.fill(1);
  for (let step = 0; step < ticks(12); step++) {
    internals.computeFrontMassAndNeed();
    if (step % ticks(0.6) === 0) {
      samples.push({
        phase: 'release',
        t: (step + 1) * CFG.dt,
        committed: sim.committedBlue[3],
        reserve: sim.warBlue[3] - sim.committedBlue[3],
      });
    }
  }
  return samples;
}

function recoveryScenario(outageSeconds: number): RecoverySample[] {
  const width = 80;
  const sim = new Simulation(oneDimensionalMap(width), 12345);
  for (let step = 0; step < ticks(75); step++) sim.tick();
  const fixedFrontX = frontPosition1D(sim, width);
  const blue = sim.cities.find((city) => city.id === 'b');
  if (!blue) throw new Error('Blue city missing');
  blue.baseProduction = 0;

  const samples: RecoverySample[] = [];
  const totalSeconds = outageSeconds + 220;
  for (let step = 0; step <= ticks(totalSeconds); step++) {
    const t = step * CFG.dt;
    if (t >= outageSeconds) blue.baseProduction = 4;
    sim.tick();
    if (step % ticks(5) === 0) samples.push(snapshotRecoverySample(sim, t, fixedFrontX));
  }
  return samples;
}

function tippingScenario(): TippingSample[] {
  const durations = [30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360, 420, 480];
  const rows: TippingSample[] = [];
  for (const duration of durations) {
    const width = 80;
    const sim = new Simulation(oneDimensionalMap(width), 12345);
    for (let step = 0; step < ticks(75); step++) sim.tick();
    const start = frontPosition1D(sim, width);
    const blue = sim.cities.find((city) => city.id === 'b');
    if (!blue) throw new Error('Blue city missing');
    blue.baseProduction = 0;
    for (let i = 0; i < ticks(duration); i++) sim.tick();
    blue.baseProduction = 4;
    for (let i = 0; i < ticks(240); i++) sim.tick();
    const final = frontPosition1D(sim, width);
    rows.push({
      duration,
      loss: start - final,
      final,
      owner: sim.cities.find((city) => city.id === 'b')?.owner ?? 'unknown',
    });
  }
  return rows;
}

function escapeXml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function plotSvg(title: string, description: string, xLabel: string, yLabel: string, series: Series[]): string {
  const width = 920;
  const height = 560;
  const pad = { left: 74, right: 28, top: 88, bottom: 78 };
  const xs = series.flatMap((s) => s.values.map((v) => v.x));
  const ys = series.flatMap((s) => s.values.map((v) => v.y));
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(0, ...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const sx = (x: number) => pad.left + ((x - minX) / spanX) * (width - pad.left - pad.right);
  const sy = (y: number) => height - pad.bottom - ((y - minY) / spanY) * (height - pad.top - pad.bottom);
  const grid = Array.from({ length: 6 }, (_, i) => {
    const t = i / 5;
    const y = pad.top + t * (height - pad.top - pad.bottom);
    const value = maxY - t * spanY;
    return `<line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" stroke="#ddd4bd"/><text x="${pad.left - 10}" y="${y + 4}" text-anchor="end">${value.toFixed(1)}</text>`;
  }).join('');
  const paths = series.map((s) => {
    const d = s.values.map((point, i) => `${i === 0 ? 'M' : 'L'} ${sx(point.x).toFixed(2)} ${sy(point.y).toFixed(2)}`).join(' ');
    return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.4"/>`;
  }).join('');
  const legend = series.map((s, i) =>
    `<g transform="translate(${pad.left + i * 190}, ${height - 28})"><line x1="0" y1="0" x2="24" y2="0" stroke="${s.color}" stroke-width="3"/><text x="32" y="4">${s.label}</text></g>`,
  ).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#f7efd7"/>
  <style>text{font:13px ui-sans-serif,system-ui,sans-serif;fill:#2f2b24}.title{font-size:22px;font-weight:700}.desc{font-size:13px;fill:#5f5544}.axis{font-weight:700}</style>
  <text class="title" x="${pad.left}" y="32">${escapeXml(title)}</text>
  <text class="desc" x="${pad.left}" y="56">${escapeXml(description)}</text>
  ${grid}
  <line x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}" stroke="#2f2b24"/>
  <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${height - pad.bottom}" stroke="#2f2b24"/>
  <text class="axis" x="${width / 2}" y="${height - 18}" text-anchor="middle">${escapeXml(xLabel)}</text>
  <text class="axis" x="20" y="${height / 2}" transform="rotate(-90 20 ${height / 2})" text-anchor="middle">${escapeXml(yLabel)}</text>
  ${paths}
  ${legend}
</svg>
`;
}

describe('committed/reserve diagnostics', () => {
  let commitment: CommitmentSample[];
  let recoverySuccess: RecoverySample[];
  let recoveryFailed: RecoverySample[];
  let tipping: TippingSample[];
  let cityFlow: CityFlowSample[];

  beforeAll(() => {
    commitment = commitmentTransition();
    recoverySuccess = recoveryScenario(60);
    recoveryFailed = recoveryScenario(150);
    tipping = tippingScenario();
    cityFlow = cityFlowDiagnostics();

    const engage = commitment.filter((row) => row.phase === 'engage');
    const release = commitment.filter((row) => row.phase === 'release');
    writeText('engagement-transition.csv', csv(engage));
    writeText('release-transition.csv', csv(release));
    writeText('recovery-success.csv', csv(recoverySuccess));
    writeText('recovery-failed.csv', csv(recoveryFailed));
    writeText('tipping.csv', csv(tipping));
    writeText('city-flow.csv', csv(cityFlow));
    writeText('engagement-transition.svg', plotSvg(
      'Engagement transition',
      'Enemy contact causes mobile reserve to become committed combat mass over time.',
      'seconds',
      'resource',
      [
        { label: 'committed', color: '#235d9f', values: engage.map((row) => ({ x: row.t, y: row.committed })) },
        { label: 'reserve', color: '#7aa8cf', values: engage.map((row) => ({ x: row.t, y: row.reserve })) },
      ],
    ));
    writeText('release-transition.svg', plotSvg(
      'Release transition',
      'After the active front disappears, committed mass returns gradually to mobile reserve.',
      'seconds',
      'resource',
      [
        { label: 'committed', color: '#235d9f', values: release.map((row) => ({ x: row.t, y: row.committed })) },
        { label: 'reserve', color: '#7aa8cf', values: release.map((row) => ({ x: row.t, y: row.reserve })) },
      ],
    ));
    writeText('recovery-success-mass.svg', plotSvg(
      'Blue production recovery succeeds - mass',
      'Blue production is cut for 60s, then restored before capture; Blue mass returns while Red keeps producing.',
      'seconds',
      'front-local resource',
      [
        { label: 'blue committed', color: '#235d9f', values: recoverySuccess.map((row) => ({ x: row.t, y: row.blueCommitted })) },
        { label: 'blue reserve', color: '#7aa8cf', values: recoverySuccess.map((row) => ({ x: row.t, y: row.blueReserve })) },
        { label: 'red committed', color: '#9f342d', values: recoverySuccess.map((row) => ({ x: row.t, y: row.redCommitted })) },
        { label: 'red reserve', color: '#d48479', values: recoverySuccess.map((row) => ({ x: row.t, y: row.redReserve })) },
      ],
    ));
    writeText('recovery-success-front.svg', plotSvg(
      'Blue production recovery succeeds - front',
      'Blue production is restored at t=60s; the city remains Blue and the front avoids irreversible collapse.',
      'seconds',
      'front x',
      [
        { label: 'front', color: '#2f2b24', values: recoverySuccess.map((row) => ({ x: row.t, y: row.frontX })) },
        { label: 'blue instability x30', color: '#b27619', values: recoverySuccess.map((row) => ({ x: row.t, y: row.blueInstability * 30 })) },
      ],
    ));
    writeText('recovery-failed-mass.svg', plotSvg(
      'Blue production recovery fails - mass',
      'Blue production is cut for 150s; by restoration the front has crossed the capture threshold, so Blue mass cannot recover.',
      'seconds',
      'front-local resource',
      [
        { label: 'blue committed', color: '#235d9f', values: recoveryFailed.map((row) => ({ x: row.t, y: row.blueCommitted })) },
        { label: 'blue reserve', color: '#7aa8cf', values: recoveryFailed.map((row) => ({ x: row.t, y: row.blueReserve })) },
        { label: 'red committed', color: '#9f342d', values: recoveryFailed.map((row) => ({ x: row.t, y: row.redCommitted })) },
        { label: 'red reserve', color: '#d48479', values: recoveryFailed.map((row) => ({ x: row.t, y: row.redReserve })) },
      ],
    ));
    writeText('recovery-failed-front.svg', plotSvg(
      'Blue production recovery fails - front',
      'Blue production is restored at t=150s, but the city is captured and the outage has become irreversible.',
      'seconds',
      'front x',
      [
        { label: 'front', color: '#2f2b24', values: recoveryFailed.map((row) => ({ x: row.t, y: row.frontX })) },
        { label: 'blue instability x30', color: '#b27619', values: recoveryFailed.map((row) => ({ x: row.t, y: row.blueInstability * 30 })) },
      ],
    ));
    writeText('tipping.svg', plotSvg(
      'Temporary outage tipping curve',
      'Short outages are absorbed; longer outages cross a threshold into lasting territorial loss.',
      'outage seconds',
      'territorial loss',
      [
        { label: 'loss', color: '#7f231e', values: tipping.map((row) => ({ x: row.duration, y: row.loss })) },
      ],
    ));
  }, 30000);

  afterAll(() => {
    const successEvents = recoveryEvents(diagnostics('recovery-success.csv'));
    const failedEvents = recoveryEvents(diagnostics('recovery-failed.csv'));

    for (const graph of ['recovery-success-mass.svg', 'recovery-success-front.svg']) {
      annotateTimelineSvg(diagnostics(graph), diagnostics('recovery-success.csv'), successEvents);
    }
    for (const graph of ['recovery-failed-mass.svg', 'recovery-failed-front.svg']) {
      annotateTimelineSvg(diagnostics(graph), diagnostics('recovery-failed.csv'), failedEvents);
    }

    annotateTimelineSvg(
      diagnostics('engagement-transition.svg'),
      diagnostics('engagement-transition.csv'),
      firstSampleEvent(diagnostics('engagement-transition.csv'), 'enemy contact'),
    );
    annotateTimelineSvg(
      diagnostics('release-transition.svg'),
      diagnostics('release-transition.csv'),
      firstSampleEvent(diagnostics('release-transition.csv'), 'contact removed'),
    );
  });

  it('produces commitment samples', () => {
    expect(commitment.length).toBeGreaterThan(0);
  });

  it('produces recovery-success samples', () => {
    expect(recoverySuccess.length).toBeGreaterThan(0);
  });

  it('keeps the blue city after a recoverable outage', () => {
    expect(recoverySuccess.at(-1)?.blueCityOwner).toBe('blue');
  });

  it('restores blue mass after a recoverable outage', () => {
    const postRestore = recoverySuccess.filter((row) => row.t >= 90);
    const maxBlueMass = Math.max(...postRestore.map((row) => row.blueCommitted + row.blueReserve));
    expect(maxBlueMass).toBeGreaterThan(20);
  });

  it('loses the blue city after an unrecoverable outage', () => {
    expect(recoveryFailed.at(-1)?.blueCityOwner).toBe('red');
  });

  it('produces tipping samples', () => {
    expect(tipping.length).toBeGreaterThan(0);
  });

  it('produces sufficient maximum tipping loss', () => {
    expect(Math.max(...tipping.map((row) => row.loss))).toBeGreaterThan(8);
  });

  it('produces city-flow samples', () => {
    expect(cityFlow.length).toBeGreaterThan(0);
  });

  it('keeps visible local resource at all active cities', () => {
    const finalTime = Math.max(...cityFlow.map((row) => row.t));
    const finalRows = cityFlow.filter((row) => row.t === finalTime);
    expect(Math.min(...finalRows.map((row) => row.ownWarLocal))).toBeGreaterThan(1);
  });

  it('keeps outgoing flow at all active cities', () => {
    const finalTime = Math.max(...cityFlow.map((row) => row.t));
    const finalRows = cityFlow.filter((row) => row.t === finalTime);
    expect(Math.min(...finalRows.map((row) => row.localFlow))).toBeGreaterThan(0.1);
  });
});
