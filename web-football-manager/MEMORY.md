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
- **NEW — quality scales everywhere, no flattening/hard caps** (user directive):
  audited the engine; the one genuine flattening (an UNMARKED header winning at a
  flat 0.8) now scales with the attacker's aerial ability via `att/(att+k)`,
  centred so a typical box forward still wins ~0.8. Everything else already uses
  attribute ratios (take-on, tackle skill/retain, control, save, set-piece,
  passing, movement `baseSpeed` from pace+accel). Remaining `clamp(...)` calls are
  probability/per-tick rails (e.g. [0.15,0.95] control) that rarely bind — kept as
  "laws of probability", not quality flatteners.
- **NEW — off-the-ball midfield runs + midfielder-finished cut-backs:** central
  mids (and DMs, less so) make **timed late runs** into the box/cut-back zone,
  scaled by Off The Ball + mentality + getForward (no flat gate/cap). A cut-back
  is now finished by the **arriving runner it was aimed at** (usually a mid),
  not whoever's nearest — so midfield runs become midfield goals. Lifted **review
  g/g 2.43 → 2.72** with no dash inflation; goal sources & shot outcomes textbook.
- **NEW — defenders score from set pieces (corners):** the "midfield problem"
  was largely a **diagnostic bug** (roles.mjs counted the central AM as "wide");
  with correct banding midfield is already ~20-22%. The real gap was DEFENDERS
  (~4% vs real ~14%). Corners now finish realistically: the header is the best
  aerial threat in the box **with a centre-back edge** (CBs come up and score),
  connect lifted to the real ~2.5-3%/corner, and corner headers tagged
  "setpiece" (were mis-tagged "open"). **def goal share 4% → ~10%**, set-piece
  goals 1% → ~12%, header share → 18% — review g/g held at 2.73.

### Calibration snapshot (current)
| Check | Now | Target |
|---|---|---|
| Dash (MCI v LIV) g/g | ~3.2 | 2.5–3.1 (elite runs a touch hot) |
| Review (mixed) g/g | **2.73** ✅ | ~2.7 |
| Season g/g | **2.74** ✅ (↑ 2.43) | ~2.7 |
| Champion points | **77** (↑ 74) | ~84–90 ⚠️ still low |
| Golden boot | **34** | ~25–29 ⚠️ still high |
| Home/Draw/Away | **47 / 23 / 31** ✅ (was 51/18/31) | ~44 / 24 / 31 |
| Goal split by role (N=100) | **st 37 / wide 33 / mid 20 / def 10** ✅ | st 33 / wide 27 / mid 22 / def 14 |
| Set-piece goal share | **~12%** ✅ | realistic |
| Shot outcomes | goal 10 / saved 24 / blocked 24 / off 41 ✅ | 10 / 25 / 28 / 37 |
| Over-the-bar | ~9% of off-target ✅ | realistic |

Persistent harmless flags: dash `shots/match` (~35) and `ball in-flight %` (~36)
read slightly HIGH — **pre-existing**; dash is elite-vs-elite so g/g runs ~0.3
hotter than the league. Season results are ONE season per seed (high variance);
use `tools/seasons.mjs` to average several before trusting any single placing.

---

## 6. Known issues / open problems (in priority order)

1. **Role split — mostly RESOLVED.** Now st 37 / wide 33 / mid 20 / def 10
   (real 33/27/22/14). st & wide remain ~5pp high and def ~4pp low. To close the
   last bit (low risk): nudge corner/set-piece defender scoring a touch more
   (def → ~13%) and/or trim winger self-shooting slightly so st/wide ease toward
   33/27. **Do positional/movement work, not probability tweaks** — earlier
   probability tweaks destabilised.
2. **Champion points ~77 (real ~85+); draws ~18% (real ~24%), home wins ~51%.**
   When scoring rose the strong teams didn't pull away enough and draws dipped.
   Likely needs the strong sides to convert their edge into more wins — revisit
   after confirming the latest season numbers; consider a small home-edge or
   finishing-spread tweak if draws stay low. (Refresh from the pending season run.)
3. **Through-ball goals still ~1% (real ~8%)** — central penetration via defence-
   splitting passes is under-used; a candidate for the next movement/routing pass.
4. **Cut-back over-counted** — many close-range first-time finishes tagged
   "cut-back", inflating that category.
5. Dash on-target ~40% and g/g ~3.2 run a touch hot (elite-vs-elite); league is
   fine (review g/g 2.73).

---

## 7. Roadmap — what's next

**Immediate next stage (IN PROGRESS):** *off-the-ball midfield & central routing.*
Done so far: timed central-midfield runs + midfielder-finished cut-backs (league
g/g now realistic, mid 4%→7%). **Still to do — rein in wide over-shooting** so
the role split reaches st 33 / wide 27 / mid 22 / def 14: see Known Issue #1
levers (feed central runners over winger self-shots; mids into half-space
shooting slots; more through-balls). Target: midfield goal share → ~20%,
through-ball goals → ~8%, champion → ~84+, draws back to ~24%, **without**
re-inflating the golden boot or g/g. Verify with `roles.mjs`, `review.mjs`,
`dash.mjs` each step; `season.mjs`/`seasons.mjs` (slow, ~6 min) for the league.

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
