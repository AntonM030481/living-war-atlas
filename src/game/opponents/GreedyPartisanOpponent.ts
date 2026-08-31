import { CFG, type Side } from '../../sim/Config';
import type { Simulation } from '../../sim/Simulation';
import { PartisanMetaGame } from '../../meta/partisan/PartisanMetaGame';
import type { GameOpponent } from './GameOpponent';

const TARGET_PRIORITY = [2, 3, 1] as const;

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
    const enemyCities = simulation.cities.filter((city) => city.owner !== this.side);
    const targetProduction = TARGET_PRIORITY.find((production) =>
      enemyCities.some((city) => city.baseProduction === production),
    );
    if (targetProduction === undefined) return;

    const affordable = this.meta.availableActionsForSide(simulation, this.side);
    const candidates = affordable.filter((action) =>
      enemyCities.find((city) => city.id === action.cityId)?.baseProduction === targetProduction,
    );
    if (candidates.length === 0) return;

    const tick = Math.round(simulation.gameTime / CFG.dt);
    const selected = candidates[deterministicIndex(this.seed, tick, candidates.length)];
    this.meta.applyForSide(selected, simulation, this.side);
  }
}
