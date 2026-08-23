import type { PointDebugInfo } from '../diagnostics/types';

function fmt(value: number): string {
  return value.toFixed(Math.abs(value) >= 10 ? 1 : 3);
}

export class PointProbe {
  readonly element: HTMLDetailsElement;
  private readonly content: HTMLDivElement;

  constructor() {
    this.element = document.createElement('details');
    this.element.className = 'probe-panel';
    this.element.open = true;
    const summary = document.createElement('summary');
    summary.innerHTML = '<b>POINT PROBE</b>';
    this.content = document.createElement('div');
    this.element.append(summary, this.content);
    this.render(null);
  }

  render(info: PointDebugInfo | null): void {
    if (!info) {
      this.content.className = 'probe-empty';
      this.content.textContent = 'click any map point';
      return;
    }

    const row = (label: string, value: string) =>
      `<div class="probe-row"><span>${label}</span><b>${value}</b></div>`;

    const contested = Math.abs(info.control) < 0.72;
    const sideRows = contested
      ? [
          ['war', info.warBlue, info.warRed],
          ['flow', info.flowBlue, info.flowRed],
          ['access', info.accessBlue, info.accessRed],
          ['free cap', info.freeCapacityBlue, info.freeCapacityRed],
        ] as const
      : null;
    const blue = info.control > 0;
    const sideName = blue ? 'Blue' : 'Red';
    const singleRows = [
      ['war', blue ? info.warBlue : info.warRed],
      ['flow', blue ? info.flowBlue : info.flowRed],
      ['access', blue ? info.accessBlue : info.accessRed],
      ['free cap', blue ? info.freeCapacityBlue : info.freeCapacityRed],
    ] as const;

    this.content.className = '';
    this.content.innerHTML = `
      ${row('cell', `${info.cellX}, ${info.cellY}`)}
      ${row('control', fmt(info.control))}
      ${row('cell capacity', fmt(info.cellCapacity))}
      ${contested ? `
        <div class="probe-split">
          <b></b><b>Blue</b><b>Red</b>
          ${sideRows!.map(([label, blueValue, redValue]) =>
            `<span>${label}</span><code>${fmt(blueValue)}</code><code>${fmt(redValue)}</code>`,
          ).join('')}
        </div>
      ` : `
        <div class="probe-split">
          <b></b><b>${sideName}</b><b></b>
          ${singleRows.map(([label, value]) =>
            `<span>${label}</span><code>${fmt(value)}</code><code></code>`,
          ).join('')}
        </div>
      `}
      ${row('terrain def/mob', `${fmt(info.terrainDefense)} / ${fmt(info.terrainMobility)}`)}
    `;
  }
}
