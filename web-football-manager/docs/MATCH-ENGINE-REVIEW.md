# Match Engine Review — Our Engine vs Football Manager

A deep comparison of our 2D match engine against how Football Manager's match
engine ("the ME") models football, the variances between them, and a phased
plan to close the gap. The goal: **shooting and passing decisions should follow
from individual player skills, tactics, and match context — real intelligence
on the pitch — with the right *type* of pass/shot chosen for each situation.**

---

## 1. Executive summary

FM's engine is built on two ideas we only partially have:

1. **Per-"slice" situational decision-making.** Every ~¼ second, *each* player
   independently evaluates the situation and chooses the action they judge best
   from their attributes, role, tactics, morale and context — and can change
   their mind mid-move as things develop.
2. **Typed actions chosen to fit the moment.** A "pass" isn't one thing — it's a
   pass *to feet*, a *driven* ball, a *through ball* into space, a *lofted* ball
   over the top, a *switch*, or a safe recycle. Likewise shots are *placed/
   finesse*, *power*, *chipped/lobbed*, *volleyed* or *headed*. Which one a
   player attempts — and how well — depends on Passing/Vision/Technique/
   Decisions/Composure/Flair etc.

Our engine currently has a **single shared decision timer**, **one pass type**
(which we recently made always "lead" like a through ball), and **one shot
type**. That's why passing can feel same-y and occasionally unintelligent.

This document lists every variance and proposes a phased plan, the centrepiece
of which is a **per-player utility-based decision model** that selects among
**typed passes and shots** weighted by the player's attributes and the team's
tactics.

---

## 2. How FM's match engine works (researched)

