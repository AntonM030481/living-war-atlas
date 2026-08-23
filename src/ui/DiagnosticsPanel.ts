import type { CityDiagnostic } from '../diagnostics/types';

function fmt(value: number): string {
  return value.toFixed(Math.abs(value) >= 10 ? 1 : 2);
}

const HELP = {
  city: 'City whose local resource state is being inspected.',
  prod: 'Current city production contributing war resource.',
  war: 'War resource in the city cell / total war resource in the local city area.',
  flow: 'Resource flow through the city cell / total flow in the local city area.',
};

export class DiagnosticsPanel {
  readonly element: HTMLDetailsElement;
  private readonly content: HTMLDivElement;

  constructor() {
    this.element = document.createElement('details');
    this.element.className = 'diagnostics-panel';
    this.element.hidden = true;
    this.element.open = true;
    const summary = document.createElement('summary');
    summary.innerHTML = '<b>CITY DIAGNOSTICS</b>';
    this.content = document.createElement('div');
    this.element.append(summary, this.content);
    this.render(null, false);
  }

  setVisible(visible: boolean): void {
    this.element.hidden = !visible;
  }

  render(rows: CityDiagnostic[] | null, enabled: boolean): void {
    if (!enabled) {
      this.content.className = 'diagnostics-empty';
      this.content.textContent = 'off';
      return;
    }
    if (!rows) {
      this.content.className = 'diagnostics-empty';
      this.content.textContent = 'waiting for snapshot';
      return;
    }

    this.content.className = '';
    this.content.innerHTML = `
      <table class="diagnostics-table">
        <thead><tr>
          <th title="${HELP.city}">city</th>
          <th title="${HELP.prod}">prod</th>
          <th title="${HELP.war}">war cell/local</th>
          <th title="${HELP.flow}">flow cell/local</th>
        </tr></thead>
        <tbody>${rows.map((row) => `
          <tr class="${row.weak ? 'weak' : ''}" title="${row.cityName}: production ${fmt(row.production)}, war ${fmt(row.cellWar)} / ${fmt(row.localWar)}, flow ${fmt(row.cellFlow)} / ${fmt(row.localFlow)}${row.weak ? '. Weak local supply/resource state.' : ''}">
            <th>${row.cityName}</th>
            <td title="${HELP.prod}">${fmt(row.production)}</td>
            <td title="${HELP.war}">${fmt(row.cellWar)} / ${fmt(row.localWar)}</td>
            <td title="${HELP.flow}">${fmt(row.cellFlow)} / ${fmt(row.localFlow)}</td>
          </tr>
        `).join('')}</tbody>
      </table>
    `;
  }
}
