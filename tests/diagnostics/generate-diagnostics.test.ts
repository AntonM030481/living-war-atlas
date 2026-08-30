import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { annotateTimelineSvg, firstSampleEvent, recoveryEvents } from './EventMarkers';
import { csv, diagnosticPath, plotSvg, writeDiagnostic } from './DiagnosticOutput';
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

function frontPosition1D(sim: Simulation): number {
  for (let x = 0; x < sim.width - 1; x++) {
    const a = sim.control[x];
    const b = sim.control[x + 1];
    if (a >= 0 && b <= 0) {
      const t = a / (a - b || 1);
      return x + t;
    }
  }
  return sim.control[0] < 0 ? 0 : sim.width - 1;
}

function localMass(
  sim: Simulation,
  side: 'blue' | 'red',
  center: number,
  radius = CFG.massRadius,
): { committed: number; reserve: number } {
  const fields = sim.sides[side];
  let committed = 0;
  let reserve = 0;
  for (let dx = -radius; dx <= radius; dx++) {
    const x = center + dx;
    if (x < 0 || x >= sim.width) continue;
    const weight = 1 - Math.abs(dx) / (radius + 1);
    committed += fields.committed[x] * weight;
    reserve += Math.max(0, fields.war[x] - fields.committed[x]) * weight;
  }
  return { committed, reserve };
}

function total(field: Float32Array): number {
  let sum = 0;
  for (const value of field) sum += value;
  return sum;
}

function localWeightedAggregate(
  snapshot: SimulationSnapshot,
  cx: number,
  cy: number,
  valueAt: (index: number) => number,
  radius = 5 * CFG.spatialScale,
): number {
  let sum = 0;
  for (let dy = -radius; dy <= radius; dy++) {
    const y = cy + dy;
    if (y < 0 || y >= snapshot.height) continue;
    for (let dx = -radius; dx <= radius; dx++) {
      const x = cx + dx;
      if (x < 0 || x >= snapshot.width) continue;
      const distance = Math.hypot(dx, dy);
      if (distance > radius) continue;
      const weight = 1 - distance / (radius + 1);
      sum += valueAt(y * snapshot.width + x) * weight;
    }
  }
  return sum;
}

function localWeightedSum(
  snapshot: SimulationSnapshot,
  field: Float32Array,
  cx: number,
  cy: number,
): number {
  return localWeightedAggregate(snapshot, cx, cy, (index) => field[index]);
}

function localVectorMagnitudeSum(
  snapshot: SimulationSnapshot,
  flowX: Float32Array,
  flowY: Float32Array,
  cx: number,
  cy: number,
): number {
  return localWeightedAggregate(snapshot, cx, cy, (index) => Math.hypot(flowX[index], flowY[index]));
}

function sampleVector(
  snapshot: SimulationSnapshot,
  flowX: Float32Array,
  flowY: Float32Array,
  x: number,
  y: number,
): { x: number; y: number } {
  const ix = Math.max(0, Math.min(snapshot.width - 1, Math.round(x)));
  const iy = Math.max(0, Math.min(snapshot.height - 1, Math.round(y)));
  const i = iy * snapshot.width + ix;
  return { x: flowX[i], y: flowY[i] };
}

