# Match Engine — Deep Review: How Games Play Out

How a result actually emerges in this engine, and how **team tactics, individual
tactics (traits), player ratings (attributes), fatigue and randomness** combine.
Every claim below is backed by a headless experiment (numbers are averages over
the stated number of seeded matches).

> Caveat: I can run the simulation and measure it, but I can't see the rendered
> 2D view — visual judgements are yours.

---

## 0. The simulation in one paragraph

The match is a continuous 2D positional sim on a 105×68m pitch at a **0.1s tick**.
Every ~0.25–0.45s each player on the ball takes a "slice" decision (shoot / cross
/ take-on / pass / dribble); off the ball, players move toward targets set by
tactics (shape, pressing, support angles, runs in behind). Every contested
outcome is an **attribute duel scaled by a random roll** from a single seeded RNG
(`mulberry32`), so the same seed always replays identically — essential for the
planned online mode. Commentary uses a *separate* RNG so text never perturbs the
result.

The decision chain for the player on the ball (`carrierUpdate`):

```
under tight pressure? → residual tackle duel (can lose it)
slice tick reached?   → GK: distribute
                      → SHOOT  (if in range & good angle)
                      → TAKE-ON (if tight + space ahead)
                      → CROSS  (if wide & advanced, target in box)
                      → PASS   (best target + best pass type)
                      → else keep dribbling toward goal (pulls up at box edge)
```

---

## 1. Player ratings (attributes) — the foundation

Each player carries the full ~38-attribute FM set. Attributes feed **every** duel,
not a single "overall":

| Action | Attributes that decide it |
|---|---|
| Pass success | Passing·0.55 + Technique·0.3 + Vision·0.15, vs distance & pass type |
| Seeing the ambitious pass | Vision (gates through/lofted/chip options) |
| Shot accuracy | Finishing / Long Shots / Technique / Composure (spread) |
| Take-on | Dribbling·0.5 + Agility·0.25 + Balance·0.15 + Flair·0.1 vs Tackling·0.5 + Marking·0.2 + Anticipation·0.2 + Strength·0.1 |
| Aerial duel | Heading·0.55 + Jumping·0.3 + Bravery/ Marking |
| Save | Reflexes·0.5 + Handling·0.3 + One-on-Ones·0.2, vs placement |
| First touch | (First Touch + Technique)/2, harder under pressure |
| Top speed | 4.6 + (Pace+Acceleration)/2 · 0.19 |

**Evidence — quality wins out.** A 4-team round-robin (balanced tactics, both home
& away, 6 seeds per fixture) produced a table that tracks squad strength:

```
RMA 60   LIV 54   MCI 50   ARS 38
```

Real Madrid (Mbappé 19, Vinícius 18, Bellingham 18) top; Arsenal (lowest-rated
marquees here) bottom. Ratings drive results — but not deterministically (see §5).

---

## 2. Team tactics — how a style changes the game

A *style* is a preset of six knobs — **mentality, tempo, directness, pressing,
line height, width** — read directly by movement, pressing, pass selection and
shot willingness. Effects compound through the whole sim.

**Evidence — tactical matrix (MCI home v LIV away, 12 seeds each):**

```
gegenpress         v catenaccio   | poss 41-59 | shots 14-11 | goals 1.4-1.4
tiki-taka          v counter      | poss 44-56 | shots 12-11 | goals 1.3-0.9
route-one          v tiki-taka    | poss 54-46 | shots 13-12 | goals 0.9-0.7
control-possession v gegenpress   | poss 56-44 | shots 14-26 | goals 2.3-2.0
balanced           v balanced     | poss 51-49 | shots 17-14 | goals 1.6-1.3
```

What this shows working well:
- **Defensive setups suppress the game.** Catenaccio / counter drag the shot count
  down to ~22–25 combined vs ~31 for balanced — sitting deep genuinely soaks pressure.
- **High pressing manufactures chances.** Against possession football, gegenpress
  generated **26 shots** — winning the ball high and attacking quickly.
- **Mentality/line height move goals**, e.g. control-possession vs gegenpress is an
  open 2.3–2.0 game; tiki-taka beats a low-block counter side 1.3–0.9.

⚠️ **Finding — possession % is driven by tempo, not control.** The deeper, slower
side keeps showing *more* possession (catenaccio 59%, counter 56%) because
possession is measured as *time on the ball*, and a low-tempo team holds each
touch longer. In real football a dominant high-press side usually has *more* of
the ball. This is the clearest tactical fidelity gap (see §6).

---

## 3. Individual tactics — traits / PPMs

On top of attributes, **traits** bias a player's choices so two identical
statlines still behave differently. Implemented and wired in:

