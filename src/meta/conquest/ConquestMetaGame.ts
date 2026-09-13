import { CFG, RESOURCE_EPS, type Side } from '../../sim/Config';
import { RNG } from '../../sim/RNG';
import type { Simulation } from '../../sim/Simulation';
import type { City, MapDefinition, RegionId, SimulationSnapshot } from '../../sim/types';
import type { MetaGame } from '../MetaGame';
import { CONQUEST } from './ConquestRules';

export type ConquestAction =
  | { type: 'activate'; regionId: RegionId }
  | { type: 'invade'; regionId: RegionId };

export interface ConquestCountryState {
  regionId: RegionId;
  allegiance: Side | null;
  owner: Side;
  active: boolean;
  invadedBy: Side | null;
  economyStarted: boolean;
}
export interface ConquestMetaState {
  version: 2;
  countries: ConquestCountryState[];
  nextDecisionAt: number;
  events: string[];
}
export interface ConquestCountryView {
  regionId: RegionId;
  owner: Side | null;
  secretAlly: boolean;
  active: boolean;
  resistanceRaised: boolean;
  mobilized: boolean;
  remainingProduction: number | null;
}
const opposite = (side: Side): Side => side === 'blue' ? 'red' : 'blue';

export class ConquestMetaGame implements MetaGame<ConquestAction, ConquestMetaState> {
  readonly id = 'conquest';
  private readonly capitalByRegion = new Map<RegionId, string>();
  private readonly countries = new Map<RegionId, ConquestCountryState>();
  private readonly cells = new Map<RegionId, number[]>();
  private readonly capitalCells = new Map<RegionId, number[]>();
  private nextDecisionAt = CONQUEST.opponentDecisionSeconds as number;
  private events: string[] = [];

  constructor(
    private readonly map: MapDefinition,
    private readonly playerSide: Side,
    private readonly seed = 1,
    private readonly opponentEnabled = true,
  ) {
    for (const region of map.regions ?? []) {
      const city = map.cities.find((c) => c.id === region.cityId);
      if (!city) throw new Error(`Unknown capital ${region.cityId}`);
      this.capitalByRegion.set(region.id, region.cityId);
      this.countries.set(region.id, {
        regionId: region.id, allegiance: city.owner, owner: city.owner,
        active: false, invadedBy: null, economyStarted: false,
      });
      this.cells.set(region.id, []);
    }
    if (!this.countries.size) throw new Error('Conquest requires countries');
  }

  initialize(simulation: Simulation): void {
    const rng = new RNG(this.seed ^ 0x6c8e9cf5);
    // Keep both alliances, replacing about one third of each with genuine neutrals.
    for (const c of this.countries.values()) c.allegiance = c.owner = this.city(c.regionId, simulation).owner;
    for (const side of ['blue', 'red'] as const) {
      const candidates = [...this.countries.values()].filter((c) => c.allegiance === side);
      for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(rng.next() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
      }
      for (const c of candidates.slice(0, Math.floor(candidates.length / 3))) c.allegiance = null;
    }
    simulation.initializeRegionalControl([...this.countries.values()].map((c) => [c.regionId, c.owner]));
    for (let i = 0; i < simulation.size; i++) {
      if (simulation.terrainBlocked[i]) continue;
      const id = simulation.regionIdAt(i % simulation.width, Math.floor(i / simulation.width));
      if (id) this.cells.get(id)?.push(i);
    }
    for (const c of this.countries.values()) {
      const city = this.city(c.regionId, simulation);
      city.enabled = false;
      city.remainingProduction = 0;
      this.capitalCells.set(c.regionId, this.cells.get(c.regionId)!.filter((i) =>
        Math.hypot(i % simulation.width - city.x, Math.floor(i / simulation.width) - city.y) <= 4));
      for (const neighbor of simulation.regionNeighbors(c.regionId)) {
        simulation.setRegionBorderOpen(c.regionId, neighbor, false);
      }
    }
  }

  beforeTick(simulation: Simulation): void {
    if (!this.opponentEnabled || simulation.gameTime + 1e-8 < this.nextDecisionAt) return;
    this.nextDecisionAt = simulation.gameTime + CONQUEST.opponentDecisionSeconds;
    this.actOpponent(simulation);
  }

  afterTick(simulation: Simulation): void {
    let changed = false;
    for (const c of this.countries.values()) {
      if (!c.active) continue;
      // Starting a war opens a reciprocal front. A counter-breakthrough raises
      // the source country's resistance once, without making unrelated borders open.
      if (c.invadedBy === null && this.cells.get(c.regionId)!.some((i) =>
        simulation.control[i] * (c.owner === 'blue' ? 1 : -1) < -CFG.cityCaptureThreshold)) {
        this.raiseResistance(c, opposite(c.owner), simulation);
      }
      const city = this.city(c.regionId, simulation);
      if (city.owner !== c.owner) {
        c.owner = city.owner;
        this.startEconomy(c, simulation, false);
        this.event(`${city.name} captured by ${c.owner}.`);
        changed = true;
      }
    }
    if (changed) this.openFriendlyBorders(simulation);
  }

