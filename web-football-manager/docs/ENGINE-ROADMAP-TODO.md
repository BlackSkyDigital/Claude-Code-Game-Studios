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

## Comparison study (tactics × teams × formations) — `tools/`

Harnesses: `dash.mjs` (metrics vs real ranges), `tactics.mjs` (each style vs
balanced), `teams.mjs` (round robin), `formations.mjs` (each formation vs 4-3-3),
`players.mjs` (swap/remove key players & measure impact),
`matrix.mjs [N]` (full tactics head-to-head grid, every style home vs every
style away — pass N seeds, default 8).

Findings & fixes from the study:
- **Tactics** — possession styles were *losing* to balanced (a safe pass was as
  interceptable as a risky one). Fixed: interception scales with the passer's
  directness. Now all 10 styles play distinctly: tiki-taka effective (2.3-1.1),
  gegenpress open high-volume (26-17), counter solid (2.1-1.0), catenaccio
  suppresses (1.3-0.8), direct-counter breaks (18-10).
- **Teams** — Man City (a top squad) finished LAST because attacking full-backs
  never recovered. Fixed: per-player duty only pushes forward in possession;
  out of possession they track back. Teams now separate by squad quality.
- **Formations** — slot now drives the player's role, so formation genuinely
  changes the side. Added 4-2-3-1 / 3-5-2 / 5-3-2. They play distinctly
  (4-2-3-1 open, 3-5-2 solid, etc.).

### Tactics head-to-head matrix (`tools/matrix.mjs 20`, MCI v LIV, 20 seeds)

Avg goal diff from the home row's perspective:

```
home\away   bal   tiki  gegen ctrl  cntr  r-one cat
bal        +0.6  +1.0  +0.7  +1.3  +0.3  +1.9  -0.3
tiki       +1.3  +0.5  +1.1  +1.1  +0.0  +1.3  +0.8
gegen      +1.6  +1.1  +1.8  +1.6  +0.1  +1.3  +0.6
ctrl       -0.3  +0.1  +0.5  +0.1  -0.1  +0.8  +0.7
cntr       +0.8  +0.2  +2.0  +0.8  +0.4  +0.8  +0.1
r-one      +0.1  +0.1  +0.6  +0.6  +0.1  +0.0  -0.4
cat        +0.7  +0.6  +0.9  +0.8  +0.1  +1.1  +0.3
```

The matchups come out realistically and are the strongest validation that the
tactical layer is behaving like real football:

- **Counter is the antidote to the press.** `cntr v gegen = +2.0`; counter *away*
  holds gegenpress *home* to `+0.1` (the one thing that stops it). Counter also
  edges/holds both possession styles (`ctrl v cntr = -0.1`, `tiki v cntr = 0.0`).
- **A deep block frustrates the press.** Catenaccio limits gegenpress to `+0.6`
  at home and beats it `+0.9` when catenaccio is home.
- **Possession breaks the block.** tiki/gegen/ctrl all beat catenaccio; the deep
  block only nicks results against sides that half-commit (balanced, counter).
- **Route-one is weakest** — `r-one v r-one = 0.0` (crude long-ball negates home
  rhythm) and it is thrashed away.
- **Home edge is a constant ~+0.5–0.6** across all seven mirror matchups — it
  does *not* compound with tactic.

**Key emergent insight (not a bug — verified via neutral-venue runs):** open
tactics *amplify* squad-quality gaps while defensive tactics *compress* them.
Neutral-venue mirrors of MCI (better squad) v LIV: balanced `1.4–1.5` shots
`15–14` (quality barely expressed, low-event) vs gegenpress `3.5–2.3` shots
`29–27` (quality strongly expressed, high-event). This is exactly the real-world
rationale for a weaker side parking the bus — a tight, low-event game compresses
the favourite's edge; an open end-to-end game lets the better team win bigger. So
the gegenpress mirror reading `+1.8` is squad quality (`+1.2`) + home edge
(`+0.6`), not an inflated home advantage. No engine change needed.

### Player & team alternation (verified)

- **Teams** separate by squad quality (round robin, balanced): RMA 1.77 ppg
  (+31) > MCI 1.33 (−4) ≈ ARS 1.33 (−3) > LIV 1.02 (−24).
- **Individual players swing results** (MCI variants v LIV, `tools/players.mjs`):
  full XI `8-3-5`; **remove Haaland → `3-1-12`** (can't win without the striker);
  remove De Bruyne → `6-2-8` (creativity); remove Rodri → concede more; weak both
  CBs → 23 shots against; weak XI `0-0-16` (0.3–3.7); star XI dominant
  (2.25–1.31). The full quality range expresses on the pitch.

Known edges (documented, not chased — fixing risks the calibrated baseline):
- ball in-flight ~35% (pass-frequency limit of the model)
- 5-3-2 over-defends (~0.2 conceded) — 5 defenders crowd out every chance
- possession % compressed ~47-53% across styles (tempo/recycling-driven metric)
- midfield scoring ~6% (a bit low)

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
