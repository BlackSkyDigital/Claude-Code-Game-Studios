# Web Football Manager

A **private, web-based football management game** for a small group of friends —
real teams, an old-school **2D aerial match view**, and (planned) **async
3-player online** seasons.

> ⚠️ **Private project.** Real player names are used as factual data and
> attributes are rough, hand-tuned gameplay estimates. Do **not** host this
> publicly with real club crests/kits or monetise it.

This folder is fully self-contained and has **no dependencies** — it can be
lifted straight into its own standalone repository at any time.

---

## Status — Increment 1: the 2D match engine ✅

The riskiest, most important piece is built and verified first: a deterministic,
seeded **match simulation** that produces continuous player/ball positions,
rendered as a top-down 2D pitch with live commentary.

Over 200 simulated matches (Man City vs Liverpool) the engine produces
**realistic football**:

| Metric | This engine | Real-world (EPL) |
|---|---|---|
| Goals / match | ~3.1 | ~2.8 |
| Shots / match | ~27 | ~25 |
| Conversion | ~12% | ~10% |
| Common scorelines | 1-0, 1-1, 2-1, 2-2, 0-1, 2-0 | the same |

## How to run

No install step is needed (zero dependencies — just TypeScript and Python for a
static server, both already standard).

```bash
npm run build      # compile TypeScript -> dist/
npm run serve      # serve on http://localhost:8080
# open http://localhost:8080 in a browser
```

Other scripts:

```bash
npm run watch      # recompile on change
npm run simtest    # headless: simulate 200 matches and print the score distribution
```

In the browser you can pick the two teams, set a **seed** (the same seed always
replays the exact same match — proof of determinism), and control play /
pause / speed.

## Project structure

```
web-football-manager/
├── index.html              # the 2D match viewer (UI shell)
├── src/
│   ├── engine/             # pure, dependency-free, deterministic simulation
│   │   ├── rng.ts          # seeded PRNG (mulberry32) — no Math.random in the engine
│   │   ├── types.ts        # pitch dims, attributes, event taxonomy
│   │   ├── formations.ts   # formation shapes (4-3-3, 4-4-2)
│   │   ├── data.ts         # seed dataset of real teams/players
│   │   ├── match.ts        # the match simulation (movement, passing, shots, saves)
│   │   └── simtest.ts      # headless verification harness
│   └── web/
│       └── main.ts         # Canvas 2D renderer + HUD + commentary
└── dist/                   # build output (gitignored)
```

## How the match engine works

- The whole match is driven from **one seeded RNG**, so a given (home, away,
  seed) always produces an identical match on every machine. This is deliberate:
  in the planned online mode the authoritative server and all clients can
  re-simulate the same match and agree on the result with no desync.
- The pitch is a continuous **105 m × 68 m** space simulated at 10 ticks/second.
  Players move toward tactical target positions; the ball-carrier decides each
  ~0.5 s whether to **shoot, pass, or dribble** based on range, pressure, and
  attributes.
- **Shots, passes and clearances** become loose balls that any player can
  intercept, control, or (for the keeper) save — interceptions and saves emerge
  from geometry plus skill-based probability rather than being scripted.
- The same simulation emits an **event stream** (goals, saves, shots off,
  interceptions, half/full time) used for commentary — an idea borrowed from
  OpenFootManager's event-driven model, but layered on top of a continuous 2D
  simulation so we get the aerial view too.

## Design decisions

- **Our own engine, TypeScript end-to-end.** We evaluated
  [OpenFootManager](https://github.com/openfootmanager/openfootmanager) (GPLv3,
  Rust + Tauri **desktop**, **text-only** engine, **no multiplayer**). It's a
  great design reference but a poor foundation here: it lacks the 2D view and
  the online play that are this project's whole point, and its copyleft licence
  would constrain ours. We use it for inspiration only.
- **Server-authoritative is the target.** The engine is intentionally pure and
  deterministic so it can run unchanged on a future Node backend that owns the
  shared save.

## Roadmap

- [x] **Increment 1** — deterministic 2D match engine + aerial renderer (this)
- [ ] **Increment 2** — tactics input (formation/mentality) feeding the engine
- [ ] **Increment 3** — league/season model: fixtures, table, AI-managed clubs
- [ ] **Increment 4** — management screens (squad, transfers) over a real dataset
- [ ] **Increment 5** — Node + WebSocket backend, Postgres save, **async
      3-player online** ("advance the week when all 3 are ready")
- [ ] **Increment 6** — auth for the 3 friends, deploy (Fly.io / Railway)
