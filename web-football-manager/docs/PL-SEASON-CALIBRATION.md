# Premier League Full-Season Calibration

Calibrating the engine so a simulated 38-game season lands where teams *typically*
do over the last ~5 PL seasons (2021-22 … 2025-26). Squads are a best-effort
snapshot as of **June 2026** (2025-26 transfers applied — e.g. Cunha & Mbeumo at
Man United, Isak & Wirtz at Liverpool, Gyökeres at Arsenal; Diogo Jota removed
following his passing in July 2025). Ratings are hand-tuned gameplay estimates.

## Tools
- `tools/season.mjs [seed]` — one full season: final table, top scorers, stats.
- `tools/seasons.mjs [K]` — K seasons aggregated: typical finishing table, the
  landmark points (1st/4th/7th/10th/17th/20th), goals/game, splits, golden boot,
  each **compared against real PL norms**.
- `tools/fetch-real.mjs` — pulls REAL standings + top scorers from API-Football
  (reads `APIFOOTBALL_KEY` from the env; needs the host allowlisted — see below).

## Where it landed (3-season aggregate vs real)

| Landmark | Sim | Real (5-yr) |
|---|---|---|
| Champion pts | ~80 | ~88 (84-93) |
| 4th | ~70 | ~72 |
| 7th | ~62 | ~60 |
| 10th | ~54 | ~51 |
| 17th (safe) | ~36 | ~38 |
| 20th | ~18 | ~22 |
| goals/game | ~2.7 | ~2.82 |
| home/draw/away | 44/24/31 | 45/24/31 |
| golden boot | ~39 | ~28 (23-36) |

Typical table shape is realistic: the genuine top clubs (Man City, Arsenal,
Liverpool, then Spurs/Man United) finish top; the three promoted sides (Leeds,
Burnley, Sunderland) and Everton battle relegation. Home advantage and the
points spread match real life closely.

## Calibration changes made
- **Squads → June 2026** (key 2025-26 transfers; Jota removed).
- **Styles rebalanced** — fewer ultra-defensive sides (most teams play balanced/
  possession, as in the real PL); Liverpool to a controlling style. This lifted
  league goals and stopped counter-attacking mid-table sides over-performing
  (no more "Wolves 2nd").
- **Set-piece goals added** — corners now produce headers from the best aerial
  attacker (often a centre-back up, or a target man). This was the key unlock for
  realistic league scoring: it raised goals/game from ~2.5 to ~2.7 **and** spread
  goals off the front line (defenders now score ~7-9% from set pieces, ~0% before).
- **control-possession made more incisive** so elite sides convert dominance into
  wins (champion separates instead of a congested top).
- The calibrated single-match baseline (`dash.mjs`, Man City v Liverpool) stays
  in/near its real ranges throughout.

## Known limitation (documented, with a precise diagnosis)

**Golden boot is too high (~39 vs real ~28); goals over-concentrate on the wide
forwards.** Use `tools/roles.mjs` to see it: goals split ~ST 34% / **wide
(wingers+AM) 58%** / midfield 3% / defenders 3-7%, versus real ~ST 33 / wide 27 /
mid 22 / def 14. The *total* goals/game is realistic, so the same goals piling
onto two inverted wingers inflates the top scorer.

Root cause (diagnosed, not just guessed): the wide forwards' goals come mostly
from **automatic first-time finishes off crosses and cut-backs** — a code path
that the open-play shot-probability never touches. So the usual levers do nothing
to it. Verified ineffective/own-goal over 40-match probes and 3-season runs:
reducing winger shot probability and the clear-chance floors (no change — those
are open-play only); focal-striker bias, in-box multiplier, through-ball spring,
elite-finishing compression (no move or cost league scoring); forcing cut-backs
to arriving midfielders (destabilised the sim to ~5 g/g via a cut-back→rebound
feedback loop, and the cut-backs still went to wingers, not midfielders — the
spatial model rarely puts central midfielders in finishing positions).

A real fix is a **chance-creation rework**, not a probability tweak: (1) make
`bestBoxTarget` / cut-back targeting distribute across the striker and arriving
central midfielders instead of repeatedly the same wide forward, (2) get central
midfielders into the box as genuine receivers, and (3) damp the auto first-time
cross/cut-back conversion. This is a larger, higher-risk change (every quick
attempt destabilised the calibrated baseline), so it is scoped as the next
structural pass rather than rushed. Grounding ratings in real API data
(`tools/fetch-real.mjs`, once the host is allowlisted) would also help, since
some of the concentration is squad-rating driven (one elite winger per top team).

### Update — chance-creation rework attempted (and why it was reverted)

The rework above was implemented and measured: central midfielders make timed
runs *into* the box, `choosePass` strongly prefers an onrushing midfielder, and a
forward in the box lays it off to him (`bestMidCutback`) before taking his own
shot. Outcome over 3 seasons:

- **Worked:** midfield goal share 3% → ~7-8%, wide forwards 58% → ~49%,
  goals/game 2.7 → **2.84** (bang on real ~2.82), and 17th/20th landmarks improved.
- **Didn't work:** the **golden boot got slightly worse (~44)** — lifting overall
  scoring raised the top scorer too, and the lay-off doesn't fire often enough to
  pull the elite winger/striker down. It also **destabilised the table** (pacey
  transition sides like Newcastle/Wolves jumped into the top 5 because the extra
  box runs and lay-offs flatter them).

So the rework improved the *distribution and scoring rate* but not the headline
golden-boot number, at the cost of table realism — a net regression — and was
reverted to keep the calibrated stable state. The conclusion: the top-scorer
concentration is driven more by **squad-rating spread (one clearly-best attacker
per top side) and the spatial chance-funnel** than by where the goals nominally
come from. The two viable fixes are therefore (a) **real squad ratings via the
API** (real attribute spreads are more compressed than these hand estimates, so
chances spread across more players), and (b) a deeper positional-play rewrite that
changes *who carries the ball into shooting positions*, not just who finishes.

## Grounding in real data (API-Football)

`tools/fetch-real.mjs` is ready to pull real standings/top-scorers/squads to tune
ratings and lock the landmark targets precisely. It currently can't run from the
hosted environment: outbound requests to `v3.football.api-sports.io` return
`403 Host not in allowlist` from the egress proxy (the request itself is correct —
`GET` with only the `x-apisports-key` header, per the API docs). To enable it, add
`v3.football.api-sports.io` to the environment's **network egress allowlist** (the
network policy is chosen when the Claude Code web environment is created;
https://code.claude.com/docs/en/claude-code-on-the-web). The key must be supplied
via the `APIFOOTBALL_KEY` env var — never committed to the repo.