  availableActions(simulation: Simulation, side = this.playerSide): readonly ConquestAction[] {
    const actions: ConquestAction[] = [];
    for (const c of this.countries.values()) {
      if (!c.active && c.allegiance === side) {
        actions.push({ type: 'activate', regionId: c.regionId });
        continue;
      }
      if (c.active && c.owner === side) continue;
      if (this.attackFrom(c.regionId, side, simulation).some((id) =>
        !simulation.isRegionBorderOpen(id, c.regionId))) actions.push({ type: 'invade', regionId: c.regionId });
    }
    return actions;
  }

  apply(action: ConquestAction, simulation: Simulation, side = this.playerSide): void {
    if (!this.availableActions(simulation, side).some((a) => a.type === action.type && a.regionId === action.regionId)) {
      throw new Error(`Unavailable Conquest action: ${action.type} ${action.regionId}`);
    }
    const c = this.countries.get(action.regionId)!;
    if (action.type === 'activate') {
      this.disclose(c, simulation);
      return;
    }
    const from = this.attackFrom(c.regionId, side, simulation);
    if (!c.active) {
      if (c.allegiance !== null) this.disclose(c, simulation);
      else {
        c.owner = opposite(side);
        c.active = true;
        // Dormant neutrals have no force. Assign their placeholder territory to
        // the resistance side before opening contact; never repaint active land.
        for (const i of this.cells.get(c.regionId)!) simulation.control[i] = c.owner === 'blue' ? 1 : -1;
        const city = this.city(c.regionId, simulation);
        city.owner = c.owner;
        city.enabled = false;
      }
    }
    this.raiseResistance(c, side, simulation);
    for (const id of from) simulation.setRegionBorderOpen(id, c.regionId, true);
    this.openFriendlyBorders(simulation);
  }

  view(simulation: Simulation, side = this.playerSide): { countries: ConquestCountryView[]; events: string[] } {
    return {
      countries: [...this.countries.values()].map((c) => ({
        regionId: c.regionId, owner: c.active ? c.owner : null,
        secretAlly: !c.active && c.allegiance === side, active: c.active,
        resistanceRaised: c.invadedBy !== null, mobilized: c.economyStarted,
        remainingProduction: c.active ? this.city(c.regionId, simulation).remainingProduction ?? 0 : null,
      })),
      events: [...this.events],
    };
  }

  projectSnapshot(snapshot: SimulationSnapshot): void {
    // Snapshot arrays are copies. Neither rendering nor diagnostics receives the
    // placeholder side/control/potential of an undisclosed country.
    const fields = Object.entries(snapshot).filter(([key, value]) =>
      value instanceof Float32Array && !key.startsWith('terrain')).map(([, value]) => value as Float32Array);
    for (const c of this.countries.values()) {
      if (c.active) continue;
      for (const i of this.cells.get(c.regionId)!) {
        for (const field of fields) field[i] = 0;
        if (snapshot.frontMask) snapshot.frontMask[i] = 0;
        if (snapshot.recentCaptureSide) snapshot.recentCaptureSide[i] = 0;
      }
      const city = snapshot.cities.find((city) => city.id === this.capitalByRegion.get(c.regionId))!;
      city.owner = 'blue'; // Fixed placeholder, never the hidden allegiance.
      city.integration = 0;
    }
    for (const side of ['blue', 'red'] as const) {
      const suffix = side === 'blue' ? 'Blue' : 'Red';
      const visible = [...this.countries.values()].filter((c) => c.active && c.economyStarted && c.owner === side);
      snapshot.stats[`${side}Cities`] = visible.length;
      snapshot.stats[`controlledCityPoints${suffix}`] = visible.reduce((sum, c) => sum +
        snapshot.cities.find((city) => city.id === this.capitalByRegion.get(c.regionId))!.baseProduction, 0);
    }
  }

  completionStatus(simulation: Simulation): { winner: Side | null } {
    const alive = (side: Side) => [...this.countries.values()].some((c) =>
      (!c.active && c.allegiance === side) || (c.active && c.economyStarted && c.owner === side))
      || simulation.sides[side].war.some((value) => value > RESOURCE_EPS);
    const blue = alive('blue'), red = alive('red');
    return { winner: blue === red ? null : blue ? 'blue' : 'red' };
  }

  saveState(): ConquestMetaState {
    return { version: 2, countries: [...this.countries.values()].map((c) => ({ ...c })),
      nextDecisionAt: this.nextDecisionAt, events: [...this.events] };
  }
  restoreState(state: ConquestMetaState): void {
    if (state.version !== 2 || state.countries.length !== this.countries.size
      || new Set(state.countries.map((c) => c.regionId)).size !== this.countries.size
      || state.countries.some((c) => !this.countries.has(c.regionId))) throw new Error('Incompatible Conquest save');
    for (const c of state.countries) this.countries.set(c.regionId, { ...c });
    this.nextDecisionAt = state.nextDecisionAt;
    this.events = [...state.events];
  }

