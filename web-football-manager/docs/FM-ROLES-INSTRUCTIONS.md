# Player Roles, Duties & Instructions — Research + Design

Research into how Football Manager layers **team instructions**, **player roles &
duties**, and **individual player instructions**, and how we're building the same
hierarchy into our engine.

## How FM structures it (research)

FM tactics are three nested layers:

1. **Team instructions** — the side-wide settings: mentality, tempo, directness,
   pressing/line of engagement, defensive line height, width, and **marking**.
   Marking has two schemes:
   - **Zonal** — players hold the shape/spacing of the formation and defend
     space; they pick up whoever enters their zone.
   - **Man-marking** — players track assigned opponents around the pitch, giving
     more cover but being pulled out of position. *Rule of thumb FM players use:*
     defenders/defensive variants lean man, attackers/attacking variants lean
     zonal. **Tighter marking** closes the gap to the marked man (less space, but
     easier to be turned/lost).
2. **Player roles & duties** — each position is given a *role* (what kind of
   player he is) and a *duty* (how far he gets forward / how he balances
   attack & defence): Defend / Support / Attack, plus role-specific variants.
   Examples: Ball-Playing Defender, Full-Back (D/S/A), Complete Wing-Back,
   Defensive Midfielder, Deep-Lying Playmaker, Box-to-Box, Mezzala, Winger,
   Inverted Winger, Advanced Forward, Target Man, Poacher, False Nine.
3. **Individual player instructions** — per-player tweaks on top of the role:
   e.g. **Mark Specific Player**, **Mark Specific Position**, **Mark Tighter**,
   plus shooting/dribbling/passing/positioning PIs. *Mark Specific Player* tells
   one player (often a DM) to follow a key opponent around to nullify him.

Sources:
- [Man Marking vs Zonal — SI Community](https://community.sports-interactive.com/forums/topic/224220-man-marking-versus-zonal-marking/)
- [FM player roles guide — FM Scout](https://www.fmscout.com/a-guide-to-player-roles-in-football-manager.html)
- [Every player role in FM explained — FourFourTwo](https://www.fourfourtwo.com/features/football-manager-2024-every-player-role-in-fm24-explained)
- [Mark specific player / position — SI Community](https://community.sports-interactive.com/forums/topic/571094-what-are-the-limits-of-the-player-instructions-mark-specific-player-and-mark-specific-position/)
- [Player instructions — Guide to FM](https://www.guidetofm.com/tactics/player-instructions/)

## What we've implemented now

### Team instruction: marking (zonal vs man) ✅
- `TeamTactics.marking: "zonal" | "man"`, set per style preset (catenaccio,
  counter, direct-counter default to **man**; the rest **zonal**) and overridable
  in the UI with a per-side **Marking** dropdown.
- **Zonal**: the back line holds its ball-relative shape (the existing block).
- **Man**: the nearest free centre-back picks up the most dangerous central
  runner and sits goal-side, tracking him (denies the free through-ball; can be
  pulled out of position, opening space for others — the real trade-off).

*Measured:* a man-marking deep block (catenaccio) suppresses the game to ~23
shots vs ~40 for an open zonal game.

### Individual instruction: man-marking ✅
- `PlayerDef.instructions: { mark?: string; tightMark?: boolean }`.
- `mark` is either an **opponent's name** (fixed man-mark) or a **Role**
  (mark the nearest opponent in that position). `tightMark` sits especially
  tight (~1.6m vs ~3m).
- Resolved live each tick (`resolveMark`), so a positional mark always tracks the
  current man. Works regardless of the team scheme.
- *Demo in data:* Rodri man-marks Szoboszlai; Mac Allister tight-marks De Bruyne.
  *Verified:* Mac Allister averages ~9m closer to De Bruyne than an
  un-instructed midfielder does.

### Tighter marking
- Applied via `tightMark` on individual instructions; the team-level "tighter
  marking" toggle is a natural next addition to `TeamTactics`.

## Roles & duties layer ✅ (implemented)

### Duty (defend / support / attack)
- `PlayerDef.duty: "defend" | "support" | "attack"`, defaulting sensibly by
  position (GK/CB defend, FB/DM/CM support, wide/AM/ST attack) and overridable
  per player in the data.
- Wired into `assignMovement`: attack duty raises the ball-relative push
  (`dutyPush`) and, for **deeper** players, adds a static forward nudge
  (`dutyAdvance`) so a wing-back overlaps and a box-to-box mid joins the line;
  defend duty holds station and sits deeper. Forwards are excluded from the
  static nudge so they don't camp offside.
- *Demo in data:* Alexander-Arnold & Robertson on **attack** (overlapping
  wing-backs); Rodri, Mac Allister, Rice, Tchouaméni on **defend** (holding);
  De Bruyne, Valverde, Bellingham on **attack** (box-to-box / advanced).

### Derived role names
- `roleLabel(role, duty, traits)` names the combination for the UI — Wing-Back,
  Ball-Playing Defender, Deep-Lying Playmaker, Box-to-Box, Mezzala, Inverted
  Winger, Poacher, Complete Forward, etc. Shown on hover in the ratings panel
  (e.g. "Inverted Winger · attack"). The *behaviour* comes from duty + traits;
  the label just names it.

> Traits remain the low-level primitives; named roles are the composition of
> position + duty + traits. A future step is an explicit named-role picker that
> sets duty + traits in one click, plus role-specific behaviours (target-man
> hold-up, false-nine dropping).

## Marking quick-reference (current build)

| Layer | Setting | Effect |
|---|---|---|
| Team | Marking: Zonal | Hold shape, defend space |
| Team | Marking: Man | CBs track the most dangerous central runner goal-side |
| Player | `mark: "<Name>"` | Man-mark that specific opponent |
| Player | `mark: "<Role>"` | Man-mark the nearest opponent in that position |
| Player | `tightMark: true` | Sit especially tight (less space conceded) |
