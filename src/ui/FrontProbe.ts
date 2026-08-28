import type { FrontDebugInfo } from '../diagnostics/types';

function fmt(value: number): string {
  return value.toFixed(Math.abs(value) >= 10 ? 1 : 3);
}

const HELP: Record<string, string> = {
  'x,y': 'Position of the selected point on the rendered front line.',
  'available force': 'Total force physically available inside the sampled front sector, including committed force and local reserve.',
  'combat mass': 'Effective local fighting strength used by combat. It is already aggregated from nearby committed force, so the probe shows its average rather than summing overlapping mass fields.',
  reinforcement: 'Total force arriving into the sampled sector this tick. Compare with loss to see whether the sector is being replenished faster than it is consumed.',
  loss: 'Total force consumed in the sampled sector this tick by maintenance and combat exposure.',
  stress: 'Enemy attack divided by this side’s effective defence. Above 1 instability grows; below 1 the sector tends to recover.',
  instability: 'Accumulated loss of front stability. Sustained stress pushes it toward collapse; lower stress allows recovery.',
  'transport flow': 'Average magnitude of resource transport through the sector, regardless of direction. This is logistics traffic, not necessarily reinforcement delivered to the front.',
  'raw drive': 'Front-moving tendency before the safety clamp. The value is shown only under the side it favours.',
  'front drive': 'Front-moving signal after clamping and used to push territorial control. The value is shown only under the side it favours.',
  'terrain def/mob': 'Average terrain modifiers in the sector. Defence above 1 strengthens resistance to stress; mobility below 1 slows movement and transport.',
};

function favouredDrive(value: number): readonly [string, string] {
  if (value > 0) return [fmt(value), ''];
  if (value < 0) return ['', fmt(-value)];
  return ['', ''];
}

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

    const [rawDriveBlue, rawDriveRed] = favouredDrive(info.rawFrontDrive);
    const [frontDriveBlue, frontDriveRed] = favouredDrive(info.frontDrive);
    const splitRows = [
      ['available force', fmt(info.availableForceBlue), fmt(info.availableForceRed)],
      ['combat mass', fmt(info.combatMassBlue), fmt(info.combatMassRed)],
      ['reinforcement', fmt(info.reinforcementBlue), fmt(info.reinforcementRed)],
      ['loss', fmt(info.lossBlue), fmt(info.lossRed)],
      ['stress', fmt(info.stressBlue), fmt(info.stressRed)],
      ['instability', fmt(info.instabilityBlue), fmt(info.instabilityRed)],
      ['transport flow', fmt(info.transportFlowBlue), fmt(info.transportFlowRed)],
      ['raw drive', rawDriveBlue, rawDriveRed],
      ['front drive', frontDriveBlue, frontDriveRed],
    ] as const;

    const row = (label: string, value: string) =>
      `<div class="probe-row" title="${HELP[label]}"><span>${label}</span><b>${value}</b></div>`;

    this.content.className = '';
    this.content.innerHTML = `
      ${row('x,y', `${info.x.toFixed(1)}, ${info.y.toFixed(1)}`)}
      <div class="probe-split">
        <b></b><b>Blue</b><b>Red</b>
        ${splitRows.map(([label, blue, red]) =>
          `<span title="${HELP[label]}">${label}</span><code title="${HELP[label]}">${blue}</code><code title="${HELP[label]}">${red}</code>`,
        ).join('')}
      </div>
      ${row('terrain def/mob', `${fmt(info.terrainDefense)} / ${fmt(info.terrainMobility)}`)}
    `;
  }
}