  private disclose(c: ConquestCountryState, simulation: Simulation): void {
    c.active = true;
    c.owner = c.allegiance!;
    this.startEconomy(c, simulation, true);
    this.event(`${this.city(c.regionId, simulation).name} revealed for ${c.owner}.`);
    this.openFriendlyBorders(simulation);
  }
  private startEconomy(c: ConquestCountryState, simulation: Simulation, deployment: boolean): void {
    const city = this.city(c.regionId, simulation);
    if (!c.economyStarted) {
      city.remainingProduction = city.baseProduction * CONQUEST.mobilizationSeconds;
      c.economyStarted = true;
      if (deployment) this.deposit(this.capitalCells.get(c.regionId)!, c.owner,
        city.baseProduction * CONQUEST.disclosureForceSeconds, simulation);
    }
    city.enabled = (city.remainingProduction ?? 0) > 0;
  }
  private raiseResistance(c: ConquestCountryState, attacker: Side, simulation: Simulation): void {
    if (c.invadedBy !== null) return;
    c.invadedBy = attacker;
    const defender = opposite(attacker);
    const frontier = this.cells.get(c.regionId)!.filter((i) => {
      const x = i % simulation.width, y = Math.floor(i / simulation.width);
      return [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].some(([nx, ny]) => {
        const other = simulation.regionIdAt(nx, ny);
        return other && other !== c.regionId && this.countries.get(other)?.active
          && this.countries.get(other)?.owner === attacker;
      });
    });
    const amount = this.city(c.regionId, simulation).baseProduction * CONQUEST.resistanceForceSeconds;
    this.deposit(frontier.length ? frontier : this.cells.get(c.regionId)!, defender, amount / 2, simulation);
    this.deposit(this.capitalCells.get(c.regionId)!, defender, amount / 2, simulation);
    this.event(`${this.city(c.regionId, simulation).name}: ${defender} resistance raised against ${attacker}.`);
  }
  private deposit(cells: readonly number[], side: Side, amount: number, simulation: Simulation): void {
    if (!cells.length) return;
    // A one-off regional force, distributed once. Subsequent movement is physics.
    const share = amount / cells.length;
    for (const i of cells) simulation.sides[side].war[i] += share;
  }
  private attackFrom(id: RegionId, side: Side, simulation: Simulation): RegionId[] {
    return simulation.regionNeighbors(id).filter((neighbor) => {
      const c = this.countries.get(neighbor)!;
      return c.active && c.owner === side;
    });
  }
  private openFriendlyBorders(simulation: Simulation): void {
    for (const c of this.countries.values()) {
      if (!c.active) continue;
      for (const id of simulation.regionNeighbors(c.regionId)) {
        const neighbor = this.countries.get(id)!;
        if (neighbor.active && neighbor.owner === c.owner) simulation.setRegionBorderOpen(c.regionId, id, true);
      }
    }
  }
  private city(id: RegionId, simulation: Simulation): City {
    return simulation.cities.find((city) => city.id === this.capitalByRegion.get(id))!;
  }
  private event(message: string): void {
    this.events = [...this.events.slice(-5), message];
  }

  private actOpponent(simulation: Simulation): void {
    const side = opposite(this.playerSide);
    const actions = this.availableActions(simulation, side);
    const force = (id: RegionId, owner: Side) => this.cells.get(id)!.reduce((sum, i) => sum + simulation.sides[owner].war[i], 0);
    const active = [...this.countries.values()].filter((c) => c.active && c.owner === side);
    const reveals = actions.filter((a) => a.type === 'activate');
    // Only own allies and PUBLIC active countries enter the score. Never inspect
    // an unknown target's allegiance to choose an invasion or a response.
    const revealScore = (id: RegionId) => simulation.regionNeighbors(id).reduce((sum, neighbor) => {
      const c = this.countries.get(neighbor)!;
      return sum + (!c.active ? 0 : c.invadedBy !== null && c.owner === side ? 10 : c.owner !== side ? 4 : 1);
    }, 0);
    reveals.sort((a, b) => revealScore(b.regionId) - revealScore(a.regionId) || a.regionId.localeCompare(b.regionId));
    if (reveals.length && (!active.length || revealScore(reveals[0].regionId) >= 4)) {
      this.apply(reveals[0], simulation, side);
      return;
    }
    const invasions = actions.filter((a) => a.type === 'invade').filter((a) => {
      const c = this.countries.get(a.regionId)!;
      const available = this.attackFrom(a.regionId, side, simulation).reduce((sum, id) => sum + force(id, side), 0);
      const resistance = c.invadedBy === null ? this.city(a.regionId, simulation).baseProduction * CONQUEST.resistanceForceSeconds : 0;
      const defenders = c.active ? force(c.regionId, opposite(side)) : 0;
      return available > (resistance + defenders) * CONQUEST.invasionStrengthRatio;
    });
    invasions.sort((a, b) => this.city(b.regionId, simulation).baseProduction - this.city(a.regionId, simulation).baseProduction
      || a.regionId.localeCompare(b.regionId));
    if (invasions.length) this.apply(invasions[0], simulation, side);
    else if (reveals.length && active.every((c) => (this.city(c.regionId, simulation).remainingProduction ?? 0) < 1)) {
      this.apply(reveals[0], simulation, side);
    }
  }
}
