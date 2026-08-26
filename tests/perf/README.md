# Simulation performance benchmarks

Run the compact report with:

```sh
npm run bench:sim
```

Run the full Vitest benchmark output with:

```sh
npm run bench:sim:raw
```

The compact command runs the same Vitest benchmarks and only post-processes their console report. It shows `mean ± rme`, grouped into simulation and potential tables, plus the share of a one-side potential rebuild spent in coarse + fine relaxation. The raw command remains available for hz, percentiles, samples, and Vitest's comparison summary.

The baseline scenario intentionally matches the standard Full Playground opening:

- map: `theatre` (the standard large map)
- seed: `1`
- one deterministic `baseProduction === 2` city per side is converted into an enemy enclave
- the same shared `seedInitialEnclaves` helper is used by the worker and the benchmarks

Simulation benchmarks measure:

- restoring the canonical start state, to expose harness/reset overhead
- 1 heavy tick at 0, 50, and 100 ticks; each checkpoint is on a potential rebuild boundary
- 10 ticks at 0, 50, and 100 ticks, covering one full `potentialEverySteps` cadence
- 100 simulation ticks from the canonical start as the main end-to-end baseline

Potential benchmarks use the same 0, 50, and 100 tick checkpoints and measure:

- full potential rebuild for one side
- full potential rebuild for both sides
- preparation, including front-demand smoothing and status construction
- fine-relaxation stencil construction
- coarse-grid construction
- multi-source Dijkstra shortest-path solve
- coarse-relaxation stencil construction
- coarse relaxation
- coarse-to-fine projection
- fine relaxation

Stage benchmarks use the blue side because the solver is symmetric. The Dijkstra stage measures the shortest-path solve itself; the small distances-to-seed conversion is excluded. Fine relaxation resets its input with `Float32Array.set()` before each sample so every iteration starts from the same projected field. The fine- and coarse-stencil stages measure their one-time per-rebuild precomputation separately from the relaxation sweeps.

No timing/profiling instrumentation is added to the production hot path. Benchmark-only exports expose existing solver stages without changing the runtime scheduling of the simulation.
