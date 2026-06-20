# Match Engine — Improvement Roadmap (TODO)

Working list for the realism improvements from `MATCH-ENGINE-ARCHITECTURE.md`,
in order of realism-per-effort. Updated as each lands.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done

## Priority order

- [x] **1. Off-the-ball movement** *(first pass)* — attacking players now peel
  off their marker into space to "show" for a pass (scaled by Off-the-Ball), and
  attack-duty full-backs overlap down the touchline when play is advanced. Plus
  the earlier progressive passing + fluid drift. *Still to add: checking to feet
  (coming short to the carrier), underlaps, third-man runs, cover-shadow passing
  lanes.*
- [ ] **2. Light ball physics / Z-axis** — ball height, bounce, volleys, headers
  from height, deflections. *(Biggest fidelity gap vs FM.)*
- [ ] **3. Mid-slice reactivity** — let a player re-evaluate his decision as play
  shifts, instead of committing one action per ~0.35s slice.
- [ ] **4. Role & duty depth** — distinct role behaviours (target-man hold-up,
  false-nine dropping, libero stepping out) on top of duty + traits.
- [ ] **5. Morale / momentum** — confidence & momentum context that nudges
  sharpness within a match.

## Attack/defence behaviour in & around the box (done)

- [x] **Attackers back themselves in the box** — shoot (or take-on / cut-back /
  dribble around) instead of passing it square away; in-box shooting is a
  quality-scaled multiplier and square lay-offs are discouraged.
- [x] **Defenders engage, don't sit** — at least two close down in the
  defensive third regardless of pressing tactic, and a spare centre-back drops
  into the ball→runner lane to cut the through ball. (Side effect: a higher line
  means a few more offsides — realistic.)

## Smaller fixes / polish

- [~] On-target % low (~25%) — tightened shot scatter; remaining lowness is
  partly defenders blocking more shots now (realistic). Revisit if it looks off.
- [ ] Pass count per match is high (~2.7k) — tempo reads as busy; consider longer
  on-ball holds without hurting shot/goal calibration.
- [~] Corners dipped when attackers started shooting instead of crossing —
  bumped concede rates back up (~3.4/match); could lift further.
- [ ] Goal distribution still striker-heavy (~76%); wingers ~24%, midfielders
  rarely score. Needs arriving-midfield runners finishing cut-backs/crosses.

## Diagnostics (so we stop tuning blind)

`tools/stats.mjs` reports ball OWNED vs IN-FLIGHT vs LOOSE % and possession
length; `tools/viz.mjs` renders ASCII pitch frames of a real passage so the
positioning/shape/movement can be inspected without the browser. Run from
`tools/` after `npx tsc`. **This is how we diagnose "doesn't feel right".**

Key finding: the ball was IN FLIGHT ~47% of the match (pinball feel); crisper,
faster passes + carrying more brought it to ~37%, then cutting the hangy lofted
balls took it to ~34% with pass completion up to ~81% (real ~25-30%).

Levers TESTED and rejected (kept here so we don't repeat them):
- Slowing the decision cadence — the carrier dwells under pressure, so fouls &
  cards explode (27 fouls, 0.8 reds) and shots crash. Bad lever.
- Lowering pass probability to "carry more" — trades passes for take-ons/dribbles
  at goal, inflating fouls & goals. Bad lever.
- Raising pass control — interceptions from the new lane-blocking defenders cap
  completion ~80%, so it barely moved (and nudged box fouls up).
- What worked: faster/crisper passes + fewer lofted balls.

## Calibration baseline to protect (headless dashboard, `tools/dash.mjs`)

12/13 metrics in real range (24 matches, MCI v LIV):
goals ~2.7 · shots ~28 · on-target ~36% · pass cmp ~81% · fouls ~20 ·
yellows ~3.0 · reds ~0.2 · pens ~0.2 · corners ~12 · offsides ~4.5 · subs ~5.2 ·
goal split ST ~51% / wide ~43% / mid ~6% (striker top scorer).
ONLY remaining out-of-range: ball in-flight ~34% (real 24-32). It's structurally
tied to the high pass count (~2600/match, ~2x real); every lever to cut it
(faster passes -> goals/offsides spike; fewer passes/slower cadence -> foul
explosion) is worse. Accepted at ~34% (down from 47%). A true fix needs a
"hold/retain the ball" behavior (carrier shields without passing) — future work.

**Key unlock:** a live shot was being silently absorbed by bodies in the box
(~60% of shots never reached goal) — fixing that made the whole shot economy
(on-target, saves, blocks, corners) realistic for the first time.

Run `node tools/dash.mjs` after `npx tsc` to check every metric vs real ranges.
