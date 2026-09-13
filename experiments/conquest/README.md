# Experimental Conquest performance suite

Run explicitly from the repository root:

```sh
npm run test:conquest
npm run bench:conquest
```

The `.checks.ts` and `.perf.ts` suffixes are deliberately outside Vitest's
default discovery patterns. Only this directory's explicit config discovers
them. Neither `npm test`, CI, `npm run bench`, nor the existing `bench:sim`
commands run this suite. No production simulation settings are changed.

## Scenarios

All checkpoints use the real Conquest factories and `GameSession`, Riverlands
(`theatre`, 256 × 160), seed `1`, blue player, and normal balanced-random
ownership. Activate all available blue countries in sorted region-ID order.

| Scenario | Sequence | Checkpoint |
| --- | --- | --- |
| preparation | Activate blue countries; run 100 ticks | Closed hostile borders, resource gathering, no combat |
| first-invasion | Preparation; invade first available region in sorted order | Immediately after invasion, before its first tick |
| multiple-fronts | First invasion; run 50 ticks; invade next available region; run 50 ticks | Two invaded countries with ongoing simulation |

These are reproducible workloads, not balance tests or optimal strategies.
The checks verify regional demand, blocked/open grid edges, active fronts,
resource presence, legal actions, and repeatable restoration of both mode and
simulation. Checkpoints are on potential-rebuild cadence boundaries because
`Simulation.restoreState()` clears the dirty flag set by border changes.

The equivalence checks also execute all three scenarios with the original
string-based region queries and with cached queries. They compare complete
session states exactly at the checkpoint and on every subsequent tick, then
repeat after restoring history. These longer checks remain opt-in.

## Measurements

Each scenario reports checkpoint restoration, one full session tick, one full
potential cadence, potential preparation, full potential rebuild, and resource
transport. Preparation/rebuild/transport cover **both sides**. Full session
measurements include the mode's before/after-tick hooks, but exclude rendering,
worker messages, history persistence, snapshots and UI action enumeration.

`beforeEach` restores the checkpoint before each timed invocation, including
warmup. Stage prerequisites run outside the measured interval. The harness-only
row measures restoration separately. Preparation is included in full rebuild:
do not add these two rows together. The reported stages are not an exhaustive
tick breakdown; front mass, combat, control and mode hooks remain in the full
tick measurement. Scenario construction/region generation are not timed.

Vitest writes machine-readable results to `bench-results/conquest/latest.json`
(ignored by Git, overwritten on each run). Save a copy with the commit, Node
version and machine details before comparing revisions. Compare on the same
machine, inspect variance, and rerun noisy measurements. There are no blocking
performance thresholds. This suite establishes a baseline before optimization.

Use `npm run bench:conquest -- --help` for Vitest filters and comparison options.

Recorded before/after runs and their environment are kept in [results](results/README.md).
