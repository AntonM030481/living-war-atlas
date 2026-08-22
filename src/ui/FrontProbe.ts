import type { FrontDebugInfo } from '../diagnostics/types';

function fmt(value: number): string {
  return value.toFixed(Math.abs(value) >= 10 ? 1 : 3);
}

export class FrontProbe {
  readonly element: HTMLDivElement;
  private readonly content: HTMLDivElement;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'probe-panel';
    this.element.innerHTML = '<b>FRONT PROBE</b>';
    this.content = document.createElement('div');
    this.element.appendChild(this.content);
    this.render(null);
  }

  render(info: FrontDebugInfo | null): void {
    if (!info) {
      this.content.className = 'probe-empty';
      this.content.textContent = 'click the front line';
      return;
    }

    const splitRows = [
      ['avg war', info.warBlue, info.warRed],
      ['avg mass', info.frontMassBlue, info.frontMassRed],
      ['avg incoming', info.incomingBlue, info.incomingRed],
      ['avg drain', info.drainBlue, info.drainRed],
      ['advance raw', info.advanceBlue, info.advanceRed],
      ['stress raw', info.stressBlue, info.stressRed],
      ['avg instab', info.instabilityBlue, info.instabilityRed],
      ['avg flow', info.flowBlue, info.flowRed],
      ['sum war', info.localWarBlue, info.localWarRed],
      ['sum drain', info.localDrainBlue, info.localDrainRed],
    ] as const;

    const row = (label: string, value: string) =>
      `<div class="probe-row"><span>${label}</span><b>${value}</b></div>`;

    this.content.className = '';
    this.content.innerHTML = `
      ${row('x,y', `${info.x.toFixed(1)}, ${info.y.toFixed(1)}`)}
      ${row('radius', String(info.radius))}
      ${row('avg control', fmt(info.control))}
      <div class="probe-split">
        <b></b><b>Blue</b><b>Red</b>
        ${splitRows.map(([label, blue, red]) =>
          `<span>${label}</span><code>${fmt(blue)}</code><code>${fmt(red)}</code>`,
        ).join('')}
      </div>
      ${row('avg raw force', fmt(info.rawForcing))}
      ${row('avg clamped force', fmt(info.forcing))}
      ${row('avg pressure', fmt(info.pressure))}
      ${row('avg terrain def/mob', `${fmt(info.terrainDefense)} / ${fmt(info.terrainMobility)}`)}
    `;
  }
}
