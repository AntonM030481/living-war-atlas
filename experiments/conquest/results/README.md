# Conquest regional cache measurements

All values are milliseconds. These are diagnostic measurements from a shared
cloud CPU, not performance thresholds or device frame-rate predictions.

- `2026-09-13-before.json`: original run, local commit `c5ba839`, equivalent to merged `3334105`.
- `2026-09-13-before-repeat.json`: repeated baseline at `3334105`, immediately before the optimized run.
- Optimized simulation code: `be651461c527d12939c0fd2ffe7e99b9fb3b04ca` (later result/documentation commits do not change it).
- Environment: Linux x64, Intel Xeon E5-2673 v4 @ 2.30GHz, Node 24.19.0, Vitest 3.2.7.
- Command: `npm run bench:conquest`. Same map, seed, fixtures, solver configuration and benchmark options in both versions.

The repeated baseline and optimized measurements run sequentially, without
other project tests/builds. External cloud load can still vary. Use means with
relative margin of error (RME); short runs with only five samples are noisy.
Potential preparation is included in potential rebuild, so do not sum those rows.
Stage measurements exclude their setup. Full ticks include mode hooks and any
lazy cache rebuild after history restoration, but exclude rendering/snapshots.

## Reproduce locally

Run these from your main checkout to create independent directories:

```sh
git fetch origin
git fetch origin pull/29/head
git worktree add --detach ../lwa-conquest-before 3334105ced04f54e7fd8eb814f1bc9039c4db273
git worktree add --detach ../lwa-conquest-after be651461c527d12939c0fd2ffe7e99b9fb3b04ca
```

In each directory, using the same Node version:

```sh
npm ci
npm run bench:conquest
```

Run one benchmark at a time. Each writes `bench-results/conquest/latest.json`.
Compare matching scenario and benchmark names (absolute file paths and IDs may
differ between worktrees). For closer estimates, repeat in reverse order.
Run `npm run test:conquest` in the optimized directory to check exact state
equivalence with the original queries, including history restoration.

## Before / after (repeated baseline)

Means in milliseconds ± relative margin of error. The time reduction column
compares means only and does not imply statistical significance.

| Scenario | Measurement | Before, ms ± RME | After, ms ± RME | Time reduction |
| --- | --- | ---: | ---: | ---: |
| preparation | restore checkpoint (harness only) | 0.49 ± 3.3% | 0.61 ± 5.7% | -25.3% |
| preparation | session tick with potential rebuild | 451.72 ± 43.2% | 324.27 ± 18.9% | 28.2% |
| preparation | 10 session ticks (one rebuild cadence) | 1125.86 ± 3.4% | 896.29 ± 26.1% | 20.4% |
| preparation | potential preparation / both sides | 244.77 ± 8.7% | 118.63 ± 12.9% | 51.5% |
| preparation | potential rebuild / both sides (includes preparation) | 343.64 ± 9.0% | 189.89 ± 11.3% | 44.7% |
| preparation | resource transport / both sides | 29.68 ± 11.3% | 29.50 ± 13.9% | 0.6% |
| first-invasion | restore checkpoint (harness only) | 0.47 ± 5.1% | 0.55 ± 4.8% | -17.5% |
| first-invasion | session tick with potential rebuild | 409.54 ± 12.4% | 285.75 ± 22.4% | 30.2% |
| first-invasion | 10 session ticks (one rebuild cadence) | 1209.03 ± 15.0% | 806.67 ± 8.8% | 33.3% |
| first-invasion | potential preparation / both sides | 278.69 ± 28.8% | 92.36 ± 2.3% | 66.9% |
| first-invasion | potential rebuild / both sides (includes preparation) | 532.06 ± 15.3% | 191.49 ± 11.6% | 64.0% |
| first-invasion | resource transport / both sides | 44.32 ± 17.8% | 27.98 ± 5.8% | 36.9% |
| multiple-fronts | restore checkpoint (harness only) | 0.62 ± 4.8% | 0.52 ± 3.3% | 16.0% |
| multiple-fronts | session tick with potential rebuild | 584.31 ± 18.4% | 232.59 ± 13.5% | 60.2% |
| multiple-fronts | 10 session ticks (one rebuild cadence) | 1468.12 ± 7.4% | 948.88 ± 9.4% | 35.4% |
| multiple-fronts | potential preparation / both sides | 256.85 ± 13.3% | 101.77 ± 12.4% | 60.4% |
| multiple-fronts | potential rebuild / both sides (includes preparation) | 447.59 ± 35.7% | 158.30 ± 6.2% | 64.6% |
| multiple-fronts | resource transport / both sides | 43.19 ± 17.5% | 40.50 ± 14.1% | 6.2% |

Full 10-tick mean times fell by about 20–35%. Potential preparation was about
2.1–3.0× faster. Some samples have large RME, especially the preparation
scenario's full-tick measurements; use local repeated runs for precise claims.
The restore-only row is sub-millisecond harness overhead, not simulation work.

`2026-09-13-after.json` records all 18 optimized measurements. The original
baseline is retained separately to expose variation between runs.

## Rules v2 baseline

`2026-09-13-rules-v2.json` records all 18 measurements for the disclosure/invasion
prototype introduced after `5bce5fa`, in the same commit as this artifact.
Environment: Linux x64, AMD EPYC 9V74 80-Core Processor, Node 24.19.0, Vitest 3.2.7.
Command: `npm run bench:conquest`, run without concurrent project tests/builds.
The strategic opponent is disabled in these fixed fixtures.

| Scenario | Rebuild tick, ms ± RME | 10 ticks, ms ± RME |
| --- | ---: | ---: |
| preparation | 83.94 ± 1.8% | 272.98 ± 1.2% |
| first-invasion | 87.99 ± 1.9% | 290.62 ± 3.2% |
| multiple-fronts | 101.88 ± 3.0% | 453.32 ± 2.8% |

Both hardware and gameplay workloads differ from the v1 cache runs above.
These numbers establish a new baseline; they do not quantify a speedup over v1.
