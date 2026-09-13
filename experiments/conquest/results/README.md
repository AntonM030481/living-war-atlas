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