- **Decision slices.** "Players and officials make a decision every quarter of a
  second (a 'slice')… each player continually assesses the situation around them
  and performs the action they think is best, based on their attributes," and
  can **change decision mid-slice** as play develops.
  ([FM26 Match AI](https://www.footballmanager.com/features/match-ai-and-animation),
  [FM Guru](https://www.footballmanagerguru.com/how-football-manager-match-engine-works/))
- **Attributes + role + tactics + context, evaluated together.** "A technically
  average player with high Decisions and Anticipation can consistently outperform
  a more talented player used in the wrong role." Intelligence = the *choice*,
  not just the execution.
- **Pass types & the attributes behind them.** Through balls, lofted, driven and
  chipped passes are governed by **Passing** (base success), **Vision**
  (*recognising* the opportunity), **Technique** (quality of execution — does it
  land in stride), with **Decisions** picking the right option and **Composure**
  holding up under pressure.
  ([Passion4FM attributes](https://www.passion4fm.com/football-manager-player-attributes/))
  - *Driven* — low, hard, medium-long; supply a striker / break lines.
  - *Lofted* — over the top, switch play, clear the lines.
  - *Through ball* — into space behind the defence for a runner.
  - *Chip / disguised* — delicate, lift over a defender.
  ([passing techniques](https://thetitansfa.com/master-the-football-pass-technique-complete-guide/))
- **Shot types.** Finesse (precision, inside foot, curl — Technique/Finishing),
  power (Long Shots/Strength), chip/lob (over a stranded keeper — Composure/
  Vision/Technique), volley (timing), header (Heading/Jumping Reach).
  ([shot types](https://topplayers.net/the-complete-guide-to-the-different-types-of-football-shots/))
- **Dribbling / 1v1.** Dribbling × Technique × Flair × Agility × Balance ×
  Acceleration. **Flair** "governs whether a player chooses to dribble, take on
  long-range shots or spectacular efforts — to take risks with the ball."
- **First Touch.** Controls the ball cleanly; a poor touch "may bounce or bobble"
  — directly affecting whether a player can act under pressure.
- **The mental core (the "intelligence").** **Decisions** (right choice, works
  with Composure under pressure), **Anticipation** (reads unfolding play),
  **Off The Ball** (finding space/movement), **Composure** (steadiness in
  possession), **Flair** (risk/unpredictability).
- **Player traits / preferred moves** layer individual tendencies on top — e.g.
  *plays killer balls often*, *shoots from distance*, *places shots*, *tries to
  beat the offside trap*, *knocks ball past opponent*.
  ([traits](https://www.passion4fm.com/football-manager-player-traits/))
- Plus systems we don't touch yet: **set pieces** (corners/free kicks/pens),
  **crossing** as a distinct delivery, **marking schemes**, **offside**.

---

## 3. How our engine works today

- **Decision timing:** a *single, shared* `decisionTimer` (~0.5 s) on the match,
  not per-player; only the current ball-carrier "decides".
- **Passing:** one pass type. We recently made every pass *lead* the receiver
  (run-onto), so all passes behave like through balls. Target chosen by a
  heuristic (advancement + openness + shooting-position bonus). Error from
  Passing+Technique; Vision only extends range. Decisions/Anticipation/Composure
  not used in the *choice*.
- **Shooting:** one shot type. Probability from Finishing/Long Shots × closeness
  × angle × space; spread from Finishing/Composure + distance + weather. No
  finesse/power/chip/header distinction.
- **Dribbling:** the carrier just advances toward goal at reduced speed; a
  proximity tackle duel can dispossess. No deliberate take-on, no Flair.
- **First touch:** only used as a loose-ball control probability; no "bad touch
  under pressure" turnover when receiving.
- **Off-ball movement:** zonal pull + passing-triangle support + separation +
  drift. Good shape, but **not driven by per-player Off The Ball / Anticipation**
  — every player moves by the same rules.
- **Attributes used today:** pace, acceleration, finishing, longShots, passing,
  technique, composure, dribbling, balance, tackling, aggression, strength,
  firstTouch, vision, reflexes/handling/oneOnOnes, stamina, naturalFitness,
  workRate. **Unused in play:** marking, heading, crossing, anticipation,
  offTheBall, positioning, bravery, concentration, teamwork, determination,
  flair, leadership, agility, jumpingReach, aerialReach, kicking, command.

---

## 4. Variance analysis

| # | Dimension | Football Manager | Our engine today | Gap |
|---|-----------|------------------|------------------|-----|
| V1 | Decision model | Per-player, every ¼ s, situational, can change mid-move | One shared ~0.5 s timer, only the carrier decides | **High** |
| V2 | Pass *types* | To-feet / driven / through / lofted / switch / chip | One type, always "leads" like a through ball | **High** |
| V3 | Pass *choice* intelligence | Vision sees it, Decisions picks it, weighed vs risk | Heuristic score; Decisions/Anticipation unused | **High** |
| V4 | Shot *types* | Finesse / power / chip / volley / header | One generic shot | **High** |
| V5 | Dribbling / 1v1 take-ons | Dribbling×Technique×Flair×Agility vs defender | Move-to-goal + proximity tackle only | **Med** |
| V6 | First touch under pressure | Bad touch can bobble / lose the ball | Only a loose-ball control roll | **Med** |
| V7 | Off-ball intelligence | Off The Ball/Anticipation drive runs & space | Same movement rules for everyone | **Med** |
| V8 | Crossing | Distinct delivery to a target in the box | Wide players just pass | **Med** |
| V9 | Aerial play / headers | Heading + Jumping Reach duels | Not modelled | **Med** |
| V10 | Player traits / preferred moves | Per-player tendencies | None | **Low/Med** |
| V11 | Set pieces | Corners, free kicks, penalties, throw routines | Goal kick + simple throw-in only | **Med** |
| V12 | Marking / offside | Man/zonal marking schemes, offside line | Pressing + zonal only; no offside | **Med** |
| V13 | Unused attributes | ~all attributes matter | ~17 unused (see §3) | **Med** |
| V14 | Morale / form / mentality of the player | Feeds decisions | Not modelled | **Low** |

---

## 5. What to add / fix

### 5.1 On-pitch intelligence — the per-player decision model *(foundation)*
Replace the shared timer with a **per-player decision cadence** (~0.25–0.35 s,
tempo-scaled). On the carrier's slice, build a **set of candidate actions**
(each typed pass option, each shot option, dribble/take-on, hold/shield) and
**score each by expected value** using the player's attributes, the team
tactics, and context (space, pressure, teammate runs, scoreline). Choose
probabilistically (so it's not deterministic), with **Decisions** sharpening the
choice, **Composure** resisting pressure degradation, **Flair** adding
risk/variance. This single change is what creates "intelligence on the pitch".

### 5.2 Pass types *(directly addresses the feedback)*
Model distinct pass options, each with its own execution and best use:

| Type | When chosen | Execution | Key attributes |
|------|-------------|-----------|----------------|
| To feet (short) | Safe retention, build-up, marked runner | ball to teammate's **feet** (current pos), low error | Passing, Technique, Composure |
| Driven | Break a line at speed, supply striker | fast, low, flat; harder to intercept | Passing, Technique, Strength |
| Through ball | A teammate is making a run into space | **lead** into space ahead of the runner | **Vision**, Passing, Technique, Decisions |
| Lofted / over-the-top | Beat a high line / switch / clear | slower arc, bypasses ground defenders | Vision, Technique, (Jumping to receive) |
| Chip / disguised | Tight space, lift over a defender | delicate, short, high risk | Technique, Composure, Flair |

Selection rule of thumb: **to feet when marked/safe, through ball only when a
runner and space exist, lofted to switch or beat a high line, driven to progress
at pace.** Vision gates whether the harder options are even *seen*; Technique/
Passing/Composure set how well they're executed; Decisions picks the right one.
This removes today's "everything is a through ball" behaviour.

### 5.3 Shot types
Pick by situation + attributes + Flair:
- **Placed / finesse** — default in/around the box; accuracy from Technique +
  Finishing + Composure; tighter spread, less power.
- **Power** — from distance or when hurried; Long Shots + Strength; faster but
  wilder.
- **Chip / lob** — when the keeper is off the line; Composure + Vision +
  Technique; beats an advanced keeper, risky.
- **Header** — from crosses/set pieces; Heading + Jumping Reach + Bravery.
- **Volley** — from a ball in the air/loose; Technique + timing.
Flair raises the chance of attempting the spectacular/long-range.

### 5.4 Dribbling & 1v1 take-ons
A carrier facing a defender may **attempt to beat him**: success =
Dribbling+Technique+Flair+Agility+Acceleration vs Marking+Tackling+Positioning;
success bursts past (space to shoot/cross), failure risks the tackle. Flair and
the tactic's risk/mentality drive how often it's tried.

### 5.5 First touch under pressure
When receiving under close pressure, a poor **First Touch** (with Composure,
Technique) risks a heavy touch → loose ball / turnover. Rewards good receivers
and makes pressing pay off.

### 5.6 Off-ball intelligence
Weight runs and space-finding by **Off The Ball + Anticipation** per player, so a
clever forward peels into space and a poor one stands still — varied, individual
movement instead of one rule for all.

### 5.7 Crossing & aerial play
Wide players in advanced areas can **cross** (Crossing) to target a teammate in
the box, who attempts a **header** (Heading/Jumping) — opening a whole class of
chances and making width/target-man tactics matter.

### 5.8 Player traits / preferred moves *(later)*
A small set of per-player flags (*shoots from distance*, *plays killer balls*,
*tries to beat man*, *plays it safe*) that bias the decision weights — cheap,
high-flavour individuality.

### 5.9 Set pieces, offside, marking *(later)*
Corners, free kicks, penalties; an offside line; man/zonal marking assignments.

---

## 6. Target attribute → mechanic map

| Attribute | Should drive |
|---|---|
| Passing | base pass success (all types) |
| Vision | *seeing* through/lofted/switch options; pass range |
| Technique | execution quality of passes, finesse shots, dribbles, first touch |
| Decisions | choosing the best action; fewer poor choices |
| Composure | resisting pressure degradation on pass/shot/touch |
| Anticipation | reading loose balls, interceptions, off-ball reactions |
| Off The Ball | quality of attacking runs / finding space |
| Flair | attempting risky passes/shots/dribbles; variance |
| Finishing / Long Shots | shot conversion close / far |
| Dribbling / Agility / Balance | take-on success & fluidity |
| First Touch | clean control under pressure |
| Marking / Positioning | defensive shape, picking up runners |
| Tackling / Strength / Aggression | winning the ball, duels |
| Heading / Jumping Reach / Bravery | aerial duels, headed shots |
| Crossing | quality of crosses |
| Reflexes / Handling / One-on-Ones / Aerial Reach / Command | goalkeeping |
| Pace / Acceleration | speed, chasing, bursting past |
| Stamina / Natural Fitness / Work Rate | fatigue & recovery |
| Concentration | fewer lapses, esp. late game |

---

## 7. Phased plan

- **Phase A — Decision model + pass types (the core).** Per-player slice
  decisions; typed passes (to-feet / driven / through / lofted / chip) selected
  by Vision/Decisions/tactics and executed by Passing/Technique/Composure.
  *Biggest single realism gain; directly fixes the reported feedback.*
- **Phase B — Shot types.** Placed/power/chip + Flair-driven selection; tune to
  keep realistic stats.
- **Phase C — Dribbling/1v1 take-ons + first-touch-under-pressure.** Makes
  Dribbling, Flair, Agility, First Touch matter; rewards pressing.
- **Phase D — Off-ball intelligence.** Off The Ball/Anticipation-weighted runs.
- **Phase E — Crossing & aerial/headers.** Wide play + target men; Heading/
  Jumping/Crossing come alive.
- **Phase F — Player traits/preferred moves.** Per-player tendencies.
- **Phase G — Set pieces, offside, marking schemes.**

Each phase keeps the headline match stats realistic (≈25 shots, ≈33% on target,
≈2.7 goals, ≈70% saves, ≈80% pass completion) and is verified with the headless
diagnostic harness before shipping.

## 8. How we verify

- **Headless diagnostics** (already in place): aggregate stats over many seeded
  matches — shots, on-target %, goals, save %, possession, pass completion, by
  tactical style. No regression in these is the gate for each phase.
- **New per-phase metrics:** pass-type mix (e.g. ~70–85% short/to-feet, the rest
  driven/through/lofted), shot-type mix, take-on success rate, headed-goal share
  — checked against real-football ballparks.
- **Determinism** preserved (seeded RNG) so results are reproducible and ready
  for server-authoritative online play.

---

### Sources
- [FM26 — Match AI & Animation](https://www.footballmanager.com/features/match-ai-and-animation)
- [How the FM Match Engine works](https://www.footballmanagerguru.com/how-football-manager-match-engine-works/)
- [Passion4FM — Player Attributes Explained](https://www.passion4fm.com/football-manager-player-attributes/)
- [Passion4FM — Player Traits / Preferred Moves](https://www.passion4fm.com/football-manager-player-traits/)
- [Master the Football Pass Technique](https://thetitansfa.com/master-the-football-pass-technique-complete-guide/)
- [Types of football shots](https://topplayers.net/the-complete-guide-to-the-different-types-of-football-shots/)
- [FM Match Engine overhaul (decision-making)](https://realsport101.com/article/football-manager-2021-match-engine-receives-huge-overhaul-ai-attacking-intelligence-goalkeepers-defence-decision-making-tactics)