function traceCityFlow(
  snapshot: SimulationSnapshot,
  city: City,
): { points: number; averageMagnitude: number; maxMagnitude: number } {
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
    const magnitude = Math.hypot(v.x, v.y);
    if (magnitude < 0.018) {
      stale += 1;
      if (stale > 5) break;
      x += (city.owner === 'blue' ? 1 : -1) * 0.42;
    } else {
      stale = 0;
      magnitudeSum += magnitude;
      magnitudeSamples += 1;
      maxMagnitude = Math.max(maxMagnitude, magnitude);
      x += (v.x / magnitude) * 0.55;
      y += (v.y / magnitude) * 0.55;
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
  const frontX = frontPosition1D(sim);
  const blue = localMass(sim, 'blue', Math.max(0, Math.floor(frontX) - 1));
  const red = localMass(sim, 'red', Math.min(sim.width - 1, Math.ceil(frontX) + 1));
  const fixedBlue = localMass(sim, 'blue', Math.max(0, Math.floor(fixedFrontX) - 1));
  const fixedRed = localMass(sim, 'red', Math.min(sim.width - 1, Math.ceil(fixedFrontX) + 1));
  const frontCell = Math.max(0, Math.min(sim.width - 1, Math.round(frontX)));
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
    totalWarBlue: total(sim.sides.blue.war),
    totalWarRed: total(sim.sides.red.war),
    blueInstability: sim.sides.blue.instability[frontCell],
    blueCollapse: sim.sides.blue.collapse[frontCell],
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
  sim.sides.blue.war.fill(0);
  sim.sides.red.war.fill(0);
  sim.sides.blue.war[3] = 10;
  sim.sides.red.war[5] = 1;

  const computeFrontMassAndNeed = (sim as unknown as { computeFrontMassAndNeed(): void }).computeFrontMassAndNeed.bind(sim);
  const samples: CommitmentSample[] = [];
  for (let step = 0; step < ticks(4); step++) {
    computeFrontMassAndNeed();
    if (step % ticks(0.2) === 0) {
      samples.push({
        phase: 'engage',
        t: (step + 1) * CFG.dt,
        committed: sim.sides.blue.committed[3],
        reserve: sim.sides.blue.war[3] - sim.sides.blue.committed[3],
      });
    }
  }

  sim.sides.red.war.fill(0);
  sim.control.fill(1);
  for (let step = 0; step < ticks(12); step++) {
    computeFrontMassAndNeed();
    if (step % ticks(0.6) === 0) {
      samples.push({
        phase: 'release',
        t: (step + 1) * CFG.dt,
        committed: sim.sides.blue.committed[3],
        reserve: sim.sides.blue.war[3] - sim.sides.blue.committed[3],
      });
    }
  }
  return samples;
}

function recoveryScenario(outageSeconds: number): RecoverySample[] {
  const sim = new Simulation(oneDimensionalMap(), 12345);
  for (let step = 0; step < ticks(75); step++) sim.tick();
  const fixedFrontX = frontPosition1D(sim);
  const blue = sim.cities.find((city) => city.id === 'b');
  if (!blue) throw new Error('Blue city missing');
  blue.baseProduction = 0;

  const samples: RecoverySample[] = [];
  for (let step = 0; step <= ticks(outageSeconds + 220); step++) {
    const t = step * CFG.dt;
    if (t >= outageSeconds) blue.baseProduction = 4;
    sim.tick();
    if (step % ticks(5) === 0) samples.push(snapshotRecoverySample(sim, t, fixedFrontX));
  }
  return samples;
}

function tippingScenario(): TippingSample[] {
  const durations = [30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360, 420, 480];
  return durations.map((duration) => {
    const sim = new Simulation(oneDimensionalMap(), 12345);
    for (let step = 0; step < ticks(75); step++) sim.tick();
    const start = frontPosition1D(sim);
    const blue = sim.cities.find((city) => city.id === 'b');
    if (!blue) throw new Error('Blue city missing');
    blue.baseProduction = 0;
    for (let step = 0; step < ticks(duration); step++) sim.tick();
    blue.baseProduction = 4;
    for (let step = 0; step < ticks(240); step++) sim.tick();
    const final = frontPosition1D(sim);
    return {
      duration,
      loss: start - final,
      final,
      owner: sim.cities.find((city) => city.id === 'b')?.owner ?? 'unknown',
    };
  });
}

function writeCommitmentDiagnostics(commitment: CommitmentSample[]): void {
  const engage = commitment.filter((row) => row.phase === 'engage');
  const release = commitment.filter((row) => row.phase === 'release');
  writeDiagnostic('engagement-transition.csv', csv(engage));
  writeDiagnostic('release-transition.csv', csv(release));
  writeDiagnostic('engagement-transition.svg', plotSvg(
    'Engagement transition',
    'Enemy contact causes mobile reserve to become committed combat mass over time.',
    'seconds',
    'resource',
    [
      { label: 'committed', color: '#235d9f', values: engage.map((row) => ({ x: row.t, y: row.committed })) },
      { label: 'reserve', color: '#7aa8cf', values: engage.map((row) => ({ x: row.t, y: row.reserve })) },
    ],
  ));
  writeDiagnostic('release-transition.svg', plotSvg(
    'Release transition',
    'After the active front disappears, committed mass returns gradually to mobile reserve.',
    'seconds',
    'resource',
    [
      { label: 'committed', color: '#235d9f', values: release.map((row) => ({ x: row.t, y: row.committed })) },
      { label: 'reserve', color: '#7aa8cf', values: release.map((row) => ({ x: row.t, y: row.reserve })) },
    ],
  ));
}

function writeRecoveryDiagnostics(name: 'success' | 'failed', samples: RecoverySample[], outageSeconds: number): void {
  const csvName = `recovery-${name}.csv`;
  writeDiagnostic(csvName, csv(samples));
  writeDiagnostic(`recovery-${name}-mass.svg`, plotSvg(
    `Blue production recovery ${name} - mass`,
    name === 'success'
      ? 'Blue production is cut for 60s, then restored; local Blue mass recovers while Red keeps producing.'
      : 'Blue production is cut for 150s, then restored; the longer outage leaves greater territorial damage.',
    'seconds',
    'front-local resource',
    [
      { label: 'blue committed', color: '#235d9f', values: samples.map((row) => ({ x: row.t, y: row.blueCommitted })) },
      { label: 'blue reserve', color: '#7aa8cf', values: samples.map((row) => ({ x: row.t, y: row.blueReserve })) },
      { label: 'red committed', color: '#9f342d', values: samples.map((row) => ({ x: row.t, y: row.redCommitted })) },
      { label: 'red reserve', color: '#d48479', values: samples.map((row) => ({ x: row.t, y: row.redReserve })) },
    ],
  ));
  writeDiagnostic(`recovery-${name}-front.svg`, plotSvg(
    `Blue production recovery ${name} - front`,
    `Blue production is restored at t=${outageSeconds}s; ${name === 'success' ? 'the short outage remains recoverable.' : 'the longer outage is compared against the short outage rather than assuming city capture.'}`,
    'seconds',
    'front x',
    [
      { label: 'front', color: '#2f2b24', values: samples.map((row) => ({ x: row.t, y: row.frontX })) },
      { label: 'blue instability x30', color: '#b27619', values: samples.map((row) => ({ x: row.t, y: row.blueInstability * 30 })) },
    ],
  ));
}

function blueLocalMass(row: RecoverySample): number {
  return row.blueCommitted + row.blueReserve;
}

function sampleAtOrAfter(samples: RecoverySample[], t: number): RecoverySample {
  const sample = samples.find((row) => row.t >= t);
  if (!sample) throw new Error(`Recovery sample missing at t>=${t}`);
  return sample;
}

describe('commitment diagnostics', () => {
  let samples: CommitmentSample[];

  beforeAll(() => {
    samples = commitmentTransition();
    writeCommitmentDiagnostics(samples);
  });

  afterAll(() => {
    annotateTimelineSvg(
      diagnosticPath('engagement-transition.svg'),
      diagnosticPath('engagement-transition.csv'),
      firstSampleEvent(diagnosticPath('engagement-transition.csv'), 'enemy contact'),
    );
    annotateTimelineSvg(
      diagnosticPath('release-transition.svg'),
      diagnosticPath('release-transition.csv'),
      firstSampleEvent(diagnosticPath('release-transition.csv'), 'contact removed'),
    );
  });

  it('produces commitment samples', () => {
    expect(samples.length).toBeGreaterThan(0);
  });
});

describe('recovery diagnostics', () => {
  let success: RecoverySample[];
  let failed: RecoverySample[];

  beforeAll(() => {
    success = recoveryScenario(60);
    writeRecoveryDiagnostics('success', success, 60);
  }, 60000);

  beforeAll(() => {
    failed = recoveryScenario(150);
    writeRecoveryDiagnostics('failed', failed, 150);
  }, 60000);

  afterAll(() => {
    for (const name of ['success', 'failed'] as const) {
      const csvPath = diagnosticPath(`recovery-${name}.csv`);
      const events = recoveryEvents(csvPath);
      for (const graph of [`recovery-${name}-mass.svg`, `recovery-${name}-front.svg`]) {
        annotateTimelineSvg(diagnosticPath(graph), csvPath, events);
      }
    }
  });

  it('produces recovery-success samples', () => {
    expect(success.length).toBeGreaterThan(0);
  });

  it('keeps the blue city after a recoverable outage', () => {
    expect(success.at(-1)?.blueCityOwner).toBe('blue');
  });

  it('restores blue mass after a recoverable outage', () => {
    const atRestore = blueLocalMass(sampleAtOrAfter(success, 60));
    const postRestorePeak = Math.max(...success.filter((row) => row.t >= 90).map(blueLocalMass));
    expect(postRestorePeak).toBeGreaterThan(atRestore);
  });

  it('leaves more territorial loss after the longer outage', () => {
    const shortFinal = success.at(-1);
    const longFinal = failed.at(-1);
    expect(shortFinal).toBeDefined();
    expect(longFinal).toBeDefined();
    expect(longFinal!.frontX).toBeLessThan(shortFinal!.frontX);
  });
});

describe('tipping diagnostics', () => {
  let samples: TippingSample[];

  beforeAll(() => {
    samples = tippingScenario();
    writeDiagnostic('tipping.csv', csv(samples));
    writeDiagnostic('tipping.svg', plotSvg(
      'Temporary outage tipping curve',
      'Short outages are absorbed; longer outages cross a threshold into lasting territorial loss.',
      'outage seconds',
      'territorial loss',
      [{ label: 'loss', color: '#7f231e', values: samples.map((row) => ({ x: row.duration, y: row.loss })) }],
    ));
  }, 120000);

  it('produces tipping samples', () => {
    expect(samples.length).toBeGreaterThan(0);
  });

  it('produces sufficient maximum tipping loss', () => {
    expect(Math.max(...samples.map((row) => row.loss))).toBeGreaterThan(8);
  });
});

describe('city-flow diagnostics', () => {
  let samples: CityFlowSample[];

  beforeAll(() => {
    samples = cityFlowDiagnostics();
    writeDiagnostic('city-flow.csv', csv(samples));
  }, 60000);

  it('produces city-flow samples', () => {
    expect(samples.length).toBeGreaterThan(0);
  });

  it('keeps visible local resource at all active cities', () => {
    const finalTime = Math.max(...samples.map((row) => row.t));
    const finalRows = samples.filter((row) => row.t === finalTime);
    expect(Math.min(...finalRows.map((row) => row.ownWarLocal))).toBeGreaterThan(1);
  });

  it('keeps outgoing flow at all active cities', () => {
    const finalTime = Math.max(...samples.map((row) => row.t));
    const finalRows = samples.filter((row) => row.t === finalTime);
    expect(Math.min(...finalRows.map((row) => row.localFlow))).toBeGreaterThan(0.1);
  });
});