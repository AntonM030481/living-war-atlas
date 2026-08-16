# MVP Spec v0.1 — Living War Atlas

## 1. Goal

Validate the concept of a **living military atlas**:

- war develops autonomously;
- the main object is the front line, not individual units;
- cities create one universal military resource;
- that resource physically flows through controlled territory to the front;
- the front normally tends toward a stable or metastable state;
- local disturbances may either decay or cross a tipping point and trigger a breakthrough;
- the player influences the war through strategic intentions rather than unit micromanagement.

The MVP succeeds only if both are true:

1. autonomous war is interesting to watch;
2. a well-timed player intervention can meaningfully alter the course of the war without guaranteeing the result.

---

## 2. Map

### Internal representation

Use a hidden fine **square grid**.

The player never sees the cells directly.

The grid stores continuous fields such as:

- territorial control;
- War Resource;
- instability;
- terrain;
- flow / transport state.

The visible front is rendered as a smooth contour derived from the control field.

### Map size

Use one manually authored test map with roughly **8–12 cities**.

The two sides should have roughly equal total economic power, but the geography and city layout should be asymmetric.

### Terrain

MVP terrain:

- plains;
- rivers;
- mountains / difficult terrain.

Terrain should primarily affect movement / transport geometrically, with smaller direct defensive modifiers.

---

## 3. States, borders, and territory

There are two sides.

Pre-war state borders remain visible as thin historical / political lines, but they are informational only in MVP v0.1.

They do not determine current control and do not grant gameplay modifiers.

The **actual front line** is the meaningful military boundary.

---

## 4. Cities

Cities are fixed points on the map.

Each city:

- belongs to one side;
- produces the same universal resource;
- has a production strength.

Example scale:

- small city: 50;
- medium city: 100;
- major city: 200.

There are no different resource types.

### City capture

When the front crosses a city decisively:

- the previous owner immediately receives zero output from it;
- the new owner becomes the controller;
- the city's production for the new owner recovers gradually from `0%` toward `100%`.

A recently captured city therefore does not instantly become a fully productive rear-area center.

---

## 5. One War Resource

MVP uses exactly one physical resource: **War Resource**.

Do not split it into:

- manpower;
- ammunition;
- fuel;
- supply;
- reinforcements;
- stockpiles.

A city generates War Resource.

War Resource:

- flows through controlled territory;
- accumulates near the front;
- supports the front;
- is consumed by fighting;
- provides the mass needed for offensive pressure.

The local “thickness” of the front is therefore a state created by accumulated War Resource, not a second player-managed resource.

---

## 6. Front mass

There are no discrete combat units, including hidden ones.

Military strength near the front is represented as a continuous local mass derived from accumulated War Resource.

A well-supplied sector becomes thicker / stronger over time.

During heavy combat, that accumulated mass is consumed.

If supply is cut, the sector does not disappear instantly: existing mass continues fighting until it is depleted.

This replaces the need for a separate stockpile system.

---

## 7. Resource flows

War Resource physically propagates from cities through controlled territory toward areas of demand near the front.

### Conductivity

Territory conducts its own side's resource according to control strength.

Conceptually:

- secure control → high conductivity;
- contested control → reduced conductivity;
- enemy control → zero conductivity.

This should be continuous rather than based on hard categorical states.

### Capacity

Transport has finite local capacity.

A narrow corridor therefore becomes a bottleneck before it is fully cut.

Consequences should emerge naturally:

- deep salients become harder to support;
- competing operations can overload the same routes;
- a corridor can be strategically fragile even before encirclement is complete.

---

## 8. Front

The front is the contour separating territorial control.

It may form:

- one continuous line;
- multiple separate fronts;
- salients;
- enclaves;
- encirclements.

### Surface tension

Use weak smoothing so tiny numerical spikes decay and the front remains visually readable.

However, the main danger of a salient should come from actual systemic consequences:

- longer frontage;
- increased transport distance;
- narrow base;
- limited throughput;
- pressure from multiple directions.

Do not make curvature itself a dominant game penalty.

---

## 9. Pressure and instability

A temporary local advantage should not automatically move the front substantially.

Each sector has an internal `instability`.

Pressure can increase instability.

If pressure decreases, instability recovers.

Recovery should depend on:

- incoming War Resource;
- local accumulated front mass.

A strongly supplied front should recover quickly.

An exhausted sector should retain vulnerability longer.

---

## 10. Collapse

When instability crosses a tipping point, the local sector enters **collapse**.

Collapse is not instant territory deletion.

Instead:

- effective resistance drops sharply;
- retreat speed increases substantially;
- resource consumption may increase;
- the front moves rapidly until new conditions allow stabilization.

The system must not search for a “smart fallback line”.

Stabilization should emerge from:

- shorter frontage;
- improved supply;
- incoming mass;
- rivers;
- mountains;
- reduced enemy pressure.

---

## 11. Attrition

Even a quiet front consumes a small amount of War Resource.

Consumption rises with activity:

`quiet < defence under pressure < active offensive < breakthrough/collapse`

This allows a front to remain geometrically stable while its underlying state changes.

Long pressure can prepare a future tipping point without immediate visible territorial movement.

---

## 12. Encirclement

Encirclement is not an explicit gameplay status or debuff.

It must emerge from geometry and transport connectivity.

If a controlled region loses a viable conducting path to any functioning friendly city:

- new War Resource stops arriving;
- existing local mass remains;
- combat gradually consumes it;
- instability increases;
- the pocket eventually collapses unless a corridor is reopened.

Do not automatically remove small pockets in MVP.

---

## 13. Autonomous allocation

The system decides where resource flows according to simple deterministic local rules.

No sophisticated planning AI is required.

Demand may depend on:

