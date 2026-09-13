import type { GameAction, GameModeView } from '../game/GameMode';
import type { MapDefinition } from '../sim/types';

export class ConquestPanel {
  readonly element = document.createElement('section');
  private readonly summary = document.createElement('p');
  private readonly title = document.createElement('h3');
  private readonly detail = document.createElement('p');
  private readonly action = document.createElement('button');
  private readonly events = document.createElement('ol');
  private selected: string | null = null;
  private view: Extract<GameModeView, { mode: 'conquest' }> | null = null;
  private actions: readonly GameAction[] = [];
  private finished = false;

  constructor(private readonly map: MapDefinition, onAction: (action: GameAction) => void) {
    this.element.className = 'conquest-panel';
    this.element.setAttribute('aria-label', 'Conquest decisions');
    this.action.type = 'button';
    this.action.addEventListener('click', () => {
      const action = this.selectedAction();
      if (action && !this.finished) onAction(action);
    });
    this.element.append(this.summary, this.title, this.detail, this.action, this.events);
    this.render();
  }
  select(regionId: string): void {
    this.selected = regionId;
    this.render();
    this.element.scrollIntoView({ block: 'nearest' });
  }
  update(view: Extract<GameModeView, { mode: 'conquest' }>, actions: readonly GameAction[], finished: boolean): void {
    this.view = view;
    this.actions = actions;
    this.finished = finished;
    this.render();
  }
  private selectedAction(): GameAction | undefined {
    return this.actions.find((a) => (a.type === 'conquestActivate' || a.type === 'conquestInvade') && a.regionId === this.selected);
  }
  private render(): void {
    const c = this.view?.countries.find((c) => c.regionId === this.selected);
    this.summary.textContent = `${this.view?.countries.filter((c) => c.secretAlly).length ?? 0} secret allies · Reveal, prepare, then choose a frontier.`;
    const region = this.map.regions?.find((r) => r.id === this.selected);
    const city = this.map.cities.find((city) => city.id === region?.cityId);
    this.title.textContent = city ? `${city.name} · Production ${city.baseProduction}` : 'Select a country';
    const action = this.selectedAction();
    this.action.hidden = !action;
    this.action.disabled = this.finished;
    if (!c) {
      this.detail.textContent = 'Select a country on the map. Selection alone never reveals or invades it.';
    } else if (c.secretAlly) {
      this.detail.textContent = 'Your secret ally. Reveal to deploy forces and start finite mobilization. Waiting preserves its reserve and secrecy; deployed forces consume upkeep.';
    } else if (!c.active) {
      this.detail.textContent = 'Unknown: neutral or an enemy secret ally. An invasion raises resistance for the enemy, even here. A nearby hidden ally may join the defence.';
    } else {
      const reserve = !c.mobilized ? 'Resistance holds this neutral country. No income until its capital is captured.' : c.remainingProduction === 0 ? 'Mobilization exhausted.'
        : c.remainingProduction! < (city?.baseProduction ?? 1) * 30 ? 'Mobilization running low.' : 'Mobilization available.';
      this.detail.textContent = `${c.owner === 'blue' ? 'Blue' : 'Red'} capital. ${reserve} ${c.resistanceRaised
        ? 'Resistance has already risen here; it will not appear again.' : 'First invasion still raises resistance.'}`;
    }
    if (action?.type === 'conquestActivate') this.action.textContent = 'Reveal ally';
    if (action?.type === 'conquestInvade') {
      this.action.textContent = c?.resistanceRaised ? 'Open invasion front' : 'Invade — raise enemy resistance';
      this.detail.textContent += ' Opening this frontier is permanent and allows counterattacks.';
    } else if (c && !c.secretAlly && !action) {
      this.detail.textContent += ' An open front fights autonomously. New invasions require adjacent active territory.';
    }
    const messages = this.view?.events ?? [];
    if (this.events.dataset.messages !== JSON.stringify(messages)) {
      this.events.dataset.messages = JSON.stringify(messages);
      this.events.replaceChildren(...messages.slice().reverse().map((message) => {
        const li = document.createElement('li'); li.textContent = message; return li;
      }));
    }
  }
}
