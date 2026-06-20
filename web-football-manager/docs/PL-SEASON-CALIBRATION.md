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

## Known limitation (documented, not yet solved)

**Golden boot is too high (~39 vs real ~28), and midfielders score too rarely
(~3% vs real ~20%).** The engine concentrates goals on the top one or two
front-line players: it always funnels the best chance to the best-placed attacker,
and central midfielders rarely arrive in—or are found in—the box. The *total*
goals/game is realistic, so the same goals pile onto fewer players, inflating the
top-scorer tallies. Levers tried without success (each re-verified over 3 seasons):
reducing the focal-striker bias, the in-box shot multiplier, the clear-chance
floors, the through-ball "spring", and compressing elite finishing accuracy — all
either failed to move it or cost league scoring. A real fix needs **midfield goal
participation** (late runs that actually receive and finish, plus more long-range
midfield shooting) so goals spread across ~15-18 scorers per team as in reality.
Tracked as the next structural improvement.

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
