#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const vitestEntry = resolve(root, 'node_modules', 'vitest', 'vitest.mjs');
const MAX_SHARE_RME = 5;
const CHECKPOINTS = [0, 50, 100];

console.log('Running simulation benchmarks sequentially...');

const result = spawnSync(
  process.execPath,
  [vitestEntry, 'bench', 'tests/perf', '--no-file-parallelism'],
  {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      NO_COLOR: '1',
      FORCE_COLOR: '0',
    },
    maxBuffer: 32 * 1024 * 1024,
  },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

if (result.status !== 0) {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
}

const rawOutput = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
const rows = parseBenchmarkRows(rawOutput);

if (rows.size === 0) {
  console.error('Could not parse Vitest benchmark output. Run npm run bench:sim:raw for the full report.');
  process.exit(1);
}

printSimulationTable(rows);
console.log('');
printTickBreakdown(rows);
console.log('');
printPotentialTable(rows);

function parseBenchmarkRows(output) {
  const parsed = new Map();
  for (const rawLine of output.split(/\r?\n/)) {
    const line = stripAnsi(rawLine);
    const start = line.indexOf('theatre');
    if (start < 0) continue;

    const tokens = line.slice(start).trim().split(/\s+/);
    if (tokens.at(-1) === 'fastest') tokens.pop();
    if (tokens.length < 11) continue;

    const stats = tokens.slice(-10);
    const [hz, min, max, mean, p75, p99, p995, p999, rme, samples] = stats;
    if (
      !isNumber(hz)
      || !isNumber(min)
      || !isNumber(max)
      || !isNumber(mean)
      || !isNumber(p75)
      || !isNumber(p99)
      || !isNumber(p995)
      || !isNumber(p999)
      || !/^±[\d.]+%$/.test(rme)
      || !/^\d+$/.test(samples)
    ) continue;

    const name = tokens.slice(0, -10).join(' ');
    parsed.set(name, {
      mean: parseNumber(mean),
      rme: Number(rme.slice(1, -1)),
    });
  }
  return parsed;
}

function stripAnsi(value) {
  return value.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
}

function isNumber(value) {
  return /^\d[\d,]*(?:\.\d+)?$/.test(value);
}

function parseNumber(value) {
  return Number(value.replaceAll(',', ''));
}

function formatMeasurement(row) {
  if (!row) return '-';
  return `${formatMs(row.mean)} ±${row.rme.toFixed(2)}%`;
}

function formatMs(value) {
  if (value >= 1000) return `${value.toFixed(1)} ms`;
  if (value >= 100) return `${value.toFixed(2)} ms`;
  if (value >= 10) return `${value.toFixed(2)} ms`;
  if (value >= 1) return `${value.toFixed(3)} ms`;
  return `${value.toFixed(4)} ms`;
}

function printSimulationTable(rows) {
  console.log('Simulation benchmark — theatre');
  printCheckpointTable(
    ['metric', '0 ticks', '50 ticks', '100 ticks'],
    [
      ['1 tick + potential', ...checkpointMeasurements(rows, '1 tick with potential rebuild')],
      ['10 ticks', ...checkpointMeasurements(rows, '10 ticks (1 potential cadence)')],
    ],
  );

  console.log('');
  printTwoColumnTable([
    ['reset harness', formatMeasurement(rows.get('theatre: reset canonical Full Playground state'))],
    ['100 ticks from start', formatMeasurement(rows.get('theatre: 100 ticks from Full Playground start'))],
  ]);
}

