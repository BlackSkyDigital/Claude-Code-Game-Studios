# Match Engine Architecture — How FM Does It, and How We Do It

A foundational design note answering: *what's the best way to build this match
engine — a "base value + adjustments from stats/tactics/instructions" model, or
something else? And is that what we have?*

Short answer: there are **two separate questions** people usually conflate, and
the right design uses a different answer for each.

---

## The two layers

### Layer 1 — the simulation paradigm (the big architectural choice)

| Approach | What it is | Pros | Cons |
|---|---|---|---|
| **Event / possession model** ("base + adjustment") | The match is a chain of discrete events (possession → pass → shot → …). Each event's outcome is a **base probability adjusted by modifiers** (attributes, tactics, home/away, form). No pitch geometry. | Simple, fast, extremely stable & tunable; perfect for simulating whole leagues quickly. | No spatial truth → you can't render a believable 2D match, and "tactics" are abstract sliders, not real positioning. No emergent movement, space, or build-up. |
| **Continuous spatial agent simulation** (what FM uses) | Real pitch coordinates; the ball and 22 player **agents** are stepped on a fine clock. Every ~¼ second each player re-evaluates the situation and picks the best action; physics moves the ball and players. | Produces emergent, watchable football — runs, space, build-up, a real 2D view. Tactics/instructions are *actual* positioning & behaviour. | Far more complex; results are harder to calibrate (small changes ripple); CPU-heavy. |

**FM is firmly the second kind.** Its match engine runs on a *slice* system —
"players and officials make a decision every quarter of a second," continually
re-assessing and even **changing their decision mid-slice** as play develops.
([FM21 Match Engine AI](https://www.footballmanager.com/news/match-engine-ai-fm21),
[How the ME works](https://www.footballmanagerguru.com/how-football-manager-match-engine-works/))

### Layer 2 — how a single decision/contest is scored (inside the agent model)

This **is** "base + adjustment", and it's the correct way to parameterise the
micro-decisions: each action/duel = a **base coefficient × attribute weighting ×
situational multipliers + randomness**. FM evaluates "raw attributes, traits and
context rather than simplified star ratings," and weights attributes by **role &
duty** (finishing matters more for a striker than a defender), modified by
tactics, player instructions, morale, pitch and weather.
([FM-Arena: understanding the ME](https://fm-arena.com/thread/16586-understanding-football-manager-development-engine/),
[Passion4FM: attributes explained](https://www.passion4fm.com/football-manager-player-attributes/),
[FM Scout: current ability](https://www.fmscout.com/a-guide-to-current-ability-in-football-manager.html))

A subtle but important FM principle: **decision vs execution are separate.** A
player first *chooses* an action (driven by Decisions/Vision/Anticipation +
instructions), then *executes* it with a quality set by the relevant technical
attribute — so a smart player can pick the right pass but a poor passer still
mis-hits it.

---

## So what's "best"?

For a project whose whole point is a **believable 2D match the friends watch**,
the answer is the **continuous spatial agent model (Layer 1, option 2)** with
**base-coefficient × weighted-attributes × situational-modifiers** scoring for
each decision and contest (Layer 2). That's the FM design, and it's the only one
that can render real build-up and movement.

A pure event/possession model would be *easier and more stable* (and is genuinely
the better choice if you only wanted to crunch a 38-game season with no visuals).
It's worth knowing it exists — but it can't give the on-pitch realism you keep
asking for.

---

## Is that how we have it now? — Yes.

Our engine is already the FM-style hybrid:

**Layer 1 (spatial agent sim):**
- Real 105×68 pitch, ball + 22 player agents, stepped at a **0.1s tick**.
- Each carrier makes a **slice decision every ~0.25–0.45s** (faster at high
  tempo) — shoot / take-on / cross / cut-back / pass / carry.
- Off the ball, every agent moves toward a target set by formation + team
  shape + **duty** + pressing/marking + timed runs — not scripted events.

**Layer 2 (base + weighted-attributes + modifiers) — every action & duel:**
- Pass success = `base × (Passing·0.55 + Technique·0.3 + Vision·0.15) / difficulty`,
  with type/distance multipliers and weather error.
- Shot, take-on, aerial, tackle, save are all `attribute-ratio` contests × a
  base coefficient × situational multipliers (space, pressure, angle) + RNG.
- **Decision vs execution** is split as FM does it: `choosePass` *picks* the
  option (Vision/Decisions); `executePass` *applies error* from Passing/Technique.
- Context modifiers are real: `sharp()` (fatigue + home edge) and `effSpeed()`
  (fatigue) scale execution and pace; tactics set mentality/tempo/pressing/line/
  width/marking; traits & duty bias individual choices.
- One **seeded RNG** drives everything (deterministic, replayable — needed for
  the planned online mode); a **separate RNG** drives commentary so text never
  changes the result.

So: the "base + adjustments from stats/tactics/instructions" intuition is exactly
right **for individual decisions**, and that's what we do — but it lives *inside*
a continuous spatial simulation, which is the part that makes the 2D view real.

---

## Where we differ from FM (the real gaps, not the paradigm)

The architecture is right; these are depth gaps to invest in (not a rewrite):

1. **Ball physics / the Z axis.** FM simulates true 3D ball flight (height,
   bounce, spin, momentum). Ours is 2D-ground + an `airTimer` abstraction for
   lofted balls. This is the biggest fidelity gap — volleys, bouncing balls,
   headers from height, deflections.
2. **Mid-slice reactivity.** FM lets a player change his mind mid-slice as play
   shifts; we commit one decision per slice. More frequent re-evaluation would
   make play more reactive.
3. **Off-the-ball intelligence.** FM's biggest realism lever. We have runs in
   behind, support angles, duty and drift; we still lack checking-to-feet,
   third-man runs, overlaps/underlaps and true cover-shadow awareness.
4. **Hidden context layers.** Morale, confidence, momentum, match sharpness and
   pitch condition all feed FM decisions; we model fatigue, weather and home
   edge but not the psychological/condition layers.
5. **Role & duty depth.** We have duty + trait-driven roles; FM has dozens of
   roles each switching distinct behaviours (target-man hold-up, false-nine
   dropping, libero stepping out).

## Recommendation

- **Keep the architecture** — continuous spatial agent sim + base/weighted/
  modifier decisions is correct and matches FM. No rewrite.
- **Invest, in order of realism-per-effort:** (1) off-the-ball movement
  (checking, overlaps, cover shadows), (2) a light **Z/physics layer** for
  aerial play, (3) mid-slice reactivity, (4) role/duty depth, (5) morale/
  momentum context.
- **Keep calibrating against real per-90 rates** — the price of the spatial
  model is that tuning ripples, so every change is verified headlessly
  (goals/shots/passing/discipline) before shipping.

## Sources

- [Football Manager — Match Engine AI (FM21): the "slice" system, decisions every ¼s, mid-slice changes](https://www.footballmanager.com/news/match-engine-ai-fm21)
- [How Football Manager's Match Engine Works](https://www.footballmanagerguru.com/how-football-manager-match-engine-works/)
- [FM-Arena — Understanding the development/match engine (attribute weighting)](https://fm-arena.com/thread/16586-understanding-football-manager-development-engine/)
- [Passion4FM — Player Attributes Explained (role-weighted attributes)](https://www.passion4fm.com/football-manager-player-attributes/)
- [FM Scout — Guide to Current Ability (attribute weighting by role)](https://www.fmscout.com/a-guide-to-current-ability-in-football-manager.html)
- [Top Football Managers — How to make a soccer manager match engine](https://topfootballmanagers.blogspot.com/p/blog-page.html)
