# Simulation performance benchmarks

Run with:

```sh
npm run bench:sim
```

The baseline scenario intentionally matches the standard Full Playground opening:

- map: `theatre` (the standard large map)
- seed: `1`
- one deterministic `baseProduction === 2` city per side is converted into an enemy enclave
- the same shared `seedInitialEnclaves` helper is used by the worker and the benchmarks

Current benchmarks measure:

- restoring the canonical start state, to expose harness/reset overhead
- 10 simulation ticks from that state (one `potentialEverySteps` cadence)
- 100 simulation ticks from that state

No profiling instrumentation is added to the production hot path.
