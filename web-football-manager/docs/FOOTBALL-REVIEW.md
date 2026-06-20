# Deep Football Review — does the match do what you'd expect?

A review of the football itself (not just league tables): how chances are created,
whether goals come from mixed sources, shot outcomes, and the "small print" of
real football. Run `node tools/review.mjs [N]` for the live numbers and
`node tools/roles.mjs [N]` for the by-position goal split.

## What the review checks, and where we landed

Aggregated over 60 mixed-team matches (representative of the league, ~2.87 g/g):

**Goals come from MIXED sources** (not one area) — the headline check:

| source | sim | real-ish |
|---|---|---|
| open play | 37% | ~35% |
| cut-back / low cross | 36% | ~18% (a bit high — see limitation) |
| cross (headers etc.) | 7% | ~12% |
| penalty | 7% | ~7% |
| deflected | 8% | ~6% |
| set-piece (free kick) | 4% | ~6% |
| own goal | 2% | ~2% |
| through-ball | ~1% | ~8% (low — see limitation) |

**Shot outcomes are realistic:** goal ~9–10%, saved ~23%, blocked ~25%,
off-target ~44% (real ~10 / 25 / 28 / 37).

**Shot types:** foot ~80% / header ~19% / (penalties placed) — real ~75 / 18 / 7.

**Event rates per match** (all now present and realistic):
deflections ~2.3, own goals ~0.05, handballs ~0.08, free kicks ~3.6,
penalties ~0.28, corners ~11.6.

Tactics still play distinctly (unchanged presets; see the tactics matrix and
`tools/instr.mjs`), better squads still finish higher in a realistic points
spread (see `docs/PL-SEASON-CALIBRATION.md`: champion ~84, 4th ~69, promoted
relegated, ~2.7 g/g).

## Features added in this review (the missing "football")

Real football has a lot of small events that were missing; these add variety and
spread goals off the front line:

- **Deflections.** A defender in the line of a shot now blocks it, **deflects**
  it (a ricochet that changes direction — wrong-foots the keeper, spins wide for
  a corner, or wickedly loops in), or it flies past. Deflected shots are harder
  to save; a wayward effort turned in off a defender is an **own goal**.
- **Free-kick routines.** A foul in a dangerous area is now a real set-piece: a
  **direct free-kick shot** (central, in range — low conversion as in life) or a
  **whipped cross** into a loaded box, rather than always a quick restart.
- **Handballs.** A defender in his own box occasionally blocks a shot with an arm
  → **penalty** (and sometimes a booking).
- **Own goals.** From deflections turned into the defender's own net (rare).
- **Set-piece header goals** were already added (corners); free kicks now feed
  the same aerial contest.

All were calibrated on `tools/review.mjs` + `tools/dash.mjs` so the league stays
realistic (penalties ~0.28/match, own goals ~0.05, deflected goals ~8%), and the
full-season landmarks still hold.

## Review instrumentation

The engine now exposes, for diagnostics: `goalsByChance`, `goalsByShot`,
`shotOutcomes`, and counters for `deflections`, `ownGoals`, `handballs`,
`freeKicks` (plus existing penalties/corners). The ball carries a `chance` tag
(open / through / cross / cut-back / solo / set-piece / penalty / deflected /
own-goal) set when a shot is created and read at the goal.

## Known limitations (carried over)

- **Through-ball goals ~1% (real ~8%)** and **central-midfield goals low**: the
  spatial model routes final-third possession through wide forwards, so the
  golden boot stays high (~39 vs ~28). Diagnosed and documented in
  `docs/PL-SEASON-CALIBRATION.md`; the real fix is a positional-play rewrite or
  real API ratings, not a probability tweak.
- **"Cut-back" is over-counted** — many close-range first-time finishes are
  tagged cut-back, inflating that category vs real.

## Still on the wishlist (smaller fidelity gains)

Advantage played on fouls; long throw-ins into the box; saved-penalty rebounds;
woodwork (post/bar) with rebounds; GK distribution variety (throw vs long);
second balls/knock-downs from clearances; injuries forcing tactical reshuffles.
