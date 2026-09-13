# Conquest: disclosure and invasion prototype (rules v2)

Conquest remains an experimental developer mode. It uses the same autonomous
front, continuous War Resource, transport, commitment, combat and potential
solver as the other modes. The player selects countries and commits strategic
changes; there are no units, allocation sliders, order caps or player cooldowns.

## Rules

- Each side knows its own secret allies. Roughly one third of each initial
  alliance becomes genuinely neutral, keeping at least one ally per side on
  supported two-sided maps. Enemy secret allies and genuine neutrals look the
  same until involved. The map seed determines the deal.
- Initially countries are dormant: no production, no force and closed borders.
  Merely selecting a country opens its information card and changes nothing.
- **Reveal ally** is irreversible. It deploys `12 × capital production` War
  Resource near the capital and unlocks a finite mobilization allotment of
  `120 × capital production`, delivered through normal city production.
  Congestion pauses delivery rather than wasting unproduced resource. Fielded
  force pays ordinary upkeep and gradually redistributes through the field.
- **Invade** requires an adjacent active country. It explicitly opens those
  attack borders. The target always raises a one-time resistance allotment of
  `24 × capital production` for the opposing side, split between the exposed
  border and the capital. This happens for both neutrals and enemy allies,
  including enemies already revealed. An invaded secret ally also mobilizes.
- A genuine neutral's resistance receives no recurring production. Capturing
  its capital starts its one finite mobilization allotment, subject to ordinary
  capture integration. Capturing or recapturing an already mobilized capital
  transfers only the remaining allotment; it never refills it.
- Adjacent active countries supporting the same side share an open border.
  Revealing a secret ally next to resistance can therefore reinforce it through
  ordinary transport. Resistance can flow outside its original country.
- **War borders are reciprocal and permanent.** Starting an invasion exposes
  the source to counterattacks. If enemy control first crosses into that source,
  its resistance rises once as well. This is an intentional adaptation to an
  autonomous continuous front: the player consents to a reciprocal war frontier,
  not to a one-way attack corridor. Other dormant countries stay sealed.
- A capital changes country ownership and economic access; remaining opposing
  force is still resolved by the simulation. No instantaneous whole-country
  cleanup or discrete-army capture condition is imposed.
- A side cannot lose while it has a secret ally, an active capital/economy, or
  residual field force. The existing two-side victory presentation is retained.

All prototype amounts and the opponent cadence are in
`src/meta/conquest/ConquestRules.ts`. They are initial tuning values, not balance
claims. A finite allotment is unproduced War Resource, not another spendable
currency or a player-managed resource type.

## Opponent and information

The deterministic opponent observes every eight simulated seconds. It reveals
an initial ally, prioritizes allies near threatened friendly countries or known
enemies, and opens an invasion when adjacent field force exceeds visible defence
plus the public resistance estimate. It can release another ally when current
mobilization is exhausted. It uses the same legal actions as the player and
never reads an unknown target's allegiance to score an invasion.

The player has no corresponding action timer. The intended cost of changing
strategy comes from irreversible disclosure/open borders, upkeep, resistance,
resource dispersion and the existing transport/commitment inertia.

The worker projects snapshots before sending them to the UI: dormant control,
force, potentials and diagnostic fields are masked, and dormant city owners and
aggregate city totals do not reveal their allegiance. The mode view exposes only
public country information and the player's own secret allies. A short event
list makes disclosures, resistance and captures visible between observations.

## What was checked

- Explicit action validation; resistance for neutral, secret and public targets;
  one-time grants; neutral capture and recapture economics; counter-breakthrough;
  neighbouring ally support through the ordinary field; hidden information;
  opponent information symmetry; finite production; save/replay determinism.
- Nine scripted three-minute openings on a small six-country map: three seeds,
  each with immediate expansion, staged disclosure, and delayed entry. The
  observations are in `experiments/conquest/results/strategy-v2.json`.
- The scripts produced different territory/force outcomes. For example, seed 1
  favoured early expansion in captured capitals at the observation endpoint,
  while seeds 11 and 23 left substantially more blue field force after staged
  or delayed commitment. These are consequences, not a proof of balanced play
  or human enjoyment. No policy is declared optimal from these probes.
- The opt-in Conquest performance harness and exact cached/uncached topology
  comparisons also run under the new rules. The benchmark disables the strategic
  opponent to preserve deterministic checkpoint workloads. Archived v1 timings
  describe different rules and must not be treated as direct speed comparisons.

## Short human playtest

Use a development build (`npm run dev`), choose Conquest and Riverlands.

1. Reveal one ally and observe force gathering before committing an invasion.
2. Invade an unknown neighbour; watch the resistance and any enemy disclosure.
3. Try a nearby delayed reveal to support a threatened country. Compare it with
   revealing all allies at the start of a fresh game with the same seed.
4. Open two fronts early and watch whether the extra territory compensates for
   the opposing resistance and dispersed force. There is no need to adjust
   percentages while waiting for the result.

Questions for the next iteration: does waiting preserve a useful option, can a
player understand an enemy counter-disclosure, and do choices every several
seconds feel consequential without rewarding rapid repetitive clicking? The
prototype is ready for this test; subjective interest still requires playing.

## Persistence

Rules v2 saves contain secrets, participation/resistance flags, the finite city
allotments and the opponent's next observation time. Rewind restores all of them.
Old experimental Conquest saves lack these fields and start a fresh v2 session;
Sandbox and Guerilla Wars saves keep their existing format.
