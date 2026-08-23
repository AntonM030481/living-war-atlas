import type { MapDefinition, SimulationSnapshot } from '../sim/types';
import type { Point } from '../diagnostics/types';

export interface OverlayProjector {
  worldToScreen(point: Point): Point;
  mapScreenRect(): { left: number; top: number; width: number; height: number };
}

function formatPoints(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

export class CityOverlays {
  private readonly blueBadge = document.createElement('div');
  private readonly redBadge = document.createElement('div');
  private readonly powerLabels = new Map<string, HTMLDivElement>();
  private readonly nameLabels = new Map<string, HTMLDivElement>();

  constructor(
    map: MapDefinition,
    private readonly projector: OverlayProjector,
    private readonly host: HTMLElement,
  ) {
    this.blueBadge.className = 'city-points-badge blue';
    this.redBadge.className = 'city-points-badge red';
    this.blueBadge.innerHTML = '<span>Blue --/--</span><small>force --</small>';
    this.redBadge.innerHTML = '<span>Red --/--</span><small>force --</small>';
    this.host.append(this.blueBadge, this.redBadge);

    for (const city of map.cities) {
      const title = `${city.name}: ${city.baseProduction} production points. Left click: production on/off. Right click: switch side.`;
      const power = document.createElement('div');
      power.className = `city-power-label ${city.owner}`;
      power.textContent = `${city.baseProduction}`;
      power.title = title;
      const name = document.createElement('div');
      name.className = `city-name-label ${city.owner}`;
      name.textContent = city.name;
      name.title = title;
      this.host.append(power, name);
      this.powerLabels.set(city.id, power);
      this.nameLabels.set(city.id, name);
    }
  }

  update(snapshot: SimulationSnapshot): void {
    const stats = snapshot.stats;
    const rect = this.projector.mapScreenRect();
    const hostRect = this.host.getBoundingClientRect();
    const mapLeft = rect.left - hostRect.left;
    const mapTop = rect.top - hostRect.top;

    this.blueBadge.innerHTML = `<span>Blue ${formatPoints(stats.activeCityPointsBlue)}/${formatPoints(stats.controlledCityPointsBlue)}</span><small>force ${Math.round(stats.totalWarBlue)}</small>`;
    this.redBadge.innerHTML = `<span>Red ${formatPoints(stats.activeCityPointsRed)}/${formatPoints(stats.controlledCityPointsRed)}</span><small>force ${Math.round(stats.totalWarRed)}</small>`;
    this.blueBadge.style.left = `${mapLeft + 10}px`;
    this.blueBadge.style.top = `${mapTop + 10}px`;
    this.redBadge.style.left = `${mapLeft + rect.width - this.redBadge.offsetWidth - 10}px`;
    this.redBadge.style.right = 'auto';
    this.redBadge.style.top = `${mapTop + 10}px`;

    for (const city of snapshot.cities) {
      const power = this.powerLabels.get(city.id);
      const name = this.nameLabels.get(city.id);
      if (!power || !name) continue;
      const point = this.projector.worldToScreen({ x: city.x, y: city.y });
      const localX = point.x - hostRect.left;
      const localY = point.y - hostRect.top;
      const control = snapshot.control[city.y * snapshot.width + city.x];
      const ownerControl = city.owner === 'blue' ? control : -control;
      const contested = ownerControl < 0.72;
      const title = `${city.name}: ${city.baseProduction} production points. Left click: production on/off. Right click: switch side.`;

      power.hidden = contested;
      name.hidden = contested;
      power.textContent = `${city.baseProduction}`;
      power.title = title;
      power.className = `city-power-label ${city.owner} power-${city.baseProduction}${city.enabled === false ? ' disabled' : ''}`;
      power.style.left = `${localX}px`;
      power.style.top = `${localY}px`;
      name.textContent = city.name;
      name.title = title;
      name.className = `city-name-label ${city.owner}${city.enabled === false ? ' disabled' : ''}`;
      name.style.left = `${localX}px`;
      name.style.top = `${localY + 22}px`;
    }
  }
}
