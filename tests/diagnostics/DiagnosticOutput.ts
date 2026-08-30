import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Series {
  label: string;
  color: string;
  values: Array<{ x: number; y: number }>;
}

const outDir = resolve(dirname(fileURLToPath(import.meta.url)));

export const diagnosticPath = (name: string): string => resolve(outDir, name);

export function csv<T extends object>(rows: T[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]) as Array<keyof T>;
  return [
    headers.map(String).join(','),
    ...rows.map((row) => headers.map((header) => String(row[header])).join(',')),
  ].join('\n') + '\n';
}

export function writeDiagnostic(name: string, text: string): void {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(diagnosticPath(name), text);
}

function escapeXml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function plotSvg(
  title: string,
  description: string,
  xLabel: string,
  yLabel: string,
  series: Series[],
): string {
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
