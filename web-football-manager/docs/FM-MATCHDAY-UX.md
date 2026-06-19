# Football Manager Match-Day UX — Full Analysis (for replication)

How FM presents and controls a match: the speed/highlight system, replays,
the screen layout and panels, and in-match management. Each section ends with
**how we replicate it** and where we stand today.

Sources: [FM24 Touch/Console — Playing A Match](https://community.sports-interactive.com/sigames-manual/football-manager-2024-touch-and-console/playing-a-match-r4990/),
[FM26 Mobile — Match Day](https://community.sports-interactive.com/sigames-manual/football-manager-mobile-2026/match-day-r5263/),
[FM26 Match Day blog (broadcast/dynamic)](https://www.footballmanagerblog.org/2025/09/fm26-match-day-experience-broadcast-mode-dynamic-highlights.html),
[How to change highlight speed (GGRecon)](https://www.ggrecon.com/guides/football-manager-2024-change-highlights/),
[Touchline Shouts (Passion4FM)](https://www.passion4fm.com/how-to-use-touchline-shouts-in-football-manager/),
[Shouts in FM26 (Operation Sports)](https://www.operationsports.com/understanding-shouts-in-fm26-and-how-they-affect-your-team/).

---

## 1. The match-day loop (mental model)

The match engine **simulates the entire 90+ minutes deterministically**. The UI
is a *player* over that timeline: it decides which slices to show (highlights),
how fast to play them, and lets you intervene (tactics/subs) at any pause. So
there are two clocks:

- **Match time** — the simulated 0–90'+, always advancing.
- **Wall-clock playback** — how fast match time maps to real seconds, which
  differs between "showing a highlight" and "nothing to show."

Everything below hangs off that model.

---

## 2. Speed & highlights — THREE independent controls

This is the key thing the genre gets right and that we'd conflated. FM exposes
**three separate settings** (per the match settings panel):

1. **Highlight saturation (what to show)** — the dropdown:
   *None → Goals → Key → Extended → Comprehensive → Full Match*, plus
   *Commentary Only*, and FM26's *Dynamic* (adapts to game intensity).
   This decides which passages are *content*.
2. **Match speed during highlights (how fast to play a highlight)** — a slider;
   left = slower/cinematic, right = faster. Independent of saturation — you can
   watch Key Highlights slowly or Full Match fast.
3. **Speed when there's no action (how fast the clock skips)** — a separate
   slider controlling how quickly match time advances *between* highlights
   (the "fast-forward" rate). Left = crawl, right = snap to the next highlight.

Plus toggles:
- **Replays on/off** — whether to auto-show a replay of goals/big chances.
- (FM26) **Dynamic highlights** — more highlights when the game heats up.

> **How we replicate / where we are:** We have #1 (highlight modes) and a single
> "speed within highlights" (#2). We do **not** yet separate #3 (no-action skip
> speed) — it's hard-coded at ~48×. And we have **no replays toggle**. *Plan:
> add a distinct "skip speed" control and a replays toggle.*

---

## 3. Playback controls

- **Continue / Space** — the universal "advance" button: progresses to the next
  highlight (or to the next decision point / final whistle).
- **Play / Pause** — freeze the action; the pitch holds so you can study shape.
- **Skip to next highlight** — jump forward.
- **Replay** — re-watch the last highlight/goal; some editions allow
  **rewind / frame-step** and changing camera angle during a replay.
- **Speed up / slow down** — live nudges to the playback speed.

> **How we replicate / where we are:** We have Play/Pause and continuous
> highlight skipping. We lack **Continue-to-next-highlight as a discrete
> action**, **Replay**, and **rewind/frame-step**. Replay needs a **rolling
> buffer of recent simulation snapshots** so the view can re-play the last
> ~8–12 seconds. *Plan: keep a ring buffer of snapshots; add Replay (and
> auto-replay on goals when Replays = on).*

---

## 4. Match screen layout & panels

FM's match screen is a dashboard around the pitch:

- **The pitch view** (2D classic or 3D) with **camera options** (TV, behind
  goal, etc.) and zoom. 2D classic is for reading shape/pressing at a glance.
- **Scoreboard + clock** (top): teams, score, minute, competition, sometimes
  aggregate/penalties.
- **Incident timeline / "match bar"** — a strip along the bottom representing
  0–90', with **markers for goals, chances, cards, subs**; *clickable to jump
  to / replay that moment*. This is central to navigation.
- **Match Stats panel** — possession, shots / on target, set-pieces, fouls,
  corners, **xG**, etc.
- **Player Stats (Home/Away)** — per-player live stats: passes completed,
  tackles won, distance, **average rating**, etc.
- **Touchline Tablet / The Dugout** — customisable analysis shown on the
  *highlight transition screen*; the Dugout's **"Show Me"/"Ask For"** gets
  assistant info and advice.
- **Commentary** — text describing the action (we have this).

> **How we replicate / where we are:** We have the pitch, scoreboard/clock,
> a Match Stats panel, and a commentary bar. We lack the **clickable incident
> timeline**, **per-player live stats & ratings**, **camera options**, and the
> **dugout/assistant** info. *Plan (watch-experience priority): incident
> timeline bar → player ratings/stats → (later) camera + dugout.*

---

## 5. In-match management UX

The reason matches are interactive, not just watched. Along the screen edges:

- **Tactical quick-changes (bottom-left):** shape, style, **mentality**,
  team instructions; **"Full Tactics"** opens the complete tactics screen.
- **Player bar (bottom):** every player on the pitch — click to change
  **position/role/instructions**, shout to them, or **substitute**.
- **Touchline shouts:** motivational directives (Encourage, Demand More,
  Praise, Berate, Focus, Calm Down…) that shift player mentality/morale — must
  fit the context to land well.
- **Opposition instructions:** how to treat specific opponents (close down,
  show onto weaker foot, tight-mark).
- **Substitutions:** up to the allowed number, with warm-up/condition cues.
- **Dugout assistant:** on-demand advice and "show me" data.

> **How we replicate / where we are:** None yet — our match is watch-only with
> tactics fixed pre-match. This is its own large milestone. *Plan: a later
> "in-match management" phase — change tactical style/mentality live, make subs,
> and a small set of shouts that nudge the condition/sharpness model we already
> have.*

---

## 6. Replays & post-match analysis

- **Goal/chance replays** during the match (toggleable, with replay speed).
- **Analysis overlays:** xG timeline, passing networks, heat maps, average
  position maps, pass/shot maps.
- **Match report:** final stats, player ratings, talking points, highlights
  reel.

> **How we replicate / where we are:** We have live aggregate stats only.
> *Plan: xG (we can compute per-shot xG from distance/angle — the engine
> already has these at shoot time), an incident/xG timeline, and a simple
> match-report screen at full time.*

---

## 7. Gap table — FM vs us

| Area | FM | Us today | Priority to add |
|---|---|---|---|
| Highlight saturation | None…Full, Commentary, Dynamic | ✅ 6 modes | — |
| Speed *during* highlights | slider | ✅ 4 presets | — |
| Speed *between* highlights (skip) | separate slider | ❌ fixed 48× | **High (easy)** |
| Replays toggle + replay | ✅ | ❌ | **High** |
| Rewind / frame-step | ✅ (some) | ❌ | Medium |
| Continue-to-next-highlight | ✅ | partial (auto) | Medium (easy) |
| Incident timeline (clickable) | ✅ | ❌ | **High** |
| Match stats panel | ✅ rich (+xG) | ✅ basic | Medium (add xG) |
| Per-player ratings/stats | ✅ | ❌ | **High** |
| Camera options | ✅ | ❌ (fixed 2D) | Low |
| In-match tactics/subs/shouts | ✅ | ❌ | Large milestone |
| Post-match report | ✅ | ❌ | Medium |

---

## 8. Replication plan (watch-experience first)

Ordered for impact on "feels like FM to watch", reusing what we have:

- **Phase 1 — Speed model & replays.**
  Split playback into *highlight speed* (have) + *skip speed* (new slider), add
  a **Replays toggle**, and add **goal/chance replay** via a rolling snapshot
  buffer (re-render the last ~10s). Auto-replay goals when enabled.
- **Phase 2 — Incident timeline + ratings.**
  A clickable 0–90' bar with markers (goal/chance/save/card) that **jumps to a
  replay** of that moment; plus **per-player live ratings** (derive from a
  simple model: goals/assists/shots/tackles/passes/duels), shown on a team
  sheet, feeding a basic **match report** at full time.
- **Phase 3 — xG & analysis.**
  Compute **per-shot xG** (distance × angle × one-on-one, already available at
  `shoot`), show a running xG total and an **xG/shot timeline**; optional
  shot map.
- **Phase 4 — In-match management.**
  Live **tactical style/mentality** changes, **substitutions**, and a small
  set of **touchline shouts** that nudge the existing condition/sharpness
  model. (Pairs with the engine's player-roles work, review doc Phase C.)
- **Phase 5 — Polish.**
  Continue-to-next-highlight button, camera/zoom, dynamic highlights
  (more when intensity is high), saved highlights.

Every phase keeps the deterministic engine untouched (the UI is a player over
the same timeline) and is verified with the headless harness where it affects
the sim.
