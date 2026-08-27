import { readFileSync, writeFileSync } from 'node:fs';

export interface TimelineEvent {
  t: number;
  label: string;
}

type CsvRow = Record<string, string>;

const PLOT = {
  width: 920,
  left: 74,
  right: 28,
  top: 88,
  bottom: 78,
};

function readCsv(path: string): CsvRow[] {
  const text = readFileSync(path, 'utf8').trim();
  if (!text) return [];
  const [headerLine, ...lines] = text.split(/\r?\n/);
  const headers = headerLine.split(',');
  return lines.map((line) => {
    const values = line.split(',');
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  });
}

function number(row: CsvRow, key: string): number {
  return Number(row[key]);
}

export function recoveryEvents(csvPath: string): TimelineEvent[] {
  const rows = readCsv(csvPath);
  if (rows.length === 0) return [];

  const events: TimelineEvent[] = [];
  const first = rows[0];
  if (number(first, 'blueCityBaseProduction') === 0) {
    events.push({ t: number(first, 't'), label: 'production off' });
  }

  for (let i = 1; i < rows.length; i++) {
    const previous = rows[i - 1];
    const current = rows[i];
    const t = number(current, 't');

    if (previous.blueCityBaseProduction !== current.blueCityBaseProduction) {
      const production = number(current, 'blueCityBaseProduction');
      events.push({ t, label: production > 0 ? 'production restored' : 'production off' });
    }
    if (previous.blueCityOwner !== current.blueCityOwner) {
      events.push({ t, label: `city → ${current.blueCityOwner}` });
    }
    if (previous.blueCollapse !== current.blueCollapse) {
      events.push({ t, label: number(current, 'blueCollapse') === 1 ? 'Blue collapse' : 'Blue recovers' });
    }
  }

  return events;
}

export function firstSampleEvent(csvPath: string, label: string): TimelineEvent[] {
  const rows = readCsv(csvPath);
  return rows.length === 0 ? [] : [{ t: number(rows[0], 't'), label }];
}

export function annotateTimelineSvg(svgPath: string, csvPath: string, events: readonly TimelineEvent[]): void {
  if (events.length === 0) return;
  const rows = readCsv(csvPath);
  if (rows.length === 0) return;

  const times = rows.map((row) => number(row, 't')).filter(Number.isFinite);
  if (times.length === 0) return;
  const minT = Math.min(...times);
  const maxT = Math.max(...times);
  const span = maxT - minT || 1;
  const plotWidth = PLOT.width - PLOT.left - PLOT.right;
  const plotBottom = 560 - PLOT.bottom;

  const markerSvg = events
    .filter((event) => Number.isFinite(event.t) && event.t >= minT && event.t <= maxT)
    .map((event, index) => {
      const x = PLOT.left + ((event.t - minT) / span) * plotWidth;
      const labelY = PLOT.top + 14 + (index % 3) * 17;
      const anchor = x > PLOT.width - 180 ? 'end' : 'start';
      const textX = x + (anchor === 'end' ? -5 : 5);
      const label = `${event.t.toFixed(0)}s · ${event.label}`;
      return `\n  <g class="timeline-event">\n    <line x1="${x.toFixed(2)}" y1="${PLOT.top}" x2="${x.toFixed(2)}" y2="${plotBottom}" stroke="#625a4e" stroke-width="1.2" stroke-dasharray="5 4" opacity="0.72"/>\n    <text x="${textX.toFixed(2)}" y="${labelY}" text-anchor="${anchor}" style="font:12px ui-sans-serif,system-ui,sans-serif;fill:#4b4439;paint-order:stroke;stroke:#f7efd7;stroke-width:4px;stroke-linejoin:round">${label}</text>\n  </g>`;
    })
    .join('');

  if (!markerSvg) return;
  const svg = readFileSync(svgPath, 'utf8');
  writeFileSync(svgPath, svg.replace('</svg>', `${markerSvg}\n</svg>`));
}
