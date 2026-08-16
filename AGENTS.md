# Living War Atlas

Read these before changing simulation behavior:

- `docs/MVP_SPEC.md`
- `docs/TECH_SPEC.md`
- `docs/DECISIONS.md`

## Core design constraints

- The product concept is a **living military atlas**, not a traditional RTS.
- There are no player-controlled units.
- There are no hidden discrete armies in the MVP.
- The **front** is the primary gameplay object.
- Simulation uses a hidden fine square grid.
- There is exactly **one War Resource**.
- Cities generate War Resource.
- War Resource physically flows through controlled territory toward the front.
- Local front thickness / mass is accumulated War Resource near the front, not a second resource.
- Fronts should normally tend toward metastable equilibrium.
- Local instability may decay or cross a tipping point into collapse.
- Encirclement must emerge from geometry and loss of resource flow, not from an explicit encirclement debuff.
- Player intent is expressed with military-atlas-style arrows.
- Advance and retreat arrows are unlimited.
- Chaotic or contradictory orders should be punished by the simulation itself through resource dispersion, congestion, and redistribution inertia — not artificial command limits.
- Hold / defence is autonomous.
- Prefer simple local rules that create emergent global behavior over sophisticated AI.
- Avoid adding systems unless required to validate the current MVP hypothesis.

## Current milestone

Current milestone: **M0 — Autonomous Front**.

The immediate goal is to validate whether the autonomous simulation is interesting before expanding the game layer.

The simulation should be able to produce:

- mostly stable fronts;
- small local fluctuations that usually decay;
- gradual accumulation of instability;
- occasional tipping points;
- local collapse;
- breakthrough and subsequent stabilization;
- salients;
- bottlenecks;
- encirclements that emerge from geometry and logistics.

## Development workflow

Before changing code:

1. Read the specs listed above.
2. Inspect the current implementation and current behavior.
3. Distinguish simulation problems from rendering / UX problems.
4. Prefer the smallest change that tests the current hypothesis.
5. Preserve deterministic seeded simulation.
6. Keep simulation independent from rendering.
7. Do not expand scope incidentally.

When asked to review, analyze, inspect, or propose changes, remain read-only unless the user explicitly asks to implement or modify files.

## Explicitly out of scope for MVP v0.1

Do not add any of the following unless explicitly requested:

- player-controlled units;
- hidden discrete armies;
- unit types;
- manpower;
- ammunition;
- fuel;
- multiple economic resources;
- roads / railways;
- technology trees;
- construction systems;
- diplomacy;
- politics;
- resistance / partisans;
- manual garrisons;
- multiplayer;
- procedural maps;
- campaigns;
- historical scenarios.

## Coding principles

- Simulation logic must not depend on PixiJS or UI state.
- Use fixed simulation timesteps.
- Use seeded RNG for all stochastic behavior that can affect simulation outcomes.
- Avoid update-order dependence by using buffers for field transport where appropriate.
- Keep parameters centralized and easy to tune.
- Add debug visualization before adding complexity when the behavior is hard to explain.
- If a rule cannot be explained simply, question whether it belongs in the MVP.
