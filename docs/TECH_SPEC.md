# Technical Spec v0.1 — Simulation Core

## 1. Stack

Initial implementation:

- Vite
- TypeScript
- PixiJS
- Web Worker for simulation
- Vitest for deterministic tests

No React, backend, or WASM is required for MVP.

Renderer must remain separate from simulation:

```ts
simulation.step(dt)
renderer.render(simulation.snapshot())
```

---

## 2. One physical resource

There is one physical resource field per side:

```ts
warBlue: Float32Array
warRed: Float32Array
```

Do not introduce separate physical fields for:

- supply;
- reinforcements;
- stockpile;
- front mass.

`frontMass` may exist as a **derived quantity** calculated from local accumulated War Resource near the front.

---

## 3. Grid

Start with a parameterized hidden grid, for example:

```ts
GRID_WIDTH = 192
GRID_HEIGHT = 128
```

The player never sees the grid.

Increase resolution only when required by behavior or rendering.

---

## 4. Primary fields

Suggested persistent fields:

```ts
interface WorldFields {
  control: Float32Array

  warBlue: Float32Array
  warRed: Float32Array

  instabilityBlue: Float32Array
  instabilityRed: Float32Array

  terrainMobility: Float32Array
  terrainDefense: Float32Array
  terrainCapacity: Float32Array
}
```

Suggested derived / temporary fields:

```ts
needBlue
needRed

flowBlueX
flowBlueY
flowRedX
flowRedY

pressureBlue
pressureRed

potentialBlue
potentialRed
```

Exact field count may change if a simpler implementation preserves the same model.

---

## 5. Control field

Use:

```text
control ∈ [-1, +1]
```

Convention:

```text
+1 = strong Blue control
 0 = front
-1 = strong Red control
```

The visible front is the `control = 0` contour.

Use Marching Squares or an equivalent contour extraction method for rendering.

The physics should not rely on an explicit front polyline as the authoritative world state.

---

## 6. Front evolution

Use a continuous control-field / phase-field style model rather than moving line vertices directly.

Conceptual structure:

```text
dC/dt =
    smoothing
  + restoring
  + combat forcing
```

A possible starting form:

```text
dC/dt =
    Ks * weightedLaplacian(C)
  + Kr * C * (1 - C²)
  + Kw * warPressure * (1 - C²)
```

Intent:

- `weightedLaplacian` provides weak surface tension / numerical stabilization;
- `C * (1 - C²)` encourages territory to remain near `-1` or `+1`;
- `(1 - C²)` keeps combat forcing concentrated near the front.

This is a starting model, not a sacred formula. Behavior matters more than preserving this exact equation.

---

## 7. Terrain

### Cell terrain

Store local modifiers for:

- mobility;
- defence;
- capacity.

### Rivers

Prefer representing rivers as modifiers on grid edges rather than only on cells.

For example:

```ts
riverHorizontal: Float32Array
riverVertical: Float32Array
```

Crossing a river should reduce:

- movement / territorial advance;
- resource throughput;
- attack effectiveness.

Movement parallel to a river should be affected much less.

---

## 8. Cities

Example:

```ts
interface City {
  x: number
  y: number
  baseProduction: number
  owner: Side
  integration: number // 0..1
}
```

Output:

```text
output = baseProduction * integration
```

Each tick:

```ts
war[cityCell] += output * dt
```

---

## 9. City capture

Use hysteresis to avoid city ownership flicker from tiny front oscillations.

Example:

```text
Blue → Red when control < -0.4
Red → Blue when control > +0.4
```

On capture:

```text
old owner output = 0 immediately
new owner integration = 0
```

Then integration recovers gradually toward `1`.

Exact thresholds and timings are tuning parameters.

---

## 10. Derived front mass

`frontMass` is not a separate conserved resource.

Compute it from local War Resource near the front.

Conceptually:

```text
frontMassBlue =
    sum(warBlue cells within R behind Blue side of front)
```

Use a small radius / kernel, initially perhaps 3–5 grid cells.

This derived value can drive:

- defence;
- attack;
- visual front thickness;
- recovery.

---

## 11. Front demand

Resource demand near the front may combine:

```text
need =
    maintenance
  + instability need
  + operation influence
```

Example conceptual form:

```text
need =
    Kbase
  + Ki * instability
  + Ko * operationInfluence
```

Do not expose these as player-managed percentages.

---

## 12. Resource transport

Do not start with a global max-flow solver.

Prefer a simpler field-based transport model.

### Potential

Build / relax a potential field from areas of front demand back through controlled territory.

Potential should decay with:

- distance;
- terrain resistance;
- poor control.

### Flow

