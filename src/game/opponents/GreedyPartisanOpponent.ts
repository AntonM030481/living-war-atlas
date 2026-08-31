import { CFG, type Side } from '../../sim/Config';
import type { Simulation } from '../../sim/Simulation';
import { PartisanMetaGame } from '../../meta/partisan/PartisanMetaGame';
import type { GameOpponent } from './GameOpponent';

function deterministicIndex(seed: number, tick: number, count: number): number {
  let value = (seed ^ Math.imul(tick + 1, 0x9e3779b1)) >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return (value >>> 0) % count;
}

export class GreedyPartisanOpponent implements GameOpponent {
  readonly id = 'greedy' as const;

  constructor(
    private readonly meta: PartisanMetaGame,
    private readonly side: Side,
    private readonly seed: number,
  ) {}

  act(simulation: Simulation): void {
    const affordable = this.meta.availableActionsForSide(simulation, this.side);
    if (affordable.length === 0) return;

    let cheapestProduction = Number.POSITIVE_INFINITY;
    const cityById = new Map(simulation.cities.map((city) => [city.id, city] as const));
    for (const action of affordable) {
      const city = cityById.get(action.cityId);
      if (city) cheapestProduction = Math.min(cheapestProduction, city.baseProduction);
    }

    const cheapest = affordable.filter((action) =>
      cityById.get(action.cityId)?.baseProduction === cheapestProduction,
    );
    if (cheapest.length === 0) return;

    const tick = Math.round(simulation.gameTime / CFG.dt);
    const selected = cheapest[deterministicIndex(this.seed, tick, cheapest.length)];
    this.meta.applyForSide(selected, simulation, this.side);
  }
}
