# Match Engine — Deep Gap Analysis (vs Real Football vs Football Manager)

A full audit of what the 2D match engine models today versus what real football
and Football Manager do. Each item is tagged:

- ✅ **Done** — implemented and calibrated
- 🟡 **Partial** — a basic version exists; depth missing
- ❌ **Missing** — not modelled yet

Calibration baseline (headless, 30+ matches, MCI v LIV): **~2.7 goals/match,
~31 shots, ~31% on target, ~84% pass completion, ~64 take-ons (≈50% won),
~6 corners, ~3.5 offsides, ~0.25 injuries/match.** Shot positions now spread
across 0–18m from goal (concentrated 6–12m) instead of clustering on the line.

> I can run the simulation headlessly and verify these numbers, but I **cannot
> see the rendered 2D view** — the visual checks (keeper diving, runs in behind,
> corners looking right) need your eyes.

---

## 1. On‑the‑ball play

| Element | Status | Notes |
|---|---|---|
| Typed passing (feet / driven / through / lofted / chip) | ✅ | Chosen by Vision/Passing/Technique + tactics + situation |
| Typed shooting (placed / power / chip / header) | ✅ | Chosen by attributes, distance, keeper position |
| Shot **position realism** (edge of box, inside, distance) | ✅ | Carrier now *pulls up* around the box instead of dribbling onto the goal line |
| Crossing → contested headers | ✅ | Aerial duels; most crosses cleared |
| **1v1 take‑ons / dribbling** | ✅ | Dribbling/Agility/Balance/Flair vs Tackling/Marking/Anticipation; winner bursts past (pace + control boost) |
| **First touch under pressure** | ✅ | Tight defender + low fitness ⇒ heavier touch, ball spills loose |
| Tackling / interceptions | ✅ | Continuous residual duel + decisive take‑on outcomes |
| One‑twos / give‑and‑go | ❌ | No combination play yet |
| Shielding / holding up play | 🟡 | Implicit via Strength in duels; no dedicated hold‑up state |
| Skill moves / flair variety (nutmegs, step‑overs) | 🟡 | Abstracted into one "beat your man" outcome |
| Weak/strong foot | ❌ | Not modelled |

## 2. Off‑the‑ball play

| Element | Status | Notes |
|---|---|---|
| Support angles / passing triangles | ✅ | Nearest teammates take up angles around the carrier |
| **Runs in behind the line** | ✅ | Forwards with Off‑the‑Ball ≥15 or the trait time runs into the channel beyond the last defender |
| Team shape stretching in attack | ✅ | Forwards push, defenders hold; line height/width from tactics |
| Pressing / line of engagement | ✅ | Closers scale with pressing intensity & line height |
| Marking schemes (man vs zonal) | 🟡 | Nearest‑man marking only; no assigned man‑marking or zones |
| Defensive line offside trap | 🟡 | Offsides exist; the line doesn't actively *step up* to spring a trap |
| Overlaps / underlaps / third‑man runs | ❌ | Only the "run in behind"; no structured overlaps yet |

## 3. Goalkeeping

| Element | Status | Notes |
|---|---|---|
| Shot stopping (Reflexes/Handling/1‑on‑1s) | ✅ | Save prob by skill, placement, fatigue |
| **Diving across to the shot** | ✅ | Keeper springs to the shot's projected crossing point — visible in 2D |
| **Rushing out for through balls / 1v1** | ✅ | Comes off his line when an attacker is goal‑side of the last defender |
| Parrying / catching / corners conceded | ✅ | Saves parry behind for a corner some of the time |
| Distribution (throws/kicks) | 🟡 | Keeper distributes by passing; no throw vs kick choice or roll‑outs |
| Sweeper‑keeper behaviour by tactic | ❌ | Not yet tied to a GK role/instruction |
| Punching vs catching crosses | 🟡 | Crosses contested but the keeper rarely claims them actively |

## 4. Set pieces & restarts

| Element | Status | Notes |
|---|---|---|
| Kick‑off | ✅ | |
| Throw‑ins | 🟡 | Awarded and taken, but no routine (long throws, quick throws) |
| **Corners** | ✅ | Box loaded with best aerial players; delivery → aerial duel |
| Goal kicks | ✅ | |
| **Penalties** | ❌ | No fouls‑in‑box → spot kick yet (next increment) |
| Direct/indirect free kicks | ❌ | Fouls don't yet create free‑kick set pieces |
| Set‑piece routines / designated takers | 🟡 | Best crosser takes corners; no trained routines |

## 5. Discipline

| Element | Status | Notes |
|---|---|---|
| Fouls | 🟡 | Modelled as turnovers; no whistle, no free kick awarded |
| Yellow / red cards | ❌ | No bookings or sendings‑off |
| Advantage played | 🟡 | Offside "advantage" only |

## 6. Conditions, fitness & health

