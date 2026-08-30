# Living War Atlas

Autonomous fronts. Emergent warfare.

Living War Atlas is a simulation playground for continuous front-line warfare. Cities generate a single force resource, that resource physically flows through controlled territory toward active or potential fronts, and the front evolves from local pressure, terrain, commitment, attrition, instability, and collapse.

## Game modes

A new game selects a game mode first and then a compatible map.

- **Sandbox** — direct production toggle and city-side switching for experimentation.
- **Partisans** — periodically convert one enemy production source and observe the autonomous response.
- **Conquest** — activate countries and choose neighboring countries to invade; combat and force allocation remain autonomous. Conquest requires a map with one-city regions.

All modes share the same `Simulation` physics through `GameSession`; mode-specific rules and UI actions live above the simulation layer.

## Development

```bash
npm ci
npm run dev
```

Useful commands:

```bash
npm run build
npm test
npm run diagnostics
npm run bench:sim
```

Diagnostics are intentionally outside blocking CI.

## Architecture

- `src/sim/` — deterministic front / force simulation.
- `src/game/` — `GameSession` and game-mode runtime contract.
- `src/meta/` — Sandbox, Partisans, and Conquest meta-game rules.
- `src/map/` — authored maps and optional region definitions.
- `src/app/` — shared application host and input routing.
- `src/worker/` — worker loop plus session-aware history/persistence.

Closed inter-region borders block resource/control crossing while still acting as weak potential-front demand. Opening a border through Conquest turns that boundary into ordinary simulation space; the actual combat front then emerges from the shared simulation.

## Deployment

```bash
npm run deploy
```

The web build is produced with Vite and can also be wrapped for iOS through Capacitor.
