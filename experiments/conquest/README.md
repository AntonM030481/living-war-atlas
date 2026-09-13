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
ownership. Under rules v2, roughly one third are genuinely neutral. Reveal all
available blue allies in sorted region-ID order. Disable the strategic opponent
for these fixed benchmark checkpoints; resistance and mode hooks remain active.

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

## Strategic probes (rules v2)

`strategy.checks.ts` runs nine compact three-minute openings with the real
opponent enabled. Set `CONQUEST_REPORT_PATH` to save observations as JSON; the
recorded run is [strategy-v2.json](results/strategy-v2.json). It checks distinct
consequences, not subjective enjoyment or the existence of an optimal policy.
See [the prototype rules and playtest](../../docs/CONQUEST.md).

Historical before/after cache timings in `results` use rules v1. The v2 economy,
neutral deal and resistance change the workload; do not compare those absolute
timings as a performance regression test.

## Optional browser smoke test

With Playwright and its Chromium browser installed separately (they are not
project or CI dependencies), run:

```sh
node experiments/conquest/browser-smoke.cjs
```

`CONQUEST_CHROMIUM_PATH` can select an existing Chromium executable. The script
starts its own development server and checks selection before commitment,
explicit reveal/invasion, and unknown-country masking after a mobile viewport
resize. Screenshots go to the ignored `bench-results/conquest/ui` directory.
This is a desktop interaction and responsive-layout check, not a touch-device
playtest.

The rules regression tests also live here as `rules.checks.ts`, so all new
Conquest-specific checks remain explicitly opt-in.
