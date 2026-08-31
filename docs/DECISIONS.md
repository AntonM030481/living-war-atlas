# Decisions Log — Living War Atlas MVP v0.1

This document records deliberate design decisions so they are not reopened accidentally during implementation.

## Product / interaction

### D001 — Core fantasy
**Decision:** The product is a **living military atlas**.

The visual and interaction language should resemble animated operational maps rather than an RTS battlefield.

### D002 — No direct unit control
**Decision:** No player-controlled units.

Reason: individual unit control recreates the micromanagement and local optimization problem the concept is explicitly trying to avoid.

### D003 — No hidden discrete armies in MVP
**Decision:** Do not secretly simulate divisions / armies and merely hide them from the player.

Reason: that would preserve a tactical AI layer whose locally suboptimal decisions would remain visible indirectly and could frustrate expert players.

### D004 — Front is the main gameplay object
**Decision:** The dynamic front line and the resource system supporting it are the central simulation objects.

---

## Map / territory

### D005 — Hidden square grid
**Decision:** Use a hidden fine square grid under a smooth rendered map.

Reason: simplest implementation for local continuous fields, connectivity, and encirclement while avoiding visible hex/grid gameplay.

### D006 — Terrain in MVP
**Decision:** Include rivers and forests in M0/MVP.

Terrain should affect transport / movement geometrically, with smaller direct defence modifiers.

### D007 — Two sides first
**Decision:** MVP starts with exactly two opposing sides.

Reason: enough to validate front dynamics without multi-faction complexity.

### D008 — Pre-war borders are informational
**Decision:** Keep historical / political borders visible, but do not make them authoritative for military control.

The actual front is the relevant control boundary.

---

## Resource model

### D009 — Exactly one War Resource
**Decision:** MVP has one player-relevant physical military resource.

Do not split into supply, manpower, ammunition, fuel, reinforcement, etc.

### D010 — Front thickness is accumulated resource
**Decision:** “Front mass” / “front thickness” is a derived state created by accumulated War Resource near the front.

It is not a second resource.

### D011 — Physical flows
**Decision:** War Resource physically flows from cities through controlled territory toward the front.

Do not use a single global resource pool.

### D012 — Limited throughput
**Decision:** Territory / edges have finite transport capacity.

Reason: narrow corridors and deep salients must become weak before full encirclement.

### D013 — No manually managed stockpiles
**Decision:** Do not add a separate stockpile resource.

The accumulated War Resource / front mass already provides inertia after supply is cut.

---

## Cities

### D014 — Different city strengths, same resource
**Decision:** Cities have different production strengths but all generate the same resource.

### D015 — Capture behavior
**Decision:** When a city is decisively captured:
- previous owner loses its output immediately;
- new owner starts at zero useful output;
- new owner's output integrates / recovers gradually.

Do not use the earlier `100 → 40 → 0 → ...` mixed-control concept.

---

## Front dynamics

### D016 — Mostly stable warfare
**Decision:** Defence has a structural advantage.

The default behavior should often be positional / metastable rather than constant territorial motion.

Reason: gameplay is about seeing and creating weak points, not watching arbitrary perpetual movement.

### D017 — Instability and tipping points
**Decision:** Use accumulated instability so pressure can be absorbed, remembered, or cross a nonlinear threshold into collapse.

### D018 — Recovery depends on existing system
**Decision:** Instability recovery depends on incoming resource and local front mass.

Avoid a standalone fixed recovery timer as the main mechanism.

### D019 — Collapse accelerates retreat
**Decision:** Local collapse creates a period of sharply increased retreat / front movement.

Do not have AI search for an optimal fallback line.

### D020 — Weak surface tension only
**Decision:** Use weak smoothing to suppress numerical noise.

Do not make curvature itself the dominant reason a salient fails.

---

## Encirclement

### D021 — Encirclement is emergent
**Decision:** No explicit encirclement combat debuff.

A pocket suffers because physical resource flow is cut.

### D022 — Full pockets supported
**Decision:** Allow separate enclosed controlled regions.

Do not automatically delete small pockets in MVP.

---

## Autonomous behavior

### D023 — Local deterministic allocation
**Decision:** Resource allocation is handled by simple deterministic local rules.

Prefer predictable rules over sophisticated opaque AI.

### D024 — Hold is automatic
**Decision:** The player does not issue Hold orders.

The autonomous system is responsible for ordinary defence and local reinforcement.

---

## Player operations

### D025 — Arrows are the control language
**Decision:** Both advance and retreat are expressed with military-atlas-style arrows.

### D026 — Advance arrow meaning
**Decision:** Player specifies:
- the front sector where the operation begins;
- the target / direction.

The player does not define exact width or tactical route.

### D027 — Retreat uses the same language
**Decision:** Retreat is also an arrow from a front sector toward a desired rearward area.

### D028 — Unlimited arrows
**Decision:** No artificial maximum number of advance or retreat operations.

Earlier ideas such as a two-operation cap were explicitly rejected.

### D029 — Chaos is punished systemically
**Decision:** Too many or contradictory operations should fail because they disperse demand, overload capacity, and cause slow reorganization.

