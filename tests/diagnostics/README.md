# Diagnostics scenarios

Run with:

```bash
npm run diagnostics
```

The diagnostics suite generates CSV/SVG artifacts and checks a few high-level properties of the simulation. The SVGs are intended to explain *why* a check passed or failed, not just report a boolean result.

## Commitment / release

### `produces commitment samples`

**Setup**
- 1D map, 9 cells wide.
- No cities and no production.
- Blue starts with 10 war resource near the front; Red starts with 1.
- The front is initially active.

**Change**
- For the engagement phase, the front remains active and commitment is sampled while reserve becomes committed mass.
- For the release phase, Red war is cleared and the control field is forced fully Blue, removing enemy contact.

**Expectation**
- Both phases produce samples so the committed/reserve transition can be inspected.

**Artifacts**
- `engagement-transition.csv`
- `engagement-transition.svg`
- `release-transition.csv`
- `release-transition.svg`

## Recoverable production outage

### `produces recovery-success samples`
### `keeps the blue city after a recoverable outage`
### `restores blue mass after a recoverable outage`

**Setup**
- 1D map, 80 cells wide.
- Blue city at x=8 and Red city at x=71.
- Both normally produce 4 resource units per second.
- Simulation warms up for 75 seconds before the experiment.

**Change**
- Blue production is set to zero at t=0.
- Blue production is restored at t=60 s.
- Simulation continues for another 220 s.

**Expectations**
- The scenario produces recovery samples.
- The Blue city is still Blue at the end of the run.
- Local Blue front mass after restoration rises above its level at the moment production is restored. This is intentionally a relative check: local mass depends on transport capacity, cell capacity, and `massRadius`.

**Artifacts**
- `recovery-success.csv`
- `recovery-success-mass.svg`
- `recovery-success-front.svg`

The charts mark production restoration, city-owner changes, and Blue collapse/recovery transitions when they occur.

## Longer production outage

### `leaves more territorial loss after the longer outage`

**Setup**
- Same 1D map and 75 s warm-up as the recoverable-outage scenario.

**Change**
- Blue production is set to zero at t=0.
- Blue production is restored at t=150 s.
- Simulation continues for another 220 s.

**Expectation**
- The 150 s outage leaves the final front farther toward Blue territory than the 60 s outage.
- City capture is not assumed. Whether and when capture occurs is an emergent outcome of the current model and is better inspected through the tipping curve and generated timelines.

**Artifacts**
- `recovery-failed.csv`
- `recovery-failed-mass.svg`
- `recovery-failed-front.svg`

## Outage tipping curve

### `produces tipping samples`
### `produces sufficient maximum tipping loss`

**Setup**
- Same 1D two-city map and 75 s warm-up.
- A separate simulation is run for each outage duration.

**Change**
- Blue production is disabled for 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360, 420, or 480 s.
- Production is then restored.
- Each run continues for 240 s after restoration.

**Expectations**
- Samples are produced for all outage durations.
- At least one outage produces more than 8 cells of lasting territorial loss relative to the pre-outage front position.

**Artifacts**
- `tipping.csv`
- `tipping.svg`

`tipping.svg` has no timeline event markers because its x-axis is outage duration across separate runs, not time within one run.

## City resource / flow diagnostics

### `produces city-flow samples`
### `keeps visible local resource at all active cities`
### `keeps outgoing flow at all active cities`

**Setup**
- Uses the regular `testMap`.
- Simulation runs for 120 s.
- A snapshot is sampled every 5 s.

**Measurements**
- Local war resource around every city.
- Flow-vector magnitude at the city and in its neighborhood.
- Traced flow length and average/max magnitude.

**Expectations**
- City-flow samples exist.
- At the final sample time, every active city has more than 1 unit of local own-side war resource.
- At the final sample time, every active city has local outgoing flow magnitude greater than 0.1.

**Artifact**
- `city-flow.csv`

There is currently no dedicated SVG for this group.
