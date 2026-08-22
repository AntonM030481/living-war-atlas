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

    const splitRows = [
      ['war', info.warBlue, info.warRed],
      ['committed', info.committedBlue, info.committedRed],
      ['reserve', info.reserveBlue, info.reserveRed],
      ['incoming', info.incomingBlue, info.incomingRed],
      ['flow', info.flowBlue, info.flowRed],
      ['access', info.accessBlue, info.accessRed],
      ['free cap', info.freeCapacityBlue, info.freeCapacityRed],
      ['utilization', info.utilizationBlue, info.utilizationRed],
      ['instability', info.instabilityBlue, info.instabilityRed],
    ] as const;

    const row = (label: string, value: string) =>
      `<div class="probe-row"><span>${label}</span><b>${value}</b></div>`;

    this.content.className = '';
    this.content.innerHTML = `
      ${row('cell', `${info.cellX}, ${info.cellY}`)}
      ${row('control', fmt(info.control))}
      ${row('cell capacity', fmt(info.cellCapacity))}
      <div class="probe-split">
        <b></b><b>Blue</b><b>Red</b>
        ${splitRows.map(([label, blue, red]) =>
          `<span>${label}</span><code>${fmt(blue)}</code><code>${fmt(red)}</code>`,
        ).join('')}
      </div>
      ${row('terrain def/mob', `${fmt(info.terrainDefense)} / ${fmt(info.terrainMobility)}`)}
    `;
  }
}