Do not add command-point limits solely to prevent micro.

### D030 — No manual operation percentages
**Decision:** Player does not assign `60% / 30% / 10%` or explicit strength values to arrows.

### D031 — Orders have inertia
**Decision:** Orders can be changed at any time, but resource flows react gradually.

This replaces artificial minimum commitment timers / cooldowns.

### D032 — Operations settle after completion
**Decision:** Reaching a target does not instantly free all committed flow.

Operations enter a consolidation / settling phase first.

### D033 — Qualitative preview only
**Decision:** Preview expected resource redistribution and likely weakened sectors.

Do not show exact future front positions or deterministic outcome predictions.

---

## Randomness / simulation

### D034 — Small seeded noise
**Decision:** Use small seeded local noise, initially around ±1–3%.

It should perturb near-critical systems, not dominate outcomes.

### D035 — Real-time, not turn-based
**Decision:** Simulation runs continuously.

Reason: continuous time makes autonomous local behavior feel natural and prevents turn-by-turn perfectionism.

### D036 — Speeds
**Decision:** Player-facing speeds are `1× / 2× / 4× / 8× / 16×`.

Pause exists as a normal runtime control.

---

## Map / scenario

### D037 — One handcrafted map first
**Decision:** Do not build procedural generation for MVP.

Use one authored test map containing multiple useful conditions.

### D038 — Medium test scale
**Decision:** Target roughly 8–12 cities.

### D039 — Balanced but asymmetric
**Decision:** Total economic potential should be roughly balanced, while geography and city positions are asymmetric.

### D040 — Warm-up
**Decision:** Run a hidden warm-up before exposing the initial state so flows and the front begin near a coherent equilibrium.

---

## Victory / duration

### D041 — Victory by loss of functioning cities
**Decision:** A side loses when it has no functioning cities.

No surrender / morale layer in MVP.

### D042 — Target duration
**Decision:** Aim for roughly 15–25 minutes at `1×`, with ~20 minutes as the initial target.

---

## MVP evaluation

### D043 — Both simulation and game loop must work
**Decision:** MVP is successful only if:
1. AI-vs-AI is interesting to watch;
2. well-timed player intervention can materially change the war without guaranteeing success.

### D044 — Desired emergent phenomena
The simulation should be capable of producing, at least occasionally:

- stable fronts;
- small fluctuations;
- local instability;
- tipping points;
- collapse;
- breakthroughs;
- stabilization on a new line;
- salients;
- bottlenecks;
- encirclements;
- larger cascades.

### D045 — Do not expand until M0 is credible
**Decision:** Do not add game systems to compensate for an uninteresting autonomous front.

If M0 is not interesting, fix the simulation / visualization first.

### D046 — War Resource has two local phases, not two economic resources
**Decision:** The single War Resource may be locally classified as:
- `committed` — currently engaged in the fight;
- `reserve/excess` — mobile War Resource not currently engaged.

This is a partition of the same conserved resource, not a second resource economy.
At every cell:

`total War Resource = committed + reserve`

### D047 — Only committed mass has combat effect
**Decision:** Attack, defence, frontline maintenance, and combat attrition use committed mass only.

Reserve / excess does not contribute to combat until it transitions into committed mass.

At an active front, local superiority should transition part of nearby reserve into offensive commitment. In a one-dimensional single-front case, surplus reserve has no alternative direction and should not remain idle.

### D048 — Committed mass cannot be transported while it provides combat value
**Decision:** The transport system may move only reserve / excess.

A resource amount cannot simultaneously provide defence and be redeployed elsewhere.

### D049 — Commitment and release have inertia
**Decision:** `reserve -> committed` and `committed -> reserve` are gradual transitions.

Engagement should normally be faster than disengagement. Collapse accelerates disengagement so retreat remains possible.

### D050 — Diagnostics are generated from deterministic scenarios
**Decision:** Committed / reserve regression plots are generated via `npm run diagnostics`.

The CSV and SVG outputs are diagnostic artifacts, not authoritative simulation inputs.

---

## Game modes / meta layer

### D051 — Game modes sit above the shared simulation
**Decision:** Sandbox and future meta-games use the same `Simulation` physics through a `GameSession` layer.

A game mode owns allowed strategic actions, completion rules, and mode state. It must not embed mode-specific rules into combat or transport.

### D052 — Sandbox is a first-class game mode
**Decision:** The existing city production toggle / ownership-switch playground is implemented as `SandboxMetaGame`, not as special-case UI behavior.

### D053 — UI is action-driven by the selected mode
**Decision:** `GameApp` consumes `availableActions` and a mode view from the worker.

The UI must not assume that a city click always means production toggle. Sandbox, Partisans, and Conquest expose different click actions and HUD guidance.

### D054 — Mode is chosen before a compatible map
**Decision:** New Game selects `game mode -> compatible map`.

Maps may declare additional requirements implicitly through their data; Conquest currently requires regions.

### D055 — Session history includes meta-game state
**Decision:** Rewind/persistence stores `GameSessionState`, including simulation state, selected mode, and mode-specific state.

Restoring simulation state without the corresponding meta-game state is invalid.
