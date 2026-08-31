import type { GameAction, GameModeId } from '../game/GameMode';
import type { Side } from '../sim/Config';
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
  private readonly blueBadge = this.createSideBadge('blue');
  private readonly redBadge = this.createSideBadge('red');
  private readonly powerLabels = new Map<string, HTMLDivElement>();
  private readonly nameLabels = new Map<string, HTMLDivElement>();
  private readonly regionByCity = new Map<string, string>();

  constructor(
    private readonly map: MapDefinition,
    private readonly projector: OverlayProjector,
    private readonly host: HTMLElement,
  ) {
    const badgeTitle = 'Production is active production / controlled production capacity. Active production generates force, which flows from cities toward the front.';
    this.blueBadge.title = badgeTitle;
    this.redBadge.title = badgeTitle;
    this.host.append(this.blueBadge, this.redBadge);

    for (const region of map.regions ?? []) this.regionByCity.set(region.cityId, region.id);

    for (const city of map.cities) {
      const power = document.createElement('div');
      power.className = `city-power-label ${city.owner}`;
      power.textContent = `${city.baseProduction}`;
      const name = document.createElement('div');
      name.className = `city-name-label ${city.owner}`;
      name.textContent = city.name;
      this.host.append(power, name);
      this.powerLabels.set(city.id, power);
      this.nameLabels.set(city.id, name);
    }
  }

  setGuerrillaPoints(points: Record<Side, number> | null, maxPoints = 300): void {
    for (const side of ['blue', 'red'] as const) {
      const badge = side === 'blue' ? this.blueBadge : this.redBadge;
      const guerrilla = badge.querySelector<HTMLElement>('.guerrilla-inline')!;
      guerrilla.hidden = points === null;
      if (!points) continue;
      const value = Math.max(0, Math.min(maxPoints, points[side]));
      guerrilla.querySelector<HTMLElement>('.guerrilla-inline-fill')!.style.width = `${(value / maxPoints) * 100}%`;
    }
  }

  update(snapshot: SimulationSnapshot, modeId: GameModeId, actions: readonly GameAction[]): void {
    const stats = snapshot.stats;
    const rect = this.projector.mapScreenRect();
    const hostRect = this.host.getBoundingClientRect();
    const mapLeft = rect.left - hostRect.left;
    const mapTop = rect.top - hostRect.top;

    this.blueBadge.querySelector<HTMLElement>('.city-points-text')!.textContent = `Production ${formatPoints(stats.activeCityPointsBlue)}/${formatPoints(stats.controlledCityPointsBlue)} · Force ${Math.round(stats.totalWarBlue)}`;
    this.redBadge.querySelector<HTMLElement>('.city-points-text')!.textContent = `Production ${formatPoints(stats.activeCityPointsRed)}/${formatPoints(stats.controlledCityPointsRed)} · Force ${Math.round(stats.totalWarRed)}`;
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
      const interaction = this.cityInteraction(city.id, modeId, actions);
      const title = `${city.name}: ${city.baseProduction} production points.${interaction ? ` ${interaction}` : ''}`;
      const actionable = interaction !== null;

      power.hidden = contested;
      name.hidden = contested;
      power.textContent = `${city.baseProduction}`;
      power.title = title;
      power.className = `city-power-label ${city.owner} power-${city.baseProduction}${city.enabled === false ? ' disabled' : ''}${actionable ? ' actionable' : ''}`;
      power.style.left = `${localX}px`;
      power.style.top = `${localY}px`;
      name.textContent = city.name;
      name.title = title;
      name.className = `city-name-label ${city.owner}${city.enabled === false ? ' disabled' : ''}${actionable ? ' actionable' : ''}`;
      name.style.left = `${localX}px`;
      name.style.top = `${localY + 22}px`;
    }
  }

  private createSideBadge(side: Side): HTMLDivElement {
    const badge = document.createElement('div');
    badge.className = `city-points-badge ${side}`;
    badge.innerHTML = `
      <div class="city-points-text">Production --/-- · Force --</div>
      <div class="guerrilla-inline" hidden>
        <div class="guerrilla-inline-track">
          <div class="guerrilla-inline-fill"></div>
          <i style="left:33.333%"></i><i style="left:66.667%"></i><i style="left:100%"></i>
        </div>
        <div class="guerrilla-inline-thresholds"><span>1</span><span>2</span><span>3</span></div>
      </div>
    `;
    return badge;
  }

  private cityInteraction(cityId: string, modeId: GameModeId, actions: readonly GameAction[]): string | null {
    if (modeId === 'sandbox') {
      return actions.some((action) => action.type === 'sandboxToggleCity' && action.cityId === cityId)
        ? 'Click: production on/off. Secondary click or long press: switch side.'
        : null;
    }
    if (modeId === 'partisan') {
      return actions.some((action) => action.type === 'partisanCaptureSource' && action.cityId === cityId)
        ? 'Partisan action ready: click to convert this source.'
        : null;
    }
    const regionId = this.regionByCity.get(cityId);
    if (!regionId) return null;
    if (actions.some((action) => action.type === 'conquestActivate' && action.regionId === regionId)) {
      return 'Click this country to activate it.';
    }
    if (actions.some((action) => action.type === 'conquestInvade' && action.regionId === regionId)) {
      return 'Click this country to invade it.';
    }
    return null;
  }
}