War Resource moves down / up the chosen potential convention toward demand.

Conceptually:

```text
flow ∝ potentialGradient * conductivity
flow <= edgeCapacity
```

Transport must conserve War Resource.

Use incoming / outgoing buffers so results are not dependent on cell iteration order.

---

## 13. Conductivity

Conductivity depends continuously on territorial control.

For Blue, for example:

```text
control ≈ +1 → high conductivity
control ≈ 0  → reduced conductivity
control < 0  → near zero
```

A smoothstep-like function is appropriate.

Red uses the mirrored relation.

This should make almost-cut corridors gradually lose throughput before total disconnection.

---

## 14. Capacity and congestion

Each local edge / transport connection has finite throughput.

Conceptually:

```text
desiredFlow > capacity
→ actualFlow capped
→ congestion / unmet demand
```

This should produce:

- bottlenecks;
- vulnerability of narrow salients;
- competition between operations;
- gradual logistic strangulation before full encirclement.

Avoid adding a separate arbitrary congestion debuff when simple capped flow already creates the effect.

---

## 15. Resource consumption

War Resource near the front is consumed.

Conceptual relationship:

```text
consumption =
    maintenance
  + combatIntensity * Kcombat
  + offensiveIntensity * Koffensive
```

Desired ordering:

```text
quiet < defence under pressure < offensive push < breakthrough/collapse
```

---

## 16. Attack and defence

Starting abstraction:

```text
attackPower =
    frontMass
  * offensiveIntent
  * terrainAttackFactor
```

```text
defencePower =
    frontMass
  * defenceAdvantage
  * terrainDefenceFactor
  * stabilityFactor
```

Require:

```text
defenceAdvantage > 1
```

at baseline so equal sides naturally tend toward positional stability.

---

## 17. Autonomous probing

Without player or strategic AI operations, the system should still have low-level local activity.

A small `baseProbe` can represent:

- local attacks;
- initiative;
- reconnaissance;
- normal battlefield fluctuation.

Most such disturbances should decay.

---

## 18. Instability

Compute local stress from opposing pressure versus defence.

Conceptually:

```text
stress = enemyAttack / ownDefence
```

If stress is below the stability threshold:

- instability decays / recovers.

If stress exceeds it:

- instability rises nonlinearly.

Possible starting shape:

```ts
instability +=
  stressRate *
  Math.pow(Math.max(0, stress - 1), 1.5) *
  dt
```

---

## 19. Recovery

Instability recovery should depend on the same existing system:

- incoming flow;
- local front mass.

Conceptually:

```text
recovery =
    Kr
  * frontMassFactor
  * incomingFlowFactor
```

Avoid a completely independent fixed recovery timer if possible.

---

## 20. Collapse

Use hysteresis.

Example:

```text
ENTER COLLAPSE: instability >= 1.0
EXIT COLLAPSE:  instability <= 0.55
```

During collapse:

- defence effectiveness drops;
- retreat velocity rises sharply;
- combat resource consumption may increase.

Exact thresholds are tunable.

Collapse should create a strong nonlinear difference between “almost failing” and “failed”.

---

## 21. Territorial forcing

Calculate side-specific local advance tendency.

Then:

```text
warPressure = advanceBlue - advanceRed
```

Feed that forcing into the control-field evolution.

Before collapse, territorial motion should usually be slow.

Against a collapsed sector, advance speed should rise substantially.

---

## 22. Encirclement

Do not use an `ENCIRCLED` combat debuff as the causal mechanic.

If a region loses viable transport connectivity to friendly production:

```text
incoming flow → 0
```

Existing War Resource remains and is consumed over time.

Connectivity analysis may still exist for:

- debugging;
- UI;
- telemetry.

But the actual penalty should arise from loss of flow.

---

## 23. Operations

Example:

```ts
interface Operation {
  side: Side
  start: Vec2
  target: Vec2
  type: "advance" | "retreat"

  state:
    | "forming"
    | "active"
    | "settling"

  strength: number // calculated internally, not chosen by player
}
```

### Advance

An advance arrow creates an `operationInfluence` field.

It should:

- increase demand around its starting front sector;
- increase offensive intent toward the target.

Resource then redistributes physically.

### Retreat

Retreat uses the same control language.

It should:

- reduce demand / willingness to hold the selected sector;
- bias territorial movement backward toward the indicated area;
- release resource gradually rather than instantly.

---

## 24. Multiple operations

Do not impose a maximum number of arrows.

Operation influences may overlap.

All operations compete for the same finite resource transport system.

Too many simultaneous intentions should result in:

- dispersed demand;
- congestion;
- weak concentration;
- slow reorganization.

