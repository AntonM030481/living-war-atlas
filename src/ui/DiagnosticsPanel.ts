import type { CityDiagnostic } from '../diagnostics/types';

function fmt(value: number): string {
  return value.toFixed(Math.abs(value) >= 10 ? 1 : 2);
}

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
        <thead><tr><th>city</th><th>prod</th><th>war cell/local</th><th>flow cell/local</th></tr></thead>
        <tbody>${rows.map((row) => `
          <tr class="${row.weak ? 'weak' : ''}">
            <th>${row.cityName}</th>
            <td>${fmt(row.production)}</td>
            <td>${fmt(row.cellWar)} / ${fmt(row.localWar)}</td>
            <td>${fmt(row.cellFlow)} / ${fmt(row.localFlow)}</td>
          </tr>
        `).join('')}</tbody>
      </table>
    `;
  }
}