function printTickBreakdown(rows) {
  console.log('Heavy tick breakdown — theatre');
  const stages = [
    ['cities', 'tick stage / cities'],
    ['front mass+need', 'tick stage / front mass+need'],
    ['potential / both', 'potential rebuild / both sides'],
    ['transport', 'tick stage / transport'],
    ['combat', 'tick stage / combat'],
    ['control', 'tick stage / control'],
  ];

  const dataRows = stages.map(([label, suffix]) => [
    label,
    ...checkpointMeasurements(rows, suffix),
  ]);

  const sums = CHECKPOINTS.map((ticks) => {
    const stageRows = stages.map(([, suffix]) => rows.get(`theatre @ ${ticks} ticks: ${suffix}`));
    if (stageRows.some((row) => !row)) return '-';
    return formatMs(stageRows.reduce((sum, row) => sum + row.mean, 0));
  });

  const heavy = CHECKPOINTS.map((ticks) =>
    rows.get(`theatre @ ${ticks} ticks: 1 tick with potential rebuild`),
  );
  const unaccounted = CHECKPOINTS.map((ticks, index) => {
    const heavyRow = heavy[index];
    const stageRows = stages.map(([, suffix]) => rows.get(`theatre @ ${ticks} ticks: ${suffix}`));
    if (!heavyRow || stageRows.some((row) => !row)) return '-';
    const sum = stageRows.reduce((total, row) => total + row.mean, 0);
    return formatMs(heavyRow.mean - sum);
  });

  dataRows.push(
    ['sum stages', ...sums],
    ['heavy tick', ...heavy.map(formatMeasurement)],
    ['unaccounted', ...unaccounted],
  );

  printCheckpointTable(
    ['stage', '0 ticks', '50 ticks', '100 ticks'],
    dataRows,
  );
}

function printPotentialTable(rows) {
  console.log('Potential benchmark — theatre, blue stages');
  const stages = [
    ['prepare', 'potential stage / prepare'],
    ['fine stencil', 'potential stage / fine stencil'],
    ['coarse grid', 'potential stage / coarse grid'],
    ['dijkstra', 'potential stage / dijkstra'],
    ['coarse stencil', 'potential stage / coarse stencil'],
    ['coarse relaxation', 'potential stage / coarse relaxation'],
    ['projection', 'potential stage / projection'],
    ['fine relaxation', 'potential stage / fine relaxation'],
    ['full rebuild / blue', 'potential rebuild / blue'],
    ['full rebuild / both', 'potential rebuild / both sides'],
  ];

  printCheckpointTable(
    ['stage', '0 ticks', '50 ticks', '100 ticks'],
    stages.map(([label, suffix]) => [label, ...checkpointMeasurements(rows, suffix)]),
  );

  const shares = CHECKPOINTS.map((ticks) => {
    const coarse = rows.get(`theatre @ ${ticks} ticks: potential stage / coarse relaxation`);
    const fine = rows.get(`theatre @ ${ticks} ticks: potential stage / fine relaxation`);
    const rebuild = rows.get(`theatre @ ${ticks} ticks: potential rebuild / blue`);
    if (!coarse || !fine || !rebuild || rebuild.mean <= 0) return '-';
    if (Math.max(coarse.rme, fine.rme, rebuild.rme) > MAX_SHARE_RME) return 'unstable';
    return `${(((coarse.mean + fine.mean) / rebuild.mean) * 100).toFixed(1)}%`;
  });

  console.log('');
  printCheckpointTable(
    ['share', '0 ticks', '50 ticks', '100 ticks'],
    [['relaxation only / blue rebuild', ...shares]],
  );

  const unstableCount = [...rows.values()].filter((row) => row.rme > MAX_SHARE_RME).length;
  if (unstableCount > 0) {
    console.log(`\nWarning: ${unstableCount} measurements have RME > ${MAX_SHARE_RME}%; treat them as noisy.`);
  }
}

function checkpointMeasurements(rows, suffix) {
  return CHECKPOINTS.map((ticks) =>
    formatMeasurement(rows.get(`theatre @ ${ticks} ticks: ${suffix}`)),
  );
}

function printCheckpointTable(headers, dataRows) {
  printTable([headers, ...dataRows]);
}

function printTwoColumnTable(rows) {
  printTable([['metric', 'result'], ...rows]);
}

function printTable(rows) {
  const widths = rows[0].map((_, column) =>
    Math.max(...rows.map((row) => String(row[column] ?? '').length)),
  );

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    console.log(row.map((cell, column) => {
      const value = String(cell ?? '');
      return column === 0
        ? value.padEnd(widths[column])
        : value.padStart(widths[column]);
    }).join('  '));

    if (rowIndex === 0) {
      console.log(widths.map((width) => '-'.repeat(width)).join('  '));
    }
  }
}
