# Living War Atlas — M0

First runnable prototype of the **living military atlas** concept.

## What is implemented

- two autonomous sides;
- continuous control field on a hidden square grid;
- smooth front derived from the control field;
- 10 cities with unequal production;
- one War Resource;
- physical resource transport through controlled territory;
- finite route capacity / bottlenecks;
- rivers and mountains affecting mobility, defence and throughput;
- front mass emerging from accumulated War Resource;
- defensive advantage, instability and local collapse;
- seeded local fluctuations;
- city capture and gradual integration;
- AI-vs-AI baseline behaviour (local autonomous adaptation; strategic operations come in M1/M2);
- 1x / 2x / 4x speed, pause, instability debug overlay.

## Run

Requires Node.js compatible with current Vite (Vite currently documents Node 20.19+ or 22.12+).

```bash
npm install
npm run dev
```

Build/tests:

```bash
npm run build
npm test
```

## Controls

- `1`, `2`, `4` — simulation speed
- `Space` — debug pause
- `F3` — instability overlay
- **New seed** — restart with a reproducibly different seed

## M0 question

Do the autonomous fronts look like a system that tends to stabilise, while still producing visible local tension and occasional nonlinear retreats?

Do not tune this into a full game yet. If the answer is no, change the simulation before adding strategic arrows.
