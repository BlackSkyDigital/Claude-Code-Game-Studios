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

## Smaller fixes / polish

- [ ] On-target % is low (~23% vs ~33% real) — lots of speculative wide shots
  from the spread-out chance distribution. Trim shot scatter / wayward efforts.
- [ ] Pass count per match is high (~2.7k) — tempo reads as busy; consider longer
  on-ball holds without hurting shot/goal calibration.

## Calibration baseline to protect (headless, ~40 matches)

goals ~2.5 · shots ~28 · pass acc ~81% · fouls ~10 · yellows ~2 · reds ~0.25 ·
pens ~0.45 · subs ~5 · offsides ~4.5 · possession responds to tactics. Every
change is verified against these before shipping.
