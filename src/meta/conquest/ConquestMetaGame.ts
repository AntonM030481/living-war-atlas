import type { Side } from '../../sim/Config';
import type { Simulation } from '../../sim/Simulation';
import type { MapDefinition, RegionId } from '../../sim/types';
import type { MetaGame } from '../MetaGame';

export type ConquestAction =
  | { type: 'activate'; regionId: RegionId }
  | { type: 'invade'; regionId: RegionId };

export interface ConquestCountryState {
  regionId: RegionId;
  owner: Side;
  active: boolean;
}

export interface ConquestMetaState {
  countries: ConquestCountryState[];
}

export class ConquestMetaGame implements MetaGame<ConquestAction, ConquestMetaState> {
  readonly id = 'conquest';
  private readonly capitalByRegion = new Map<RegionId, string>();
  private readonly countries = new Map<RegionId, ConquestCountryState>();

  constructor(
    map: MapDefinition,
    private readonly playerSide: Side,
    initialActiveRegions: readonly RegionId[] = [],
  ) {
    const initialActive = new Set(initialActiveRegions);
    for (const region of map.regions ?? []) {
      const capital = map.cities.find((city) => city.id === region.cityId);
      if (!capital) throw new Error(`Unknown capital ${region.cityId} for region ${region.id}`);
      this.capitalByRegion.set(region.id, region.cityId);
      this.countries.set(region.id, {
        regionId: region.id,
        owner: capital.owner,
        active: initialActive.has(region.id),
      });
    }
    if (this.countries.size === 0) throw new Error('Conquest meta-game requires map regions');
    for (const regionId of initialActive) this.requireCountry(regionId);
  }

  initialize(simulation: Simulation): void {
    for (const country of this.countries.values()) {
      simulation.setCityEnabled(this.capital(country.regionId), country.active);
    }
    this.openFriendlyBorders(simulation);
  }

  afterTick(simulation: Simulation): void {
    let ownershipChanged = false;
    for (const country of this.countries.values()) {
      const city = simulation.cities.find((candidate) => candidate.id === this.capital(country.regionId));
      if (!city || city.owner === country.owner) continue;
      country.owner = city.owner;
      country.active = true;
      ownershipChanged = true;
    }
    if (ownershipChanged) this.openFriendlyBorders(simulation);
  }

  availableActions(simulation: Simulation): readonly ConquestAction[] {
    const actions: ConquestAction[] = [];

    for (const country of this.countries.values()) {
      if (!country.active && country.owner === this.playerSide) {
        actions.push({ type: 'activate', regionId: country.regionId });
      }
      if (country.owner === this.playerSide) continue;

      const attackable = simulation.regionNeighbors(country.regionId).some((neighborId) => {
        const neighbor = this.countries.get(neighborId);
        return neighbor?.active === true
          && neighbor.owner === this.playerSide
          && !simulation.isRegionBorderOpen(neighborId, country.regionId);
      });
      if (attackable) actions.push({ type: 'invade', regionId: country.regionId });
    }

    return actions;
  }

  apply(action: ConquestAction, simulation: Simulation): void {
    const country = this.requireCountry(action.regionId);

    if (action.type === 'activate') {
      if (country.active) throw new Error(`Region ${action.regionId} is already active`);
      if (country.owner !== this.playerSide) throw new Error(`Cannot activate enemy region ${action.regionId}`);
      country.active = true;
      simulation.setCityEnabled(this.capital(action.regionId), true);
      this.openFriendlyBorders(simulation);
      return;
    }

    if (country.owner === this.playerSide) throw new Error(`Region ${action.regionId} is already owned by ${this.playerSide}`);
    const attackFrom = simulation.regionNeighbors(action.regionId).filter((neighborId) => {
      const neighbor = this.countries.get(neighborId);
      return neighbor?.active === true && neighbor.owner === this.playerSide;
    });
    if (attackFrom.length === 0) throw new Error(`Region ${action.regionId} is not adjacent to active territory`);

    country.active = true;
    simulation.setCityEnabled(this.capital(action.regionId), true);
    for (const neighborId of attackFrom) {
      simulation.setRegionBorderOpen(neighborId, action.regionId, true);
    }
  }

  saveState(): ConquestMetaState {
    return {
      countries: [...this.countries.values()].map((country) => ({ ...country })),
    };
  }

  restoreState(state: ConquestMetaState): void {
    if (state.countries.length !== this.countries.size) throw new Error('Incompatible conquest meta-game state');
    const seen = new Set<RegionId>();
    for (const restored of state.countries) {
      const country = this.requireCountry(restored.regionId);
      country.owner = restored.owner;
      country.active = restored.active;
      seen.add(restored.regionId);
    }
    if (seen.size !== this.countries.size) throw new Error('Incomplete conquest meta-game state');
  }

  private openFriendlyBorders(simulation: Simulation): void {
    for (const country of this.countries.values()) {
      if (!country.active) continue;
      for (const neighborId of simulation.regionNeighbors(country.regionId)) {
        const neighbor = this.countries.get(neighborId);
        if (!neighbor?.active || neighbor.owner !== country.owner) continue;
        simulation.setRegionBorderOpen(country.regionId, neighborId, true);
      }
    }
  }

  private capital(regionId: RegionId): string {
    const cityId = this.capitalByRegion.get(regionId);
    if (!cityId) throw new Error(`Unknown capital for region ${regionId}`);
    return cityId;
  }

  private requireCountry(regionId: RegionId): ConquestCountryState {
    const country = this.countries.get(regionId);
    if (!country) throw new Error(`Unknown region: ${regionId}`);
    return country;
  }
}
