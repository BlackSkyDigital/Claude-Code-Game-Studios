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
faster passes + carrying more brought it to ~37% (real ~25-30%). Still room to
carry more / pass less.

## Calibration baseline to protect (headless, ~40 matches)

goals ~2.5 · shots ~28 · pass acc ~81% · fouls ~10 · yellows ~2 · reds ~0.25 ·
pens ~0.45 · subs ~5 · offsides ~4.5 · possession responds to tactics. Every
change is verified against these before shipping.