| Trait | Effect in the decision code |
|---|---|
| `shoots_from_distance` | +6m shooting range, ×1.6 long-shot probability |
| `places_shots` | halves the chance of choosing "power", prefers placed |
| `tries_killer_balls` | through-ball threshold lower, ×1.5 likelihood to attempt |
| `likes_to_dribble` | +0.025 take-on willingness per slice |
| `runs_in_behind` | makes the off-ball run beyond the line far more readily |
| `cuts_inside` | (assigned; movement bias — see §6, not yet fully expressed) |
| `gets_forward` | (assigned to full-backs/CMs; shape push — partial) |

These are assigned to marquee players (De Bruyne/Ødegaard killer balls,
Doku/Vinícius dribble, Haaland/Mbappé run in behind, Salah places & cuts in, etc.).

---

## 4. Fatigue & conditions — the late-game shift

Fitness is **individual** (each player has a live condition), drained per tick by
exertion = f(team tempo, pressing, the player's Work Rate) and resisted by Stamina
+ Natural Fitness, modulated by weather (heat ×1.5). Low condition cuts pace
(`effSpeed`) **and** execution sharpness (`sharp` → worse passes, shots, saves,
first touch). Knocks/injuries apply a further speed & error penalty.

**Evidence — team-average fitness by minute (gegenpress MCI v catenaccio LIV):**

```
minute :    0   15   30   45   60   75   90
gegen  :  100   95   90   85   81   76   71   (high press: -29)
caten  :   97   94   90   87   84   80   77   (sits off: -20, starts at 97 = travel)
```

The pressing side pays for it — ~9 points more fatigue by full time — so its
sharpness and pace fade late, exactly the real-world trade-off of an intense
press. Note the away side starts at **97**, not 100: the home-advantage travel
penalty. (Right now there are no substitutions, so a tired/injured player can't be
replaced — that's the top roadmap item.)

---

## 5. Randomness — variance around the expected result

Every duel is `attributeRatio` vs a roll, and shots use Gaussian placement, so the
*expected* better team wins more often but not always.

**Evidence — same fixture, MCI v LIV balanced, 40 seeds:**

```
results MCI/Draw/LIV : 24 / 10 / 6
shots/match          : 32 ±5.8   (≈18% game-to-game variation)
scoreline spread     : 1-0×8  2-0×6  1-1×4  0-0×4  2-2×2  3-1×2  2-1×2  0-2×2 …
```

MCI (home + strong) win 60% but draw 25% and *lose 15%* — including 0-2 upsets.
Scorelines cluster on realistic low numbers with a believable tail. This is the
"accurate to life with an element of randomness" behaviour you asked for.

---

## 6. Where it diverges from real life / FM (priority findings)

1. **Goals are over-concentrated in the central striker.** In the 40-match sample
   the top scorers were **Haaland 64, Núñez 33, Doku 1** — i.e. almost every goal
   came from the focal No.9, with wingers and midfielders barely scoring. Real
   football (and FM) spread goals across cutting-in wingers, arriving midfielders
   and penalties. *Root cause:* off-ball runs + the carrier pull-up + the cross
   target logic funnel the final ball to the most advanced central player.
   *Fix:* let `cuts_inside` wingers carry into shooting positions and shoot; add
   late midfield runs into the box; weight cross/through targets less centrally.
   **This is the #1 thing to fix next for realism.**
2. **Possession % reflects tempo, not control** (see §2). *Fix:* base possession
   on territory + a pressing-weighted recovery model, or normalise by tempo.
3. **No substitutions / in-match management**, so fatigue & injuries can't be
   managed — the late-game fade has no counterplay.
4. **No fouls → free kicks / penalties / cards.** Fouls are silent turnovers.
5. **Player roles & duties** (inverted winger, ball-playing CB, target man) aren't
   modelled — only team knobs + traits.
6. **`cuts_inside` / `gets_forward` traits are assigned but barely expressed** in
   movement yet — they need dedicated off-ball behaviour.

## 7. What's solid

- Attribute-driven duels across passing, shooting, dribbling, aerials, saves.
- Tactical styles that visibly change shot volume, pressing output and openness.
- Individual, attribute-linked fatigue with a realistic high-press cost.
- Believable variance: the better side is favoured, not guaranteed.
- Deterministic, seed-replayable simulation (ready for authoritative online play).

## 8. Calibration baseline (200 matches, MCI v LIV balanced)

```
goals 2.48/match · shots 30.6 · take-ons 64 (51% won) · corners 6.2 · offsides 3.6
results MCI 97 / Draw 56 / LIV 47 · common scores 1-1, 1-0, 2-0
```

Slightly under real EPL goals/game (~2.8) — a small finishing/save tune would lift
it — but the shape is right.
