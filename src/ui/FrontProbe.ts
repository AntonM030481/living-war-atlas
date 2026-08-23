import type { FrontDebugInfo } from '../diagnostics/types';

function fmt(value: number): string {
  return value.toFixed(Math.abs(value) >= 10 ? 1 : 3);
}

const HELP: Record<string, string> = {
  'x,y': 'World coordinates of the inspected front point.',
  radius: 'Sampling radius.',
  'avg control': 'Average local control; +1 is Blue, -1 is Red.',
  'avg war': 'Average war resource near the front.',
  'avg mass': 'Average committed front mass.',
  'avg incoming': 'Average incoming resource.',
  'avg drain': 'Average resource drain from combat and pressure.',
  'advance raw': 'Unclamped advance tendency.',
  'stress raw': 'Raw instability/stress.',
  'avg instab': 'Average accumulated front instability.',
  'avg flow': 'Average resource flow.',
  'sum war': 'Total war resource.',
  'sum drain': 'Total resource drain.',
  'avg raw force': 'Net front movement force before clamping.',
  'avg clamped force': 'Net front movement force after clamping.',
  'avg pressure': 'Local pressure driving front movement.',
  'avg terrain def/mob': 'Average terrain defense / mobility multiplier.',
};

export class FrontProbe {
  readonly element: HTMLDetailsElement;
  private readonly content: HTMLDivElement;

  constructor() {
    this.element = document.createElement('details');
    this.element.className = 'probe-panel';
    this.element.open = true;
    const summary = document.createElement('summary');
    summary.innerHTML = '<b>FRONT PROBE</b>';
    this.content = document.createElement('div');
    this.element.append(summary, this.content);
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
      `<div class="probe-row" title="${HELP[label]}"><span>${label}</span><b>${value}</b></div>`;

    this.content.className = '';
    this.content.innerHTML = `
      ${row('x,y', `${info.x.toFixed(1)}, ${info.y.toFixed(1)}`)}
      ${row('radius', String(info.radius))}
      ${row('avg control', fmt(info.control))}
      <div class="probe-split">
        <b></b><b>Blue</b><b>Red</b>
        ${splitRows.map(([label, blue, red]) =>
          `<span title="${HELP[label]}">${label}</span><code title="${HELP[label]}">${fmt(blue)}</code><code title="${HELP[label]}">${fmt(red)}</code>`,
        ).join('')}
      </div>
      ${row('avg raw force', fmt(info.rawForcing))}
      ${row('avg clamped force', fmt(info.forcing))}
      ${row('avg pressure', fmt(info.pressure))}
      ${row('avg terrain def/mob', `${fmt(info.terrainDefense)} / ${fmt(info.terrainMobility)}`)}
    `;
  }
}