- instability;
- enemy pressure;
- local front mass;
- distance;
- route capacity;
- active strategic operations.

The autonomous system should:

- hold the front;
- react to local crises;
- reinforce stressed sectors;
- retreat locally after collapse.

---

## 14. Player control

The player does not issue Hold orders.

Holding and local defence are autonomous.

The player's primary control language is **military-atlas-style strategic arrows**.

### Advance

The player specifies:

1. the part of the front where concentration should begin;
2. a target / direction.

The simulation determines:

- the operational width;
- the exact local route;
- the detailed front deformation;
- the resource redistribution required.

### Retreat

Retreat uses the same arrow language.

The player selects a front sector and points toward the desired withdrawal direction / area.

Execution remains autonomous and inertial.

### Unlimited operations

There is no artificial cap on advance or retreat arrows.

Each operation creates demand for the same finite War Resource.

Too many or contradictory intentions should naturally create:

- resource dispersion;
- congestion;
- slow redistribution;
- ineffective concentration.

The simulation itself should punish command chaos.

---

## 15. Order inertia

Operations must not instantly redirect resources.

After an order changes:

- existing flows take time to reorganize;
- new routes build gradually;
- effects arrive with delay.

Repeatedly changing plans should therefore be self-defeating without any artificial cooldown.

### Completion

After reaching an objective:

`active → objective reached → settling / consolidation → finished`

Resource flows decay and reconfigure gradually rather than snapping immediately to a new state.

---

## 16. Order preview

Before committing an arrow, show a rough qualitative preview:

- which flows would tend to redirect;
- which areas would likely lose resource;
- where congestion may appear.

Do not show:

- exact future front positions;
- win probability;
- precise combat bonuses;
- deterministic outcome previews.

The player should understand the likely cost of a decision without being able to optimize by repeatedly searching exact forecasts.

---

## 17. Randomness

Use small seeded local stochastic variation, roughly in the **±1–3%** range.

The purpose is to provide small perturbations near tipping points, not to decide wars arbitrarily.

Prefer smooth spatial / temporal noise over independent per-cell random noise.

Every run must be reproducible by seed.

---

## 18. AI

Both sides can run autonomously.

Default development mode: **AI vs AI**.

The player may take control of either side and add strategic arrows.

Strategic AI should remain intentionally simple:

- identify potentially weak areas;
- periodically create operations;
- maintain them for a meaningful period;
- reevaluate later.

Complexity should come primarily from the simulation, not from deep AI planning.

---

## 19. Time

Real-time simulation.

Player-facing speeds:

- `1×`
- `2×`
- `4×`

A debug pause is allowed.

While paused for debugging, gameplay orders should not be issued.

Target war duration on `1×`: roughly **15–25 minutes**, with ~20 minutes as the initial target.

---

## 20. Initial state

Before the player sees the war, run a hidden warm-up.

Start from authored:

- cities;
- initial territories;
- pre-war border;
- terrain;
- initial resource distribution.

Let flows, local mass, and the front approach a stable state before exposing `t = 0`.

---

## 21. Victory

A side loses when it has no functioning cities remaining.

Do not add morale or surrender systems in MVP v0.1.

If later tests show that outcomes become obvious too long before formal elimination, surrender can be added on top.

---

## 22. Visual language

Primary visual reference: **a classic military atlas that has come alive**.

Show:

- cities;
- rivers;
- mountains;
- thin pre-war borders;
- a strong dynamic front line;
- strategic arrows;
- visible resource flows.

Without debug numbers, the player should eventually be able to recognize:

- overloaded routes;
- exhausted sectors;
- concentration;
- salients;
- weak bases of salients;
- sectors close to failure.

---

## 23. Debug views

The normal game view should remain visual and qualitative.

Debug views should expose:

- control;
- War Resource;
- instability;
- potentials;
- flow vectors;
- capacity / congestion;
- terrain mobility;
- operation influence;
- collapse state.

A core development question is:

> If debug overlays are hidden, can a human still see where a crisis is developing?

---

## 24. Explicitly excluded from MVP v0.1

Do not add:

- discrete units;
- hidden armies;
- unit types;
- manpower;
- fuel;
- ammunition;
- multiple economic resources;
- technology;
- construction;
- diplomacy;
- politics;
- resistance / partisans;
- manual garrisons;
- roads / railways;
- multiplayer;
- procedural maps;
- campaign systems;
- historical scenarios.

---

## 25. MVP success test

The desired autonomous sequence is:

`stable front`

→ small local fluctuations

→ most disturbances decay

→ local instability accumulates

→ occasionally a weak point appears

→ AI or player concentrates resource

→ instability crosses a tipping point

→ local collapse

→ breakthrough

→ possible salient / bottleneck / encirclement

→ either a broader cascade

→ or stabilization on a new front.

The central question is:

> Can a few simple continuous rules produce a war that is interesting both to watch and to influence?

---

## 26. Reserve vs committed phase of War Resource

The single War Resource has two local phases:

- **committed mass** — War Resource actively engaged in the current fight;
- **reserve / excess** — mobile War Resource not currently engaged.

This does not introduce a second economic resource. It is a partition of the same conserved quantity:

`total War Resource = committed + reserve`

Only committed mass contributes to attack and defence and pays frontline combat / maintenance attrition.

Only reserve / excess may be transported normally.

Transition is gradual:

`reserve -> committed` when a sector requires more combat mass;

`committed -> reserve` when pressure falls or the local force is excessive.

At an active front, local superiority can also commit reserve offensively. In a one-dimensional fight with no competing direction or bottleneck, front-local surplus should become pressure rather than idle reserve.

Disengagement is normally slower than engagement. Collapse or loss of active contact may accelerate disengagement to permit retreat / redeployment.