Do not add player-visible priority percentages in MVP.

---

## 25. Operation inertia

Operation influence should ramp rather than switch instantly.

Conceptually:

```text
forming: 0 → 1
settling: 1 → 0
```

More importantly, resource transport itself must take time to reorganize.

Constantly redrawing arrows should therefore be naturally inefficient.

---

## 26. Preview

Before committing an operation, calculate only a qualitative redistribution preview.

Show likely:

- increased demand;
- redirected flows;
- weakened sectors;
- possible congestion.

Do not run an exact future combat simulation for preview.

---

## 27. Randomness

Use seeded RNG.

Prefer smooth noise over per-cell white noise.

Initial target magnitude: roughly **±1–3%** on local combat effectiveness or similar low-level variables.

The noise should perturb near-critical systems, not dominate them.

---

## 28. Fixed timestep

Use fixed simulation steps.

Starting point:

```ts
SIM_DT = 0.1
```

Game speed changes how many fixed steps are executed, not the size of `dt`.

This supports deterministic reproduction.

---

## 29. Update loop

Suggested tick order:

```text
1. Update operation inertia
2. Update city ownership / integration
3. Cities generate War Resource
4. Update / identify front band
5. Derive local front mass
6. Calculate front demand
7. Relax / rebuild resource potentials
8. Transport War Resource
9. Calculate attack / defence / pressure
10. Consume War Resource
11. Update instability
12. Enter / exit collapse
13. Calculate territorial forcing
14. Update control field
15. Apply weak smoothing / stabilization
16. Apply tiny seeded perturbations
17. Update strategic AI when due
18. Emit snapshot / debug metrics
```

Change this ordering only intentionally; document why if behavior depends on the order.

---

## 30. Multi-rate systems

Not every subsystem must run at the same rate.

Possible starting frequencies:

### 10 Hz

- transport;
- combat;
- instability;
- control evolution.

### 2–5 Hz

- potential relaxation;
- contour / front analysis.

### ~1 Hz

- strategic AI;
- high-level city evaluation.

### Rendering

Target normal display refresh independently, e.g. 60 FPS with interpolation between simulation snapshots.

---

## 31. Web Worker

Run simulation separately from rendering / input.

Conceptually:

```text
Main thread
  PixiJS
  input
  UI

      ↕ snapshots / commands

Simulation Worker
  fixed timestep
  fields
  strategic AI
```

---

## 32. Rendering

Current implementation entrypoints:

- `src/main.ts` owns the browser UI / DOM overlay: HUD, legend, front probe panel, city point badges, city production markers, city name labels, and the optional city diagnostics panel.
- `src/style.css` owns the styling for that DOM overlay, including `.city-power-label`, `.city-name-label`, `.city-points-badge`, `.legend`, `.probe-panel`, and `.diagnostics-panel`.
- `src/rendering/AtlasRenderer.ts` owns the PixiJS canvas map: terrain, grid, prewar border, territory tint, resource density, resource-flow arrows, front contour, instability marks, and front probe marker.
- `src/map/testMap.ts` owns authored map data: dimensions, cities, forests, initial front, and river curve.
- `src/sim/Simulation.ts` and `src/sim/types.ts` own simulation state and snapshot fields. Rendering and DOM overlays should only consume snapshots, not mutate simulation state.

Do not duplicate the same visual object in both PixiJS and DOM. City markers are currently DOM-only: the visible city circle with production number and the city name label are created in `src/main.ts` and styled in `src/style.css`. PixiJS city rings / reserve circles should not be reintroduced unless the HTML city overlay is removed at the same time.

### Terrain

Static map layer in `AtlasRenderer.drawTerrain()`.

Terrain includes:

- paper background and grid texture;
- authored forests as simple green irregular patches;
- authored river as a smooth blue line.

### Territory

Subtle side tint in `AtlasRenderer.drawTerritory()`.

### Front

Extract `control = 0` contour in `AtlasRenderer.drawFront()`.

The front should look like a military-atlas line, not a raw numerical-field edge.

Front thickness may reflect derived local mass, but avoid white halos or grid-like contour artifacts.

### Flows

Visualize resource transport as coherent directional flows from cities toward front sectors in `AtlasRenderer.drawFlows()`.

Avoid random short dashes scattered uniformly over territory.

Flow should make it possible to understand:

- which cities support which sectors;
- where routes merge;
- where bottlenecks occur;
- which sectors are starving.

### Operations

Render broad military-atlas-style arrows.

### DOM overlay

DOM overlay elements are positioned from world coordinates through `AtlasRenderer.worldToScreen()` and `AtlasRenderer.mapScreenRect()`.

