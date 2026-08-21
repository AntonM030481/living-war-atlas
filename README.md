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
- rivers and forests affecting mobility, defence and throughput;
- front mass emerging from accumulated War Resource;
- battle commitment: mass needed to hold an active fight cannot freely drain back into the rear; only local excess remains mobile, while collapse releases commitment;
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
npm run diagnostics
```

## iOS / App Store

The web build is configured for an iOS wrapper through Capacitor 8.5.0. Capacitor 8 requires Node.js 22+; iOS development requires macOS with Xcode 26+.

First-time native setup on a Mac:

```bash
npm install
npm run ios:init
```

This builds the Vite app, creates `ios/`, copies `dist/` into the native project, and opens the project in Xcode.

After web-code changes:

```bash
npm run ios:open
```

`ios:open` rebuilds the web app, synchronizes it into the native project, and opens Xcode.

The initial bundle identifier is:

```text
io.github.antonm030481.livingwaratlas
```

Change it in `capacitor.config.ts` before registering the final App ID in Apple Developer if a different identifier is preferred.

After running `npm run ios:init`, commit the generated `ios/` project and the refreshed `package-lock.json` so native builds are reproducible.

## Controls

- `1`, `2`, `4` — simulation speed
- `Space` — debug pause
- `F3` — instability overlay
- **New seed** — restart with a reproducibly different seed

## M0 question

Do the autonomous fronts look like a system that tends to stabilise, while still producing visible local tension and occasional nonlinear retreats?

Do not tune this into a full game yet. If the answer is no, change the simulation before adding strategic arrows.

## Committed vs reserve diagnostics

`npm run diagnostics` regenerates deterministic CSV and SVG plots under `diagnostics/`.

See `docs/TEST_RESULTS.md` for the current committed/reserve regression checklist.
