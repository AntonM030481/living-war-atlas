# Core Simulation Diagnostics - Committed / Reserve Model

The committed / reserve refinement keeps one conserved War Resource and partitions it locally into:

- `committed` - engaged combat mass;
- `reserve` - mobile excess.

## Regression Checks

Current deterministic diagnostics cover:

- symmetric 1D equilibrium remains stable;
- shutting down the only defender source eventually weakens the front;
- restoring Blue production before capture can stabilize / recover;
- restoring Blue production after a longer outage can fail after city capture;
- `committed <= total War Resource` at every tested cell / tick;
- roughly equal contact commits most local resource;
- overwhelming local superiority leaves a large mobile reserve;
- transport moves reserve only and leaves committed mass in place;
- combat attrition consumes committed mass only;
- both cells adjacent to a zero-contour edge are recognized as frontline cells;
- temporary source outages show a nonlinear tipping curve.

## Generated Diagnostics

Run:

```bash
npm run diagnostics
```

Outputs:

- `diagnostics/engagement-transition.csv`
- `diagnostics/release-transition.csv`
- `diagnostics/recovery-success.csv`
- `diagnostics/recovery-failed.csv`
- `diagnostics/tipping.csv`
- `diagnostics/tests.csv`
- `diagnostics/engagement-transition.svg`
- `diagnostics/release-transition.svg`
- `diagnostics/recovery-success-mass.svg`
- `diagnostics/recovery-success-front.svg`
- `diagnostics/recovery-failed-mass.svg`
- `diagnostics/recovery-failed-front.svg`
- `diagnostics/tipping.svg`

## Calibration Note

`frontCommitmentFloor` is currently `0.025`.

It is intentionally small: when an opponent weakens, the stronger side retains a minimum probing / offensive commitment rather than disengaging in lock-step with the defender. Without this floor, both sides could reduce committed mass together and a resource-starved front could freeze indefinitely.

This is a tuning parameter, not a final gameplay constant.