Current DOM overlay responsibilities:

- top corner city point totals: `.city-points-badge`;
- city production circles: `.city-power-label`;
- city names: `.city-name-label`;
- HUD controls and speed / rewind buttons;
- map legend;
- front probe table;
- optional city diagnostics table.

City click detection remains in `AtlasRenderer.cityIdAtClientPoint()` so the DOM labels can keep `pointer-events: none`.

City labels are hidden when the city cell is not firmly controlled by its owner. The front is the primary map object, so a contested city marker must not sit visibly on top of the front contour.

---

## 33. Debug views

Current debug / diagnostic behavior:

```text
Resource density + instability/stress overlay — always visible in the current prototype
Front probe — click the front line
Diag button / F3 — optional city diagnostics panel
SPACE — pause / resume
Left / Right arrows — rewind / advance saved history by one 5-second checkpoint
Up / Down arrows — change speed
```

The `Diag` panel is intentionally off by default because it adds per-city local checks every rendered snapshot. When enabled, it is built in `src/main.ts` from the latest `SimulationSnapshot` and shows:

- city production;
- own-side War Resource at the city cell;
- local own-side War Resource around the city;
- own-side flow magnitude at the city cell;
- local own-side flow around the city.

Use this panel when checking whether a distant city is actually participating in the resource system. It is a runtime diagnostic view, not an authoritative simulation input.

---

## 34. Suggested code organization

```text
src/
  sim/
    Simulation.ts
    WorldState.ts
    Config.ts
    ControlField.ts
    ResourceTransport.ts
    Combat.ts
    Instability.ts
    Terrain.ts
    Cities.ts
    Operations.ts
    StrategicAI.ts
    RNG.ts

  worker/
    simulation.worker.ts

  rendering/
    WorldRenderer.ts
    TerrainLayer.ts
    TerritoryLayer.ts
    FrontLayer.ts
    FlowLayer.ts
    CityLayer.ts
    OperationLayer.ts
    DebugLayer.ts

  input/
    OperationDrawing.ts

  map/
    testMap.ts
```

This is guidance, not a requirement if the current codebase has a cleaner equivalent structure.

---

## 35. M0 — Autonomous Front

M0 contains:

- two sides;
- 8–12 cities;
- terrain;
- production;
- War Resource transport;
- front;
- combat;
- instability;
- collapse.

No player operations are required yet.

Primary M0 criterion:

> The front should look like a system that is continuously under local pressure, while most small disturbances are naturally absorbed.

---

## 36. M1 — Butterfly

Add one player-drawn advance operation.

Test whether a small strategic concentration at the right weak point can produce any of:

- no meaningful effect;
- a small temporary movement;
- a tipping point;
- collapse;
- a larger cascade.

The difference should arise mainly from the state of the system, not from a huge arbitrary operation bonus.

---

## 37. M2 — Living Atlas

After the core behavior is credible, add:

- multiple operations;
- retreat operations;
- AI vs AI;
- polished flows;
- polished front rendering;
- military-atlas arrows;
- `1× / 2× / 4× / 8× / 16×`.

Only then evaluate whether the result is becoming a game rather than merely an attractive simulation.

---

## 38. Committed / reserve partition

Keep one conserved War Resource field per side, plus a persistent `committed` amount per cell:

```ts
warBlue[i] = committedBlue[i] + reserveBlue[i]
reserveBlue[i] = warBlue[i] - committedBlue[i]
```

Same for Red.

`committed` is a state / phase of the same resource, not an independently generated or transported resource.

### Combat

Derive front combat mass from `committed` only.

Reserve does not affect attack, defence, or combat attrition until it commits.

Local superiority at an active front creates offensive commitment. In a one-dimensional single-front case with no competing demand, surplus reserve near the front should be committed into pressure instead of remaining idle.

### Transport

Transport may move only:

```text
reserve = max(0, war - committed)
```

Committed mass remains at its location while it is providing combat value.

### Attrition

Combat / frontline maintenance reduces committed mass and removes the same absolute amount from total War Resource. Therefore reserve remains unchanged by combat attrition.

### Transition

Compute a target committed fraction from local opposing mass and terrain. Move gradually toward that target:

- engagement rate: relatively fast;
- release rate: slower;
- collapse release: faster than normal release.

Release applies when pressure falls, collapse releases the front, or the active front/contact disappears. It should not prevent exploitation at an active front with unopposed or weak enemy mass.

Always preserve:

```text
0 <= committed <= war
```

### Diagnostics

`npm run diagnostics` regenerates CSV and SVG artifacts under `diagnostics/` from deterministic simulation scenarios.
