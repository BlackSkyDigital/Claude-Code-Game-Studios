# MEMORY — Web Football Manager (session handoff)

Read this first when continuing in a new session/terminal. It's the durable
overview: what we're building, how it's built, where we are, what we've learned,
and what's next. Branch: **`claude/web-football-manager-k7vn8c`**.

---

## 1. What we're building

A **private, web-based Football Manager-style game** for ~3 friends (async online
seasons eventually). Self-contained in `web-football-manager/`, **TypeScript, zero
dependencies**. The point is an **FM-grade, "incredibly realistic" match engine** —
a continuous 2D spatial simulation you can watch *and* manage live, that also
simulates whole seasons believably.

**Constraints (important):**
- Real team/player names are OK as **factual data for private use**. Do **NOT**
  host publicly with real crests/kits, and do **NOT** monetise.
- It's a private project for a few friends — keep it simple, no infra creep.
- API-Football key (for real stats) must **never** be committed — use the
  `APIFOOTBALL_KEY` env var only (`tools/fetch-real.mjs`). Note: the sandbox
  egress proxy currently blocks `v3.football.api-sports.io` ("Host not in
  allowlist") — that's an environment network-policy setting, not a code bug.
- Don't commit/push unless asked. No PRs unless asked.

---

## 2. Architecture (the mental model)

FM-style **two-layer hybrid** (see `docs/MATCH-ENGINE-ARCHITECTURE.md`):

- **Layer 1 — continuous spatial agent sim.** Real 105×68m pitch, ball + 22
  player agents, stepped on a **0.1s tick** (`DT`). Each ball carrier makes a
  **slice decision every ~0.22–0.45s** (shoot / take-on / cross / cut-back /
  pass / carry). Off the ball, every agent moves to a target from formation +
  shape + duty + pressing/marking + timed runs.
- **Layer 2 — every action/duel is** `base coefficient × weighted-attributes ×
  situational-modifiers + RNG`. **Decision vs execution is split** (choose the
  pass with Vision/Decisions, execute it with Passing/Technique).
- **"Universal laws that scale by inputs"** — one rule set, many dials. Context
  layer (rivalry, importance, morale, atmosphere, momentum) multiplies the same
  `sharp()` execution term and foul/card rates, all **neutral by default**.
- **Determinism:** one seeded **mulberry32** RNG drives everything (replayable —
  needed for async online play); a **separate RNG** drives commentary so text
  never changes the result.

**Design principle the user keeps reinforcing:** *everything scales with player
quality, up and down, from the attributes — **no flattening, no artificial hard
caps**. The only legitimate "caps" are the 1–20 rating range, probability bounds
[0,1], smooth diminishing returns, and physical limits.* Prefer **conservation**
(split a single quality-driven budget) over clamps for calibration.

---

## 3. Key files

- `src/engine/match.ts` (~2500 lines) — **the engine**. Tick loop, decisions,
  passing/shooting/duels, set pieces, deflections/woodwork/handballs/own goals,
  free kicks, context layer, and the new **Z-axis ball physics**.
- `src/engine/attributes.ts` — full ~38 FM attributes (1–20); `makeAttrs(role,
  overall, overrides)` expands one `overall` into the set via role emphasis
  (`EMPH`); **`currentAbility(role, attrs)` → 1–200 CA** (position-weighted,
  derived only from attributes).
- `src/engine/tactics.ts` — 14 team knobs per preset (mentality, tempo,
  directness, pressing, lineHeight, width, marking+tackling, shootOnSight,
  creativeFreedom, counterPress, counterAttack, focusPlay, offsideTrap).
- `src/engine/types.ts` — types incl. `PlayerInstructions` (9 fields), `Duty`,
  `TeamDef.style`.
- `src/engine/formations.ts` — 13 formations + resolver.
- `src/engine/data.ts` — 20 Premier League teams, **June 2026 squads**, each with
  a `style`. (MCI=TEAMS[0], LIV=TEAMS[1] kept on 4-3-3 as the dash baseline.)
- `src/web/main.ts` + `index.html` — live tactical-control UI (sliders, PI
  editor, formation picker, drag editor) over the 2D aerial view.
- `docs/` — architecture, calibration, reviews, roadmap (see below).

---

## 4. How to run things (calibration is headless — we can't see the canvas)

Always `cd web-football-manager` first (cwd drifts to repo root → `tsc` prints
help instead of compiling). **Compile before running tools** (they read `dist/`):

```bash
cd web-football-manager
npx tsc                       # build to dist/
node tools/dash.mjs           # 24× MCI v LIV: the primary baseline dashboard
node tools/review.mjs 80      # 80 mixed matches: goal sources, shot outcomes, events
node tools/season.mjs         # full 380-match PL season: table, scorers, g/g
node tools/ca.mjs             # team-average Current Ability table
node tools/ca.mjs MCI         # per-player CA for one team
```

Other probes: `roles.mjs` (goals by position), `instr.mjs`/`pi.mjs` (instruction
effects), `matrix.mjs`/`tactics.mjs` (tactic vs tactic), `grid.mjs`,
`context.mjs` (rivalry/morale/momentum laws), `seasons.mjs`, `players.mjs`,
`teams.mjs`, `fetch-real.mjs` (real stats, needs env key + egress allowlist).

**Gotchas learned:** run `tsc && node tool` sequentially (don't read `dist/`
mid-compile → stale results). `season.mjs` is CPU-heavy and buffers output until
the end (~1–2 min); don't pile up multiple in the background. **Never**
`pkill -f season.mjs` — the pattern matches your own shell command and self-kills.

---

## 5. Current state — what works

- **Realistic league sim:** table shape correct, promoted teams relegated,
  believable scorer spread.
- **Mixed goal sources** (not single-area): open play ~37%, cut-back ~34%,
  cross, penalty, deflected, set-piece, own goal. Shot outcomes realistic-ish
  (goal ~9 / saved ~23 / blocked ~25 / off ~42).
- **Football "small print" present:** deflections, free kicks (direct + cross),
  handballs→pen, own goals, woodwork + rebounds, keeper parries/rebounds,
  saved-penalty rebounds, advantage played, offside trap, corners.
- **Context laws verified** (`context.mjs`): derby → more fouls/cards; morale
  swing ±0.7 GD; cup final scrappier; momentum after goals.
- **Tactics & instructions** affect play distinctly; better squads finish higher.
- **NEW — Z-axis ball physics (Phase 3):** ball has real height (`z`,`vz`),
  gravity (`GRAVITY=9.8`), bounce; lofted passes/chips/crosses arc on a real
  parabola synced to `airTimer` (which still gates control, preserving baseline).
- **NEW — over-the-bar shots:** shots have an aimed height `aimZ`; above
  `CROSSBAR=2.44` = miss (not save/goal). Height scatter uses the **same
  quality-driven `spread`** as the horizontal aim (independent `skier` term),
  so it scales ~2% (elite) → ~17% (poor), **no caps**. Off-target splits into
  "over the bar" vs "dragged wide" with matching commentary. **Side effect: this
  fixed the long-standing golden-boot inflation** (was stuck ~39 → now ~35).
- **NEW — Current Ability (CA):** `currentAbility()` 1–200 + `tools/ca.mjs`.
  Ranks squads realistically: **MCI 169, ARS 167, LIV 166 … LEE 134, SUN 132,
  BUR 130**; player CAs land right (Rodri 184, Foden 179, Haaland 178).

### Calibration snapshot (as of commit `3ad3774`)
| Check | Now | Target |
|---|---|---|
| Dash (MCI v LIV) g/g | ~2.8 | 2.5–3.1 ✅ |
| Dash on-target % | ~39% | 30–38% (slightly high) |
| Over-the-bar | ~9% of off-target ✅ | realistic |
| Season g/g | **2.44** | ~2.8 ⚠️ low |
| Champion points | **75** | ~84–90 ⚠️ low |
| Golden boot | ~35 | ~22–29 (better than old ~39) |

Persistent harmless flags: `shots/match` (~32) and `ball in-flight %` (~36) read
slightly HIGH — **pre-existing**, not from physics.

---

## 6. Known issues / open problems (in priority order)

1. **THE big one — midfield scores ~0–4% of goals (real ~20–25%).** Goals
   over-concentrate on strikers/wide forwards because the spatial model routes
   the final third through the wings (auto cross/cut-back). Consequences:
   **league g/g low (2.44), champions can't pull away (75 pts, too many draws),
   through-ball goals ~1% (real ~8%).** This is the single biggest accuracy gap.
   The real fix is **off-the-ball midfield runs + central/through-ball routing**
   (CMs arriving in the box, third-man runs, overlaps), not a probability tweak.
   8+ earlier probability tweaks failed/destabilised — don't retry those; do the
   positional-play work.
2. **Cut-back over-counted** — many close-range first-time finishes tagged
   "cut-back", inflating that category.
3. Dash on-target ~39% slightly above the 30–38 band.

---

## 7. Roadmap — what's next

**Immediate next stage (recommended):** *off-the-ball midfield & central routing*
— make central midfielders make timed runs into the box and become genuine
shooting/scoring options; increase through-ball usage. Target outcomes: league
g/g → ~2.7, champion → ~84+, midfield goal share → ~20%, through-ball goals
→ ~8%, **without** re-inflating the golden boot. Verify with `roles.mjs` (goals
by position), `review.mjs`, `season.mjs`, `dash.mjs` at each step.

**Physics layer remaining (Phase 3 C/D):** migrate aerial duels/control to true
height (a ball above a control height can't be brought down cleanly) — note
`CONTROL_HEIGHT` was drafted then removed; re-add it when doing this. Then a full
calibration sweep across all variables.

**Later / on request:**
- Mid-slice reactivity (let a carrier change his mind mid-decision).
- Role/duty depth (target-man hold-up, false-nine drop, libero step-out).
- **Potential Ability + age + development/training** (the other half of FM's
  CA/PA) — belongs with **career mode**. User's plan: nail the match engine
  first, then "the rest of FM is just UI and spreadsheets" (career, transfers,
  squad screens) built on top.
- Real API ratings once the egress host is allowlisted (`fetch-real.mjs`).

See also `docs/ENGINE-ROADMAP-TODO.md`, `docs/PL-SEASON-CALIBRATION.md`,
`docs/FOOTBALL-REVIEW.md`, `docs/MATCH-ENGINE-ARCHITECTURE.md`.

---

## 8. Calibration lessons (so we don't repeat mistakes)

- **Check across ALL variables, not just the dash.** Elite teams (MCI/LIV) hid a
  league-wide goal collapse: a change can leave dash fine while mixed/weak teams
  crater (over-the-bar at one point dropped review g/g to 1.80 while dash looked
  OK). Always run dash **and** review **and** season.
- **Per-tick probability rolls compound.** Anything rolled every tick over
  several ticks explodes (block/deflection once hit 40–55%). Keep multi-tick
  events flat/calibrated; only single-roll events (e.g. woodwork) are safe to
  make emergent.
- **Adding a gameplay RNG draw shifts the whole deterministic stream**, so exact
  per-match numbers change even where behaviour is "the same" — judge by
  aggregate ranges, not individual seeds.
- **Conserve budgets instead of clamping.** When adding a new miss axis
  (over-the-bar), conserve the total miss so calibration holds — and remember
  wide/over **overlap** (a shot can be both); the coupled/independent split has
  to account for that or goals drift.
- **Tighter horizontal aim pulls shots central → easier for the keeper** (save
  model uses a `corner` factor) — so conserving off-target doesn't automatically
  conserve goals. Mind this coupling.
