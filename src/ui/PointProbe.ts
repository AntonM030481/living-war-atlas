import type { PointDebugInfo } from '../diagnostics/types';

function fmt(value: number): string {
  return value.toFixed(Math.abs(value) >= 10 ? 1 : 3);
}

const HELP: Record<string, string> = {
  cell: 'Discrete simulation cell coordinates.',
  control: 'Local control: +1 is fully Blue, -1 is fully Red, values near 0 are contested.',
  war: 'War resource currently present in this cell for the shown side.',
  committed: 'War resource committed locally and therefore unavailable for transport.',
  reserve: 'Uncommitted war resource available for transport.',
  flow: 'Current smoothed resource flow through this cell for the shown side.',
  desired: 'Desired outgoing flow rate before route and destination limitations.',
  incoming: 'Actually accepted incoming resource flow rate.',
  access: 'How well this side can reach/supply this cell; 0 means inaccessible, 1 means full access.',
  potential: 'Local transport potential attracting this side toward front demand.',
  gradient: 'Local x/y gradient of transport potential.',
  'terrain def/mob': 'Terrain defense multiplier / mobility multiplier at this cell.',
};

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
      `<div class="probe-row" title="${HELP[label]}"><span>${label}</span><b>${value}</b></div>`;

    const contested = Math.abs(info.control) < 0.72;
    const sideRows = contested
      ? [
          ['war', info.warBlue, info.warRed],
          ['committed', info.committedBlue, info.committedRed],
          ['reserve', info.reserveBlue, info.reserveRed],
          ['flow', info.flowBlue, info.flowRed],
          ['desired', info.desiredBlue, info.desiredRed],
          ['incoming', info.incomingBlue, info.incomingRed],
          ['access', info.accessBlue, info.accessRed],
          ['potential', info.potentialBlue, info.potentialRed],
        ] as const
      : null;
    const blue = info.control > 0;
    const sideName = blue ? 'Blue' : 'Red';
    const singleRows = [
      ['war', blue ? info.warBlue : info.warRed],
      ['committed', blue ? info.committedBlue : info.committedRed],
      ['reserve', blue ? info.reserveBlue : info.reserveRed],
      ['flow', blue ? info.flowBlue : info.flowRed],
      ['desired', blue ? info.desiredBlue : info.desiredRed],
      ['incoming', blue ? info.incomingBlue : info.incomingRed],
      ['access', blue ? info.accessBlue : info.accessRed],
      ['potential', blue ? info.potentialBlue : info.potentialRed],
    ] as const;
    const gradientX = blue ? info.gradientBlueX : info.gradientRedX;
    const gradientY = blue ? info.gradientBlueY : info.gradientRedY;

    this.content.className = '';
    this.content.innerHTML = `
      ${row('cell', `${info.cellX}, ${info.cellY}`)}
      ${row('control', fmt(info.control))}
      ${contested ? `
        <div class="probe-split">
          <b></b><b>Blue</b><b>Red</b>
          ${sideRows!.map(([label, blueValue, redValue]) =>
            `<span title="${HELP[label]}">${label}</span><code title="${HELP[label]}">${fmt(blueValue)}</code><code title="${HELP[label]}">${fmt(redValue)}</code>`,
          ).join('')}
        </div>
        ${row('gradient', `B ${fmt(info.gradientBlueX)}, ${fmt(info.gradientBlueY)} / R ${fmt(info.gradientRedX)}, ${fmt(info.gradientRedY)}`)}
      ` : `
        <div class="probe-split">
          <b></b><b>${sideName}</b><b></b>
          ${singleRows.map(([label, value]) =>
            `<span title="${HELP[label]}">${label}</span><code title="${HELP[label]}">${fmt(value)}</code><code></code>`,
          ).join('')}
        </div>
        ${row('gradient', `${fmt(gradientX)}, ${fmt(gradientY)}`)}
      `}
      ${row('terrain def/mob', `${fmt(info.terrainDefense)} / ${fmt(info.terrainMobility)}`)}
    `;
  }
}
