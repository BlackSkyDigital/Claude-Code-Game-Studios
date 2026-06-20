# Full Tactical Control — Team & Player Instructions, Custom Formations

How a manager controls their side, before and **during** the match, and the
diagnostics that prove every control affects play realistically.

## Design decision: a slider/preset hybrid (modern FM), not pure presets

FM has moved from old pure-slider tactics (overwhelming) to a hybrid: high-level
**mentality + style presets** as a starting point, with discrete **instruction
toggles/sliders** layered on top, plus **per-player instructions**. Our engine
knobs are already continuous floats, so a slider mechanism fits natively with no
abstraction mismatch.

So the UI is a **hybrid**:
- Pick a **preset** (one of 10 styles) as a quick start, OR
- Drag any of the **13 team-instruction sliders** to build a *custom* tactic, and
- Set **per-player instructions** and **duties**, and
- Choose one of **13 formations** or **drag your own custom shape**.

Everything is editable **live during the match** — the engine reads the tactics
and per-player instructions every tick, so changes take effect immediately
(`Match.setTactics / setPlayerInstruction / setDuty / setFormation`).

## Team instructions (13)

`mentality, tempo, directness (passing), pressing, lineHeight (defensive line),
width` — plus the new `tackling, shootOnSight, creativeFreedom, counterPress,
counterAttack, focusPlay, offsideTrap` — and `marking` (zonal/man).

Every knob is **neutral at its midpoint** (0.5, or 0 for the signed ones), and
the wiring is identity at neutral, so the calibrated "balanced" baseline is
byte-identical (dashboard 12/13 metrics in real range, unchanged).

### Proof each knob moves the game (`tools/instr.mjs`, MCI v MCI, neutral, 30 seeds)

Only the HOME knob varies, so the delta is purely the instruction:

| knob | low → high | effect |
|---|---|---|
| tackling | fouls 18.1 → 24.4, yellows 2.5 → 3.7 | get stuck in = more fouls/cards |
| creativeFreedom | take-ons 91 → 118 | expressive = more dribbles & ambition |
| offsideTrap | offsides won 1.2 → 4.9, shots against 13 → 9 | high line catches runners |
| shootOnSight | GF 1.23 → 1.60, shot dist 12.6 → 12.8 | shoot earlier / from range |
| counterPress | shots 12 → 14, take-ons 102 → 108 | win it back high |
| counterAttack | shots 13 → 14, quicker (shot dist & fouls ↓) | break at pace |
| focusPlay | mean shot side swings ~2.7 m | funnels play to the chosen flank |

> Engine note: the tackle/foul rates are clamped, which initially **masked** the
> tackling & counter-press multipliers — they are now applied *after* the clamp.

## Player instructions (per player)

`duty (defend/support/attack)`, `mark` + `tightMark`, `roam`, `closeDown
(more/less)`, `dribble (more/less)`, `shoot (more/less)`, `cross (more/less)`,
`passDirectness (shorter/direct)`, `getForward`, `holdPosition`, `tackleHarder`
— layered on top of the player's traits (PPMs).

### Proof (`tools/pi.mjs`, MCI v MCI, neutral, 25 seeds)

| instruction (applied to) | effect vs baseline |
|---|---|
| shoot=more (forwards) | shots 13 → 14, GF 1.40 → 1.72 |
| dribble=more (wide) | take-ons 102 → 118 |
| cross=more (wide) | crosses 19 → 24 |
| getForward (defenders) | GA 1.60 → 1.96 (gung-ho, concede more) |
| tackleHarder (def+mid) | fouls 20.0 → 21.2, more ball won |

(closeDown / holdPosition / passDirectness are functional but subtler in a mirror
of equals — they shape *how* a side plays more than the headline counters.)

## Formations (13 + custom)

Built-in: `4-3-3, 4-4-2, 4-2-3-1, 3-5-2, 5-3-2, 4-1-4-1, 4-3-2-1, 3-4-3, 4-5-1,
4-1-2-1-2, 4-2-2-2, 5-4-1`. The slot defines each player's role, so the formation
genuinely changes the side. **Custom shapes** are supported end-to-end: pass a
`Slot[]` to `MatchSetup.home/awayFormation` or `Match.setFormation`, or drag the
players in the in-app **Formation Editor**. `resolveFormation()` validates a
custom shape (11 slots, exactly one GK) and falls back safely.

### Proof formations play distinctly (`tools/grid.mjs`, vs LIV 4-3-3, neutral, 8 seeds)

Per-formation mean GD (and they interact with squad quality — std across teams in
brackets): 3-4-3 +0.66 (0.48), 4-2-2-2 +0.38 (0.39), 4-3-3 +0.19, 3-5-2 +0.16,
4-2-3-1 −0.06, 4-3-2-1 −0.03, 5-3-2 −0.09, 4-5-1 −0.16, 4-1-2-1-2 −0.59 (no
width vs a 4-3-3), 5-4-1 −0.63, 4-4-2 −0.69, 4-1-4-1 −0.81. Attacking shapes beat
4-3-3; defensive / single-striker shapes lose to it — as expected.

## Tactics still beat/lose to each other realistically (`tools/matrix.mjs 12`)

With the richer presets, the matchups sharpen: counter destroys the press
(`counter v gegenpress +2.4`; counter *away* holds gegenpress home to +0.7), a
deep block frustrates patient possession (`catenaccio v control-possession −0.6`),
gegenpress & counter are the strongest styles, control-possession the most
passive, route-one weak vs deep/counter. Squad quality and home edge still
dominate where they should.

## Risk / reward and player suitability (the FM way)

Settings are **not free upgrades** — the cost is *emergent* (the action interacts
with the opponent), not a bolted-on penalty. And an instruction only helps if it
**suits the player**, because we split *decision* (the instruction sets how often
he does it) from *execution* (his attributes decide how well it comes off).

Built-in trade-offs (verified):
- **Dribble more / creative freedom** → more take-ons, but a failed take-on is a
  turnover and success depends on the dribbler vs the defender. Whole-squad probe:
  good dribblers (18) beat **59** men; poor dribblers (5) beat only **38** and lose
  ~64% of attempts (giving the ball away). Telling the wrong player to dribble more
  *hurts* you.
- **Tackling / get stuck in** → wins more challenges but **fouls 18→24, yellows
  2.5→3.7** (card/suspension risk).
- **Get forward** (defenders) → more threat but **GA 1.6→2.0**.
- **Shoot on sight** → more shots but lower quality / wasted possession.
- **Offside trap** → a genuine gamble. Against a careless side it kills attacks
  (vs balanced GA 2.10→1.40, offsides ~4.4); against a **pacey counter** side a
  well-timed ball beats the stepped-up line for a clean 1-on-1, cancelling the
  reward (vs Counter GA 1.00→1.03 — no longer a free win). The runner's
  pace/off-the-ball/anticipation decides whether he wins the run.

So no single slider dominates; the edge comes from **combinations that exploit the
opponent's setup with players it suits** — which is what the tactics matrix shows
(counter v gegenpress +2.4, catenaccio v control-possession −0.6) and what squad
quality amplifies.

## Diagnostic harnesses

- `tools/instr.mjs [knob] [seeds]` — team-instruction sweep (low vs high).
- `tools/pi.mjs [seeds]` — player-instruction sweep.
- `tools/grid.mjs [seeds]` — team × formation grid with variance.
- `tools/matrix.mjs [seeds]` — tactics head-to-head.
- `tools/dash.mjs` — calibration vs real per-90 ranges (run after every change).
