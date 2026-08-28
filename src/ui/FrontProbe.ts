import type { FrontDebugInfo } from '../diagnostics/types';

function fmt(value: number): string {
  return value.toFixed(Math.abs(value) >= 10 ? 1 : 3);
}

const HELP: Record<string, string> = {
  'x,y': 'Position of the selected point on the rendered front line.',
  'avg control': 'Who currently owns the neighbourhood: positive values favour Blue, negative values favour Red, and values near 0 are the active boundary.',
  'avg force': 'Force physically present near this part of the front. This includes both committed and movable reserve.',
  'avg mass': 'Effective local front strength used by combat. It is built from nearby committed force, so this is the main quantity opponents compare at the front.',
  'avg incoming': 'Force currently arriving from the rear. High incoming flow means this front sector is being reinforced now.',
  'avg drain': 'Force lost this tick to maintenance and combat exposure near the front. Compare it with incoming to see whether the sector is being replenished faster than it is consumed.',
  'advance raw': 'This side’s local tendency to advance before Blue and Red are combined. It grows when the enemy is overstressed, undefended, or collapsing.',
  'stress raw': 'Enemy attack divided by this side’s effective defence. Above 1 instability grows; below 1 the sector tends to recover.',
  'avg instab': 'Accumulated instability of this side. Sustained stress pushes it upward toward collapse; adequate mass and incoming reinforcements reduce it.',
  'avg flow': 'Magnitude of force transport through the area. It shows how much logistics traffic is moving here, regardless of direction.',
  'sum force': 'Weighted total force inside the sampled neighbourhood. Unlike avg force, this reflects how much force is concentrated in the whole local sector.',
  'sum drain': 'Weighted total force lost inside the sampled neighbourhood this tick.',
  'avg raw force': 'Net front-driving tendency: Blue advance minus Red advance, before the safety clamp. Positive pushes toward Red territory; negative pushes toward Blue territory.',
  'avg clamped force': 'Net front-driving tendency after limiting extreme values. This is the value actually fed into territorial control movement.',
  'avg pressure': 'Simple local balance of front mass: (Blue − Red) / (Blue + Red). Positive means Blue has more mass, negative means Red has more.',
  'avg terrain def/mob': 'Terrain effect around this front sector. Defence above 1 makes the defender harder to stress; mobility below 1 slows territorial movement and logistics.',
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
      ['avg force', info.warBlue, info.warRed],
      ['avg mass', info.frontMassBlue, info.frontMassRed],
      ['avg incoming', info.incomingBlue, info.incomingRed],
      ['avg drain', info.drainBlue, info.drainRed],
      ['advance raw', info.advanceBlue, info.advanceRed],
      ['stress raw', info.stressBlue, info.stressRed],
      ['avg instab', info.instabilityBlue, info.instabilityRed],
      ['avg flow', info.flowBlue, info.flowRed],
      ['sum force', info.localWarBlue, info.localWarRed],
      ['sum drain', info.localDrainBlue, info.localDrainRed],
    ] as const;

    const row = (label: string, value: string) =>
      `<div class="probe-row" title="${HELP[label]}"><span>${label}</span><b>${value}</b></div>`;

    this.content.className = '';
    this.content.innerHTML = `
      ${row('x,y', `${info.x.toFixed(1)}, ${info.y.toFixed(1)}`)}
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