| Element | Status | Notes |
|---|---|---|
| **Individual fitness per player** | ✅ | Each player has live condition (now shown as a per‑player bar in the UI) |
| Fatigue from tempo/press/work rate | ✅ | Drains by exertion vs Stamina/Natural Fitness |
| **Fitness → performance** (slower, more mistakes) | ✅ | Low condition cuts pace (effSpeed) and execution sharpness (passes/shots/first touch) |
| **Injuries / knocks** | 🟡 | Players can pick up a knock (slower, more error‑prone) — but no severity tiers, no time off, no subs |
| Weather (rain/heat/wind) | ✅ | Affects friction, directness, pass error, shot scatter, fatigue |
| Home advantage / travel | ✅ | Sharpness lift at home; away travel fatigue |
| Morale / confidence / momentum | ❌ | No psychological state affecting play |
| Match sharpness / long‑term condition | ❌ | Single‑match only |

## 7. Tactics & instructions

| Element | Status | Notes |
|---|---|---|
| Team styles (tiki‑taka, gegenpress, counter, route‑one, catenaccio, …) | ✅ | Presets of mentality/tempo/directness/pressing/line height/width |
| **Player traits / PPMs** | ✅ | shoots_from_distance, places_shots, tries_killer_balls, likes_to_dribble, runs_in_behind, cuts_inside, gets_forward |
| Per‑player **individual instructions** | ❌ | No per‑role roles/duties (e.g. inverted winger, ball‑playing CB, target man) |
| **In‑match management** (live tactic/mentality changes, shouts) | ❌ | Tactics fixed at kick‑off |
| **Substitutions** | ❌ | None — required to make injuries/fatigue meaningful |
| Formation changes mid‑match | ❌ | |
| Set‑piece / corner instructions | ❌ | |

## 8. Match simulation fidelity

| Element | Status | Notes |
|---|---|---|
| Continuous 2D positional sim (0.1s tick) | ✅ | |
| Deterministic seeded RNG (separate commentary RNG) | ✅ | |
| Full FM attribute set (~38) | ✅ | All carried per player; most impactful wired in |
| xG model | ✅ | Distance/angle/type curve |
| Live player ratings | ✅ | FM‑style from contributions |
| Stats (poss, shots, SoT, pass %, etc.) | ✅ | |
| Ball physics (bounce height, spin, deflections) | 🟡 | 2D ground + simple air timer; no true Z height/bounce |
| Referee positioning / added time | ❌ | Added time not modelled |

## 9. Presentation / match‑day UX

| Element | Status | Notes |
|---|---|---|
| Broadcast 2D view (interpolation, trail, flashes) | ✅ | |
| Commentary ticker + scrolling feed | ✅ | New events: take‑on, corner, offside, injury, penalty |
| **Highlight modes (event‑driven)** | ✅ | Modes differ by how many events are shown; each clip plays the full build‑up |
| Replays + slow‑mo + speed controls | ✅ | |
| xG / ratings / **individual fitness** panels | ✅ | |
| Incident timeline | ✅ | |
| Player/role indicators on pitch | 🟡 | Numbers + colours; no role labels or stamina rings on the pitch |

---

## Prioritised roadmap (next increments)

1. **In‑match management + substitutions** — live mentality/tempo/press changes,
   touchline shouts, subs (which finally makes injuries & fatigue matter). *High*
2. **Fouls → free kicks & penalties + cards** — proper discipline and a spot‑kick
   set piece. *High* (most‑requested missing restart)
3. **Player roles & duties + individual instructions** — inverted winger,
   ball‑playing defender, target man, etc., layered on top of traits. *Medium*
4. **Defensive depth** — man‑marking assignments, zonal options, an active
   offside‑trap line that steps up. *Medium*
5. **Combination play** — one‑twos, overlaps/underlaps, third‑man runs. *Medium*
6. **Ball height / true physics** — Z axis for bouncing balls, volleys, headers
   from height. *Lower* (visual polish)
7. **Morale / momentum** — confidence swings that nudge sharpness within a match. *Lower*

## What changed in the current increment

Implemented and calibrated this pass:

- 1v1 **take‑ons** (per‑decision, attribute + trait driven, with a pace burst)
- **Off‑ball runs in behind** (Off‑the‑Ball + `runs_in_behind`)
- **Player traits / PPMs** wired into shooting, passing and dribbling decisions
- **First touch under pressure** + **fitness‑driven mistakes**
- **Shot‑position fix**: carrier pulls up at the box edge; shots come from
  realistic distances rather than the goal line
- **Goalkeeper**: dives across to the shot; rushes out for clean‑through balls
- **Offsides** (second‑last‑defender line, judged when the flagged runner plays it)
- **Corners** (loaded box → delivery → aerial duel; conceded from saves/blocks/clearances)
- **Individual fitness** surfaced per player (bar) + **injuries/knocks** that slow
  and degrade a player
