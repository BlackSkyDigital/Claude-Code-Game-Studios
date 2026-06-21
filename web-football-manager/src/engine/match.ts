import { RNG } from "./rng.js";
import { mirror, resolveFormation, type Slot } from "./formations.js";
import {
  GOAL_Y_MAX,
  GOAL_Y_MIN,
  PITCH_LENGTH,
  PITCH_WIDTH,
  type Attrs,
  type MatchEvent,
  type MatchEventType,
  type Duty,
  type PlayerDef,
  type PlayerInstructions,
  type Role,
  type TeamDef,
  type Trait,
  type Vec,
} from "./types.js";
import { tacticsForStyle, type TeamTactics } from "./tactics.js";
import {
  homeEdge,
  weatherMods,
  type HomeEdge,
  type Weather,
  type WeatherMods,
} from "./conditions.js";

/** Optional pre-match setup: tactics per side, weather, neutral venue. */
export interface MatchSetup {
  homeTactics?: TeamTactics;
  awayTactics?: TeamTactics;
  /** override the home/away shape: a built-in name OR a custom Slot[] (user
   * design). Falls back to the TeamDef.formation if omitted. */
  homeFormation?: string | Slot[];
  awayFormation?: string | Slot[];
  weather?: Weather;
  neutral?: boolean;
  /** match context — global "laws" that modulate the same decision rules
   * (sharpness, aggression, tempo) the way the real game does. All default to
   * neutral, so omitting this reproduces the calibrated baseline exactly. */
  context?: MatchContext;
}

/** Context that adjusts the whole match coherently, like real football. Each is
 * a small global modifier on the universal decision rules — not special-case
 * code — so the same engine "scales" with the occasion. */
export interface MatchContext {
  /** derby / rivalry intensity 0..1 — scrappier, more fouls & cards, louder crowd */
  rivalry?: number;
  /** stakes 0 dead-rubber .. 0.5 normal league .. 1 cup final / title decider —
   * cagier, more nervous, bigger crowd */
  importance?: number;
  /** pre-match form & confidence per side, -1 wretched .. +1 flying */
  homeMorale?: number;
  awayMorale?: number;
}

const DT = 0.1; // simulation seconds per step
const GRAVITY = 9.8; // m/s² — the physics layer's one constant for vertical motion
const CROSSBAR = 2.44; // height of the goal frame (m) — shots above this go over
const HALF_SECONDS = 45 * 60;
const FULL_SECONDS = 90 * 60;
const CENTER: Vec = { x: PITCH_LENGTH / 2, y: PITCH_WIDTH / 2 };

/** Pass types — chosen to fit the situation and the player's skills. */
export type PassType = "feet" | "driven" | "through" | "lofted" | "chip";
/** Shot types — placed/finesse, power, chip over the keeper, or a header. */
export type ShotType = "placed" | "power" | "chip" | "header";

interface Player {
  id: number;
  team: 0 | 1;
  name: string;
  number: number;
  role: Role;
  attrs: Attrs;
  color: string;
  textColor: string;
  pos: Vec;
  base: Vec; // formation anchor in real pitch coordinates
  target: Vec; // where the player wants to be this step
  baseSpeed: number; // m/s at full fitness (from pace + acceleration)
  condition: number; // 0..1 current fitness; drops with fatigue
  decisionTimer: number; // per-player cadence between on-ball decisions
  assistFrom: Player | null; // teammate who last fed this player (for assists)
  traits: Set<Trait>; // preferred player moves that bias decisions
  dribbleTimer: number; // >0 just after beating a man: a burst of pace & control
  injured: boolean; // carrying a knock — slower, more error-prone
  yellow: boolean; // has been booked (a second booking is a red)
  starter: boolean; // started the match (vs came off the bench)
  markName: string | null; // individual instruction: opponent name or Role to man-mark
  tightMark: boolean; // stick especially tight to the marked man
  instr: PlayerInstructions; // the full per-player instruction set (roam/shoot/cross/…)
  duty: Duty; // defend / support / attack — how far he commits forward
  roleName: string; // derived tactical role label for the UI (e.g. "Inverted Winger")
  stat: PlayerStat;
}

interface PlayerStat {
  passA: number;
  passC: number;
  shots: number;
  sot: number;
  goals: number;
  assists: number;
  keyPasses: number;
  tackles: number;
  saves: number;
  blocks: number;
}

interface Ball {
  pos: Vec;
  vel: Vec;
  owner: Player | null;
  lastTeam: 0 | 1 | null; // team that last touched it (for interceptions/credit)
  shooter: Player | null; // set while a shot is in flight
  receiver: Player | null; // intended target of an in-flight pass (runs onto it)
  passer: Player | null; // who played the in-flight pass/cross (for assists/stats)
  isShot: boolean;
  shotType: ShotType | null; // type of the in-flight shot
  passType: PassType | null; // type of the in-flight pass
  fromCross: boolean; // ball delivered as a cross — an attacker in the box finishes first-time
  cutback: boolean; // low pull-back to the top of the box — receiver shoots first-time
  airTimer: number; // seconds the ball is airborne (lofted/chip pass beats the ground press)
  z: number; // real ball height above the turf (m) — physics layer
  vz: number; // vertical velocity (m/s) — gravity acts on this
  aimY: number; // projected crossing point of the current shot (for on-target)
  aimZ: number; // projected height at the goal line (for over-the-bar)
  judged: boolean; // whether the current shot has already been adjudicated
  cooldown: number; // seconds during which the ball cannot be controlled
  offsideFlag: 0 | 1 | null; // team flagged offside on the in-flight pass, if any
  chance: ChanceType; // how the current shot's chance was created (for review/diagnostics)
  deflected: boolean; // the in-flight shot took a deflection (wrong-foots the keeper)
}

/** How a shot's chance arose — used for the goal-source review (are goals mixed?). */
export type ChanceType =
  | "open" | "through" | "cross" | "cutback" | "solo" | "setpiece"
  | "penalty" | "rebound" | "deflected" | "owngoal";

/** Rendering snapshot — everything the view needs, nothing it doesn't. */
export interface Snapshot {
  time: number;
  minute: number;
  score: [number, number];
  shots: [number, number];
  shotsOnTarget: [number, number];
  xg: [number, number]; // expected goals
  possession: [number, number]; // percentages, sum ~100
  passAccuracy: [number, number]; // percentages
  fitness: [number, number]; // avg team condition %, falls with fatigue
  finished: boolean;
  homeShort: string;
  awayShort: string;
  homeStyle: string;
  awayStyle: string;
  weather: string;
  ball: Vec;
  /** what the ball is doing right now: dribble / shot / cross / a pass type / loose */
  ballMode: string;
  /** role of the player on the ball (null if loose) — lets the view skip keeper recycling */
  ownerRole: Role | null;
  players: {
    x: number;
    y: number;
    number: number;
    name: string;
    team: 0 | 1;
    role: Role;
    color: string;
    textColor: string;
    hasBall: boolean;
    rating: number;
    goals: number;
    assists: number;
    shots: number;
    fitness: number; // individual condition 0–100
    injured: boolean;
    roleName: string; // tactical role label (e.g. "Inverted Winger")
    duty: Duty;
  }[];
  events: MatchEvent[];
}

// ---- small vector helpers ----
function sub(a: Vec, b: Vec): Vec {
  return { x: a.x - b.x, y: a.y - b.y };
}
function len(v: Vec): number {
  return Math.hypot(v.x, v.y);
}
function dist(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function norm(v: Vec): Vec {
  const l = len(v) || 1;
  return { x: v.x / l, y: v.y / l };
}
function clampPitch(v: Vec): Vec {
  return {
    x: Math.max(0, Math.min(PITCH_LENGTH, v.x)),
    y: Math.max(0, Math.min(PITCH_WIDTH, v.y)),
  };
}
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
/** Distance from point p to the segment a->b (used for interceptions). */
function segDist(p: Vec, a: Vec, b: Vec): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const l2 = abx * abx + aby * aby;
  if (l2 === 0) return dist(p, a);
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / l2;
  t = Math.max(0, Math.min(1, t));
  return dist(p, { x: a.x + t * abx, y: a.y + t * aby });
}

/** Sensible default duty for a position when none is specified in the data. */
function defaultDuty(role: Role): Duty {
  switch (role) {
    case "GK":
    case "DC":
      return "defend";
    case "DL":
    case "DR":
    case "DM":
    case "MC":
      return "support";
    case "ML":
    case "MR":
    case "AM":
    case "ST":
      return "attack";
  }
}

/** Derive a human tactical-role label from position, duty and traits (FM-style
 * names), for display. The behaviour comes from duty + traits; this just names
 * the combination. */
function roleLabel(role: Role, duty: Duty, traits: Set<Trait>): string {
  switch (role) {
    case "GK":
      return "Goalkeeper";
    case "DC":
      return traits.has("gets_forward") ? "Ball-Playing Defender" : "Central Defender";
    case "DL":
    case "DR":
      return duty === "attack" || traits.has("gets_forward") ? "Wing-Back" : "Full-Back";
    case "DM":
      return traits.has("tries_killer_balls") ? "Deep-Lying Playmaker" : "Defensive Midfielder";
    case "MC":
      if (traits.has("tries_killer_balls")) return "Advanced Playmaker";
      if (traits.has("gets_forward") || duty === "attack") return "Box-to-Box Midfielder";
      if (traits.has("shoots_from_distance")) return "Mezzala";
      return "Central Midfielder";
    case "ML":
    case "MR":
      return traits.has("cuts_inside") ? "Inverted Winger" : "Winger";
    case "AM":
      return traits.has("tries_killer_balls") ? "Advanced Playmaker" : "Attacking Midfielder";
    case "ST":
      if (traits.has("runs_in_behind") && traits.has("places_shots")) return "Complete Forward";
      if (traits.has("runs_in_behind")) return "Poacher";
      return "Advanced Forward";
  }
}

export class Match {
  readonly home: TeamDef;
  readonly away: TeamDef;
  private rng: RNG;
  private crng: RNG; // separate RNG for commentary text — never perturbs the sim
  private players: Player[] = [];
  private ball: Ball;
  private startedSecondHalf = false;
  private buildupTimer = 0;
  private celebrateTimer = 0; // brief hold after a goal so it's seen before kick-off
  private pendingKickoff: 0 | 1 = 0;
  private celebrateScorer: Player | null = null; // who scored (for the celebration)
  /** Diagnostic counters (pass/shot type mix) — used by the headless harness. */
  passTypeCounts: Record<PassType, number> = { feet: 0, driven: 0, through: 0, lofted: 0, chip: 0 };
  shotTypeCounts: Record<ShotType, number> = { placed: 0, power: 0, chip: 0, header: 0 };
  crossCount = 0;
  takeOnAtt = 0; // 1v1 take-ons attempted
  takeOnWon = 0; // take-ons that beat the man
  cornerCount = 0;
  penaltyCount = 0;
  offsideCount = 0;
  foulCount = 0;
  yellowCards = 0;
  redCards = 0;
  subsMade = 0;
  shotDist: number[] = []; // diagnostic: distance-to-goal of each shot
  shotSideByTeam: [number[], number[]] = [[], []]; // y-offset (+=right of centre) of each shot, by team
  /** review diagnostics: how goals are created, and shot outcomes. */
  goalsByChance: Record<ChanceType, number> = { open: 0, through: 0, cross: 0, cutback: 0, solo: 0, setpiece: 0, penalty: 0, rebound: 0, deflected: 0, owngoal: 0 };
  goalsByShot: Record<ShotType, number> = { placed: 0, power: 0, chip: 0, header: 0 };
  shotOutcomes = { goal: 0, saved: 0, blocked: 0, offtarget: 0, over: 0, woodwork: 0 };
  handballs = 0; freeKicks = 0; deflections = 0; ownGoals = 0;
  private bench: [Player[], Player[]] = [[], []];
  private subsUsed: [number, number] = [0, 0];
  private static MAX_SUBS = 5;
  private subScanTimer = 0;
  /** transition tracking: which team most recently WON the ball, and when — used
   * by counter-press (the side that just lost it swarms) and counter-attack (the
   * side that just won it breaks). */
  private winBallTeam: 0 | 1 | null = null;
  private winBallTime = -99;
  private tactics: [TeamTactics, TeamTactics];
  private fmOverride: [string | Slot[] | undefined, string | Slot[] | undefined] = [undefined, undefined];
  private weather: Weather;
  private wx: WeatherMods;
  private edge: HomeEdge;
  // ---- match context (global "laws" that scale the same decision rules) ----
  private rivalry = 0; // 0..1 derby intensity
  private atmosphere = 0; // crowd intensity (from rivalry + importance) — lifts home, unsettles away
  private importance = 0.5; // 0..1 stakes
  private ctxMorale: [number, number] = [0, 0]; // pre-match form/confidence per side
  /** dynamic in-match momentum per side, -1..1 — swings on goals & big moments,
   * decays over time; a side "on top" plays sharper. */
  momentum: [number, number] = [0, 0];

  time = 0;
  score: [number, number] = [0, 0];
  shots: [number, number] = [0, 0];
  shotsOnTarget: [number, number] = [0, 0];
  xg: [number, number] = [0, 0];
  possessionTicks: [number, number] = [0, 0];
  passesAtt: [number, number] = [0, 0];
  passesComp: [number, number] = [0, 0];
  events: MatchEvent[] = [];
  finished = false;

  constructor(home: TeamDef, away: TeamDef, seed = 1, setup: MatchSetup = {}) {
    this.home = home;
    this.away = away;
    this.rng = new RNG(seed);
    this.crng = new RNG((seed ^ 0x9e3779b9) >>> 0);
    this.tactics = [
      setup.homeTactics ?? tacticsForStyle("balanced"),
      setup.awayTactics ?? tacticsForStyle("balanced"),
    ];
    this.fmOverride = [setup.homeFormation, setup.awayFormation];
    this.weather = setup.weather ?? "clear";
    this.wx = weatherMods(this.weather);
    this.edge = homeEdge(setup.neutral ?? false);
    const ctx = setup.context ?? {};
    this.rivalry = clamp(ctx.rivalry ?? 0, 0, 1);
    this.importance = clamp(ctx.importance ?? 0.5, 0, 1);
    this.ctxMorale = [clamp(ctx.homeMorale ?? 0, -1, 1), clamp(ctx.awayMorale ?? 0, -1, 1)];
    // a normal league game (importance 0.5, no rivalry) has neutral atmosphere;
    // derbies and big occasions crank it up.
    this.atmosphere = clamp(this.rivalry * 0.6 + Math.max(0, this.importance - 0.5) * 1.2, 0, 1);
    this.setupPlayers();
    this.ball = {
      pos: { ...CENTER },
      vel: { x: 0, y: 0 },
      owner: null,
      lastTeam: null,
      shooter: null,
      receiver: null,
      passer: null,
      isShot: false,
      shotType: null,
      passType: null,
      fromCross: false,
      cutback: false,
      airTimer: 0,
      z: 0,
      vz: 0,
      aimY: 34,
      aimZ: 0,
      judged: false,
      cooldown: 0,
      offsideFlag: null,
      chance: "open",
      deflected: false,
    };
    this.kickoff(0, true);
  }

  // ---- setup ----

  private setupPlayers(): void {
    let id = 0;
    const mk = (pd: PlayerDef, teamIdx: 0 | 1, base: Vec, startCond: number, starter: boolean, role: Role = pd.role): Player => {
      const a = pd.attrs;
      return {
        id: id++,
        team: teamIdx,
        name: pd.name,
        number: pd.number,
        role,
        attrs: a,
        color: teamIdx === 0 ? this.home.color : this.away.color,
        textColor: teamIdx === 0 ? this.home.textColor : this.away.textColor,
        pos: { ...base },
        base,
        target: { ...base },
        baseSpeed: 4.6 + ((a.pace + a.acceleration) / 2) * 0.19,
        condition: startCond,
        decisionTimer: 0,
        assistFrom: null,
        traits: new Set(pd.traits ?? []),
        dribbleTimer: 0,
        injured: false,
        yellow: false,
        starter,
        markName: pd.instructions?.mark ?? null,
        tightMark: pd.instructions?.tightMark ?? false,
        instr: pd.instructions ?? {},
        duty: pd.duty ?? defaultDuty(role),
        roleName: roleLabel(role, pd.duty ?? defaultDuty(role), new Set(pd.traits ?? [])),
        stat: { passA: 0, passC: 0, shots: 0, sot: 0, goals: 0, assists: 0, keyPasses: 0, tackles: 0, saves: 0, blocks: 0 },
      };
    };
    for (const teamIdx of [0, 1] as const) {
      const def = teamIdx === 0 ? this.home : this.away;
      const slots: Slot[] = resolveFormation(this.fmOverride[teamIdx], def.formation);
      // away side starts marginally more fatigued from travel (home advantage)
      const startCond = teamIdx === 0 ? 1.0 : 1.0 - this.edge.awayTravelPenalty;
      def.players.forEach((pd, i) => {
        const slot = slots[i]!;
        const base = teamIdx === 0 ? { ...slot.pos } : mirror(slot.pos);
        // the formation slot defines the role the player fills (so changing
        // formation genuinely changes how the side lines up and behaves)
        this.players.push(mk(pd, teamIdx, base, startCond, true, slot.role));
      });
      // build the bench (kept off the pitch until brought on)
      for (const pd of def.bench ?? []) {
        this.bench[teamIdx].push(mk(pd, teamIdx, { ...CENTER }, startCond, false));
      }
    }
  }

  private oppGoal(team: 0 | 1): Vec {
    return { x: team === 0 ? PITCH_LENGTH : 0, y: PITCH_WIDTH / 2 };
  }

  // ---- condition / tactics helpers ----

  private tac(team: 0 | 1): TeamTactics {
    return this.tactics[team];
  }

  /** Record that `team` has the ball; if this is a CHANGE of possession, stamp
   * the time so the transition window (counter-press / counter-attack) opens. */
  private notePossession(team: 0 | 1): void {
    if (this.winBallTeam !== team) {
      this.winBallTeam = team;
      this.winBallTime = this.time;
    }
  }

  /** Seconds since `team` won the ball, while it still holds it (else huge). */
  private sinceWon(team: 0 | 1): number {
    return this.winBallTeam === team ? this.time - this.winBallTime : 1e9;
  }

  // ---- live control API (the UI manages tactics during the match) ----

  /** Replace a side's team instructions live (sliders/preset change). The engine
   * reads `tac(team)` every tick, so the change takes effect immediately. */
  setTactics(team: 0 | 1, tactics: TeamTactics): void {
    this.tactics[team] = tactics;
  }

  /** Read the current team instructions (so the UI can show live values). */
  getTactics(team: 0 | 1): TeamTactics {
    return this.tactics[team];
  }

  private findPlayer(team: 0 | 1, ident: string | number): Player | undefined {
    return this.players.find(
      (p) => p.team === team && (p.number === ident || p.name === ident),
    );
  }

  /** Update one player's instructions live (by shirt number or name). */
  setPlayerInstruction(team: 0 | 1, ident: string | number, patch: PlayerInstructions): void {
    const p = this.findPlayer(team, ident);
    if (!p) return;
    p.instr = { ...p.instr, ...patch };
    p.markName = p.instr.mark ?? null;
    p.tightMark = p.instr.tightMark ?? false;
    p.roleName = roleLabel(p.role, p.duty, p.traits);
  }

  /** Change a player's duty (defend/support/attack) live. */
  setDuty(team: 0 | 1, ident: string | number, duty: Duty): void {
    const p = this.findPlayer(team, ident);
    if (!p) return;
    p.duty = duty;
    p.roleName = roleLabel(p.role, duty, p.traits);
  }

  /** Re-shape a side live (built-in name or custom Slot[]). Reassigns each
   * on-pitch player's resting position and role to the new shape, in order. */
  setFormation(team: 0 | 1, spec: string | Slot[]): void {
    const fallback = (team === 0 ? this.home : this.away).formation;
    const slots = resolveFormation(spec, fallback);
    const onPitch = this.players.filter((p) => p.team === team);
    for (let i = 0; i < onPitch.length && i < slots.length; i++) {
      const p = onPitch[i]!;
      const slot = slots[i]!;
      const base = team === 0 ? { ...slot.pos } : mirror(slot.pos);
      p.base = base;
      p.role = slot.role;
      p.duty = p.instr ? p.duty : defaultDuty(slot.role);
      p.roleName = roleLabel(slot.role, p.duty, p.traits);
    }
  }

  /** Current top speed, reduced by fatigue, lifted briefly after beating a man. */
  private effSpeed(p: Player): number {
    const burst = p.dribbleTimer > 0 ? 1.22 : 1;
    return p.baseSpeed * (0.62 + 0.38 * p.condition) * burst;
  }

  /** Execution sharpness 0..~1.1 — the universal execution-quality term. Fatigue
   * lowers it; home advantage, pre-match morale, in-match momentum and the crowd
   * all lift/dent it. Every context "law" feeds this same rule (all neutral by
   * default, so the calibrated baseline is unchanged). */
  private sharp(p: Player): number {
    const homeBoost = p.team === 0 ? this.edge.homeSharpness : 1;
    const morale = 1 + this.ctxMorale[p.team] * 0.06; // ±6% from form/confidence
    const mom = 1 + this.momentum[p.team] * 0.04; // ±4% from in-match momentum
    // a big crowd lifts the home side and unsettles the away side
    const atm = p.team === 0 ? 1 + this.atmosphere * 0.05 : 1 - this.atmosphere * 0.035;
    return (0.7 + 0.3 * p.condition) * homeBoost * morale * mom * atm;
  }

  /** Foul-rate multiplier from context: derbies and high-stakes games are
   * scrappier and more cautious. Neutral (1.0) for a normal, no-rivalry game. */
  private contextFoulMul(): number {
    return 1 + this.rivalry * 0.5 + Math.max(0, this.importance - 0.5) * 0.4;
  }

  /** Effective directness for a team, nudged up by wet weather. */
  private directness(team: 0 | 1): number {
    return clamp(this.tac(team).directness + this.wx.directness, 0, 1);
  }

  /** Drain stamina each tick: harder with high tempo/press and low stamina. */
  private updateFatigue(): void {
    for (const p of this.players) {
      const t = this.tac(p.team);
      const exertion =
        0.5 + 0.5 * t.tempo + 0.5 * t.pressing + p.attrs.workRate / 40;
      const resist = (p.attrs.stamina + p.attrs.naturalFitness) / 2;
      const drain =
        (DT / 60) * 0.002 * exertion * (20 / (resist + 6)) * this.wx.fatigue;
      p.condition = Math.max(0.4, p.condition - drain);
    }
  }

  /** A challenge can leave a player with a knock: he plays on slower and more
   * error-prone (no substitutions yet — that's the in-match management step). */
  private maybeInjure(p: Player, prob: number): void {
    if (p.injured || p.role === "GK") return;
    if (!this.rng.chance(prob)) return;
    p.injured = true;
    p.condition = Math.max(0.4, p.condition - 0.12);
    p.baseSpeed *= 0.88; // carrying a knock — a yard slower
    this.emit("injury", p.team, p.name, this.vary([`${p.name} is hurt and needs treatment...`, `${p.name} picks up a knock but plays on.`, `${p.name} is feeling that one.`]));
  }

  /** A foul: a penalty if it's in the box, otherwise a (quick) free kick to the
   * fouled side. May also bring a card. */
  private commitFoul(fouler: Player, victim: Player): void {
    this.foulCount++;
    // ADVANTAGE: if the fouled player can play on into space in a promising area,
    // the referee waves play on rather than stopping it. It's still a foul on the
    // record (and may still bring a late card), but the move continues.
    const advHalf = victim.team === 0 ? victim.pos.x > 52 : victim.pos.x < 53;
    if (!this.inBoxAttacking(victim) && advHalf && this.spaceAhead(victim) > 6 && this.rng.chance(0.3)) {
      this.maybeCard(fouler, victim, false);
      this.ball.owner = victim;
      this.ball.isShot = false;
      this.ball.shooter = null;
      this.ball.passer = null;
      this.ball.receiver = null;
      this.ball.deflected = false;
      this.ball.chance = "open";
      this.ball.lastTeam = victim.team;
      this.notePossession(victim.team);
      if (this.crng.chance(0.4)) this.emit("foul", fouler.team, fouler.name, this.vary([`Advantage played — ${this.shortName(victim.team)} play on!`, `The ref waves it on — advantage ${this.shortName(victim.team)}.`]));
      return;
    }
    // a foul in the box is a penalty most (not all) of the time — some are
    // adjudged just outside the area or the attacker shields it out
    const pen = this.inBoxAttacking(victim) && this.rng.chance(0.12);
    this.maybeCard(fouler, victim, pen);
    if (pen) {
      this.awardPenalty(victim.team);
      return;
    }
    // a foul in a dangerous attacking area becomes a real set-piece, not just a
    // quick restart: a direct free-kick shot if central & in range, otherwise a
    // whipped cross into the box. Deeper fouls are taken quickly (below).
    const goal = this.oppGoal(victim.team);
    const dG = dist(victim.pos, goal);
    const central = Math.abs(victim.pos.y - 34) < 13;
    const attHalf = victim.team === 0 ? victim.pos.x > 58 : victim.pos.x < 47;
    if (this.crng.chance(0.5)) {
      this.emit("foul", fouler.team, fouler.name, this.vary([`Foul by ${fouler.name}.`, `${fouler.name} gives away a free kick.`, `Free kick — ${fouler.name} caught him late.`]));
    }
    if (dG > 17 && dG < 31 && central && this.rng.chance(0.45)) {
      this.freeKickShot(victim.team, { ...victim.pos });
      return;
    }
    if (attHalf && dG >= 20 && dG < 42 && this.rng.chance(0.32)) {
      this.freeKickCross(victim.team, { ...victim.pos });
      return;
    }
    const b = this.ball;
    b.owner = victim;
    b.pos = { ...victim.pos };
    b.vel = { x: 0, y: 0 };
    b.shooter = null;
    b.receiver = null;
    b.passer = null;
    b.isShot = false;
    b.shotType = null;
    b.passType = null;
    b.fromCross = false;
    b.cutback = false;
    b.airTimer = 0;
    b.judged = false;
    b.offsideFlag = null;
    b.cooldown = 0.3;
    b.deflected = false;
    b.chance = "open";
    b.lastTeam = victim.team;
  }

  /** A direct free kick at goal from a central, dangerous position: a specialist
   * bends it over the wall — low conversion, as in real life. */
  private freeKickShot(team: 0 | 1, pos: Vec): void {
    this.freeKicks++;
    const taker = this.players
      .filter((p) => p.team === team && p.role !== "GK")
      .sort((a, c) => c.attrs.longShots + c.attrs.technique + c.attrs.composure - (a.attrs.longShots + a.attrs.technique + a.attrs.composure))[0];
    if (!taker) return;
    taker.pos = { ...pos };
    this.ball.owner = taker;
    this.ball.pos = { ...pos };
    this.emit("key_pass", team, taker.name, this.vary([`${taker.name} stands over the free kick...`, `Dangerous free kick — ${taker.name} will shoot...`, `${taker.name} eyes the top corner...`]));
    this.shoot(taker, taker.attrs.longShots >= 15 ? "placed" : "power", "setpiece");
  }

  /** A wide/deep attacking free kick whipped into the box for the aerial threats. */
  private freeKickCross(team: 0 | 1, pos: Vec): void {
    this.freeKicks++;
    const taker = this.players
      .filter((p) => p.team === team && p.role !== "GK")
      .sort((a, c) => c.attrs.crossing + c.attrs.technique - (a.attrs.crossing + a.attrs.technique))[0];
    if (!taker) return;
    const boxX = team === 0 ? PITCH_LENGTH - 9 : 9;
    this.players
      .filter((p) => p.team === team && p !== taker && p.role !== "GK")
      .sort((a, c) => c.attrs.heading + c.attrs.jumpingReach - (a.attrs.heading + a.attrs.jumpingReach))
      .slice(0, 4)
      .forEach((p, i) => { p.pos = clampPitch({ x: boxX, y: 28 + i * 4 }); p.target = { ...p.pos }; });
    taker.pos = { ...pos };
    this.ball.owner = taker;
    this.ball.pos = { ...pos };
    this.emit("key_pass", team, taker.name, this.vary([`${taker.name} will whip the free kick in...`, `Free kick swung into the box by ${taker.name}...`]));
    const target = this.bestBoxTarget(taker) ?? this.players.find((p) => p.team === team && p.role !== "GK")!;
    this.cross(taker, target);
    this.ball.chance = "setpiece"; // a header from this is a set-piece goal
  }

  /** A spot kick: taker quality vs the keeper, ~75-80% conversion. */
  private awardPenalty(team: 0 | 1): void {
    this.penaltyCount++;
    const taker = this.players
      .filter((p) => p.team === team && p.role !== "GK")
      .sort((a, c) => c.attrs.finishing + c.attrs.composure + c.attrs.technique - (a.attrs.finishing + a.attrs.composure + a.attrs.technique))[0];
    if (!taker) return;
    const gk = this.players.find((p) => p.team !== team && p.role === "GK");
    this.emit("penalty", team, taker.name, this.vary([`PENALTY to ${this.shortName(team)}! ${taker.name} will take it...`, `It's a spot kick — ${taker.name} steps up...`]));
    taker.stat.shots++;
    this.shots[team]++;
    this.shotDist.push(11);
    taker.assistFrom = null;
    let conv = 0.78 + ((taker.attrs.finishing + taker.attrs.composure) / 2 - 14) / 60;
    if (gk) conv -= (gk.attrs.reflexes - 14) / 120;
    conv = clamp(conv, 0.5, 0.92);
    if (this.rng.chance(conv)) {
      const goal = this.oppGoal(team);
      this.ball.owner = null;
      this.ball.shooter = taker;
      this.ball.isShot = true;
      this.ball.shotType = "placed";
      this.ball.chance = "penalty";
      this.ball.pos = { x: goal.x, y: 34 };
      this.ball.vel = { x: 0, y: 0 };
      this.scoreGoal(team); // handles score, on-target, goal stat, celebration
    } else {
      this.shotsOnTarget[team]++;
      taker.stat.sot++;
      if (gk) gk.stat.saves++;
      this.emit("save", gk ? gk.team : undefined, gk ? gk.name : undefined, this.vary([`SAVED from the spot! Huge moment!`, `The keeper guesses right — penalty saved!`]));
      // a saved penalty is often parried out — a loose rebound to follow up
      if (this.rng.chance(0.35)) this.looseInBox(team);
      else if (gk) this.claim(gk);
    }
  }

  /** Booking logic: cynical/aggressive fouls draw cards; a second yellow or a
   * reckless challenge is a red and the player is sent off. */
  private maybeCard(fouler: Player, victim: Player, isPen: boolean): void {
    const dangerous = this.inFinalThird(victim) || isPen;
    if (dangerous && this.rng.chance(0.0025)) {
      this.sendOff(fouler, true);
      return;
    }
    let yellowP = 0.058 + fouler.attrs.aggression / 200;
    if (dangerous) yellowP += 0.08; // stopping a promising move
    yellowP *= 1 + this.rivalry * 0.5; // derbies are niggly — more bookings
    // a player already on a yellow is booked again far less readily — refs (and
    // the player) are wary of a second — so second-yellow reds stay rare
    if (fouler.yellow) yellowP *= 0.3;
    if (this.rng.chance(yellowP)) {
      if (fouler.yellow) this.sendOff(fouler, false);
      else {
        fouler.yellow = true;
        this.yellowCards++;
        this.emit("foul", fouler.team, fouler.name, this.vary([`${fouler.name} goes into the book.`, `Yellow card for ${fouler.name}.`]));
      }
    }
  }

  /** Send a player off — he leaves the pitch and the side plays a man down. */
  private sendOff(p: Player, straight: boolean): void {
    this.redCards++;
    this.emit("foul", p.team, p.name, straight ? `RED CARD! ${p.name} is sent off!` : `Second booking — ${p.name} is off!`);
    const idx = this.players.indexOf(p);
    if (idx >= 0) this.players.splice(idx, 1);
    if (this.ball.owner === p) this.ball.owner = null;
  }

  /** Periodic auto-substitutions: replace injured players, then tired ones in
   * the closing stages, like-for-like from the bench (up to MAX_SUBS). */
  private autoSubs(): void {
    for (const team of [0, 1] as const) {
      if (this.subsUsed[team] >= Match.MAX_SUBS || this.bench[team].length === 0) continue;
      const onPitch = this.players.filter((p) => p.team === team && p.role !== "GK");
      let out = onPitch.find((p) => p.injured);
      // freshen up the legs in the closing stages — bring on a fresh runner for
      // the most tired outfielder
      if (!out && this.time > 64 * 60) {
        out = onPitch.filter((p) => p.condition < 0.75).sort((a, b) => a.condition - b.condition)[0];
      }
      if (!out) continue;
      let idx = this.bench[team].findIndex((p) => p.role === out!.role);
      if (idx < 0) idx = 0;
      this.makeSub(team, out, idx);
    }
  }

  private makeSub(team: 0 | 1, out: Player, benchIdx: number): void {
    const inP = this.bench[team].splice(benchIdx, 1)[0];
    if (!inP) return;
    inP.base = { ...out.base };
    inP.pos = { ...out.base };
    inP.target = { ...out.base };
    inP.condition = Math.max(inP.condition, 0.95); // fresh legs
    const idx = this.players.indexOf(out);
    if (idx >= 0) this.players.splice(idx, 1, inP);
    else this.players.push(inP);
    if (this.ball.owner === out) this.ball.owner = inP;
    this.subsUsed[team]++;
    this.subsMade++;
    this.emit("substitution", team, inP.name, `Sub for ${this.shortName(team)}: ${inP.name} on, ${out.name} off${out.injured ? " (injured)" : ""}.`);
  }

  private kickoff(kickingTeam: 0 | 1, matchStart: boolean): void {
    for (const p of this.players) p.pos = { ...p.base };
    this.ball.pos = { ...CENTER };
    this.ball.vel = { x: 0, y: 0 };
    this.ball.shooter = null;
    this.ball.receiver = null;
    this.ball.passer = null;
    this.ball.isShot = false;
    this.ball.airTimer = 0;
    this.ball.passType = null;
    this.ball.shotType = null;
    this.ball.fromCross = false;
    this.ball.cutback = false;
    this.ball.cooldown = 0;
    this.ball.offsideFlag = null;
    this.ball.lastTeam = kickingTeam;
    // give the ball to a central player of the kicking team
    const central = this.players
      .filter((p) => p.team === kickingTeam && p.role !== "GK")
      .sort((a, b) => dist(a.base, CENTER) - dist(b.base, CENTER))[0]!;
    this.ball.owner = central;
    // a kick-off restart is not a "won ball" transition — clear the break window
    this.winBallTeam = kickingTeam;
    this.winBallTime = -99;
    if (matchStart) {
      this.emit("kickoff", undefined, undefined, "Kick-off!");
    }
  }

  // ---- main step ----

  step(): void {
    if (this.finished) return;
    // hold on the goal (ball in the net) before restarting, so it's visible —
    // and let the scorers wheel away celebrating while the ball sits in the net
    if (this.celebrateTimer > 0) {
      this.celebrateTimer -= DT;
      this.celebrationMove();
      if (this.celebrateTimer <= 0) this.kickoff(this.pendingKickoff, false);
      return;
    }
    this.time += DT;
    // momentum decays back toward neutral over a few minutes
    this.momentum[0] *= 0.9995;
    this.momentum[1] *= 0.9995;
    if (this.ball.cooldown > 0) this.ball.cooldown -= DT;
    if (this.ball.airTimer > 0) this.ball.airTimer -= DT;
    for (const p of this.players) if (p.dribbleTimer > 0) p.dribbleTimer -= DT;
    // Possession = control, not just dwell time: credit the team in possession
    // while they hold it AND while their pass is travelling (so quick-passing
    // sides aren't under-counted vs a slow team that holds each touch longer).
    if (this.ball.owner) this.possessionTicks[this.ball.owner.team]++;
    else if (!this.ball.isShot && this.ball.receiver && this.ball.lastTeam !== null)
      this.possessionTicks[this.ball.lastTeam]++;
    this.updateFatigue();
    this.subScanTimer -= DT;
    if (this.subScanTimer <= 0) {
      this.subScanTimer = 20;
      this.autoSubs();
    }
    this.narrateBuildup();

    if (!this.startedSecondHalf && this.time >= HALF_SECONDS) {
      this.startedSecondHalf = true;
      this.emit("half_time", undefined, undefined, "Half time.");
      // second half: the team that didn't start now kicks off
      this.kickoff(1, false);
      return;
    }
    if (this.time >= FULL_SECONDS) {
      this.finished = true;
      this.emit("full_time", undefined, undefined, "Full time.");
      return;
    }

    this.assignMovement();
    if (this.ball.owner) this.carrierUpdate();
    this.integrate();
    if (!this.ball.owner) this.resolveLooseBall();
    this.checkBounds();
  }

  /** Advance the match by the given number of simulated seconds. */
  advance(seconds: number): void {
    const steps = Math.round(seconds / DT);
    for (let i = 0; i < steps && !this.finished; i++) this.step();
  }

  /** Run the whole match to full time. */
  simulate(): void {
    while (!this.finished) this.step();
  }

  // ---- behaviour ----

  private nearestOutfield(
    team: 0 | 1,
    point: Vec,
    exclude: Player[] = [],
  ): Player | null {
    let best: Player | null = null;
    let bd = Infinity;
    for (const p of this.players) {
      if (p.team !== team || p.role === "GK" || exclude.includes(p)) continue;
      const d = dist(p.pos, point);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  private gkTarget(gk: Player): Vec {
    const b = this.ball;
    const ownGoalX = gk.team === 0 ? 0 : PITCH_LENGTH;
    const side = gk.team === 0 ? 1 : -1; // direction out into the pitch
    const toGoal = Math.abs(b.pos.x - ownGoalX);

    // 1) SHOT incoming on our goal: spring across the line to the ball's
    // projected crossing point — this is the keeper diving to make the save.
    if (b.isShot && b.shooter && b.shooter.team !== gk.team && toGoal < 32) {
      const off = clamp(toGoal * 0.1, 1.4, 3.2);
      const y = clamp(b.aimY, GOAL_Y_MIN - 1.2, GOAL_Y_MAX + 1.2);
      return { x: ownGoalX + side * off, y };
    }

    // 2) Clean through on goal: a ball / runner has got beyond our last
    // defender. Rush out to narrow the angle (and tempt a chip).
    const threat =
      b.owner && b.owner.team !== gk.team
        ? b.owner
        : b.receiver && b.receiver.team !== gk.team && b.airTimer <= 0
          ? b.receiver
          : null;
    if (threat) {
      const dThreat = Math.abs(threat.pos.x - ownGoalX);
      const defs = this.players.filter((p) => p.team === gk.team && p.role !== "GK");
      const lastDef = defs.length ? Math.min(...defs.map((p) => Math.abs(p.pos.x - ownGoalX))) : 99;
      if (dThreat < 24 && dThreat <= lastDef + 1.5) {
        const off = clamp(dThreat * 0.5, 2.5, 13);
        const y = clamp(34 + (threat.pos.y - 34) * 0.6, GOAL_Y_MIN - 2, GOAL_Y_MAX + 2);
        return { x: ownGoalX + side * off, y };
      }
    }

    // 3) Normal positioning: hold just off the line near the six-yard box,
    // edging out a touch as the ball nears and shading slightly toward it.
    const off = toGoal < 10 ? Math.min(3.0, 2.2 + (10 - toGoal) * 0.1) : 2.2;
    const x = ownGoalX + side * off;
    const y = clamp(34 + (b.pos.y - 34) * 0.12, 32, 36);
    return { x, y };
  }

  private assignMovement(): void {
    const b = this.ball;
    const possTeam = b.owner ? b.owner.team : null;

    for (const p of this.players) {
      if (p === b.owner) {
        const g = this.oppGoal(p.team);
        // An inverted winger in the final third drives INFIELD to the top of the
        // box (the half-space), turning a wide angle into a central shooting
        // chance — this is how wingers actually get their goals.
        if (
          p.traits.has("cuts_inside") &&
          this.inFinalThird(p) &&
          Math.abs(p.pos.y - 34) > 9 &&
          p.dribbleTimer <= 0
        ) {
          const aimX = p.team === 0 ? 88 : 17;
          const aimY = 34 + (p.pos.y > 34 ? 12 : -12); // half-space, not fully central
          const dir = norm(sub({ x: aimX, y: aimY }, p.pos));
          p.target = clampPitch({ x: p.pos.x + dir.x * 6, y: p.pos.y + dir.y * 6 });
          continue;
        }
        const dir = norm(sub(g, p.pos));
        const dg = dist(p.pos, g);
        // Carry toward goal, but PULL UP around the edge of the box rather than
        // dribbling onto the goal line — unless he's burst clear of his man
        // (dribbleTimer), when he can drive in to round the keeper. This stops
        // every shot happening from right on the six-yard line.
        const minDist = p.dribbleTimer > 0 ? 5 : 11;
        const reach = Math.max(0, Math.min(10, dg - minDist));
        p.target = clampPitch({ x: p.pos.x + dir.x * reach, y: p.pos.y + dir.y * reach });
        continue;
      }
      if (p.role === "GK") {
        p.target = this.gkTarget(p);
        continue;
      }
      const t = this.tac(p.team);
      const attacking = p.team === possTeam;
      const dir = p.team === 0 ? 1 : -1; // toward opponent's goal
      // Ball-relative push so attacks build. Forwards surge much more than
      // defenders, so the side STRETCHES as it attacks. Mentality raises
      // attacking commitment; line height shifts the whole block up/down.
      const fwd =
        p.role === "ST" || p.role === "AM" || p.role === "MR" || p.role === "ML";
      const def = p.role === "DC" || p.role === "DL" || p.role === "DR";
      const wideRole =
        p.role === "ML" || p.role === "MR" || p.role === "DL" || p.role === "DR";
      const line = fwd ? 1.25 : def ? 0.8 : 1.05;
      // DUTY: per-player attacking commitment, but ONLY when his team has the
      // ball. Out of possession an attack-duty player (overlapping full-back,
      // box-to-box mid) RECOVERS to his station — otherwise the side is left
      // wide open on the counter (this was making attacking sides concede heaps).
      // INDIVIDUAL INSTRUCTIONS: get-forward pushes on like an attack duty;
      // hold-position keeps him disciplined; roam lets him drift more to the ball.
      const pi = p.instr;
      const getsFwd = pi.getForward === true;
      const holds = pi.holdPosition === true;
      const dutyPush =
        (p.duty === "attack" || getsFwd) ? (attacking ? 1.12 : 0.95) : p.duty === "defend" ? 0.82 : 1.0;
      // the static forward nudge (overlap) only applies to deeper players when
      // actually attacking; defend-duty players sit a touch deeper always.
      let dutyAdvance =
        !fwd && attacking && (p.duty === "attack" || getsFwd)
          ? dir * 5
          : p.duty === "defend"
            ? dir * -3
            : 0;
      if (holds) dutyAdvance = p.duty === "defend" ? dir * -3 : 0; // stay put
      // OFFSIDE TRAP: out of possession the back line steps up sharply to catch
      // runners, trading depth for offsides won (and risk if it's beaten).
      const trapStep = !attacking && def ? dir * t.offsideTrap * 7 : 0;
      const roam = pi.roam === true;
      const pull =
        (attacking ? 0.5 + 0.12 * t.mentality : 0.42) * line * dutyPush * (roam ? 1.22 : 1) * (holds ? 0.8 : 1);
      const lineShift = dir * (t.lineHeight - 0.5) * 24 + dutyAdvance + trapStep;
      // wide players hold the touchline to stretch play; everyone else can be
      // pulled toward the ball, but only gently, so the team doesn't bunch up
      const widthFactor = (0.7 + 0.6 * t.width) * (wideRole ? 1.2 : 1.0);
      const ballYPull = (wideRole ? 0.06 : 0.14) * (roam ? 1.5 : 1);
      // per-player wandering so players drift into space individually rather than
      // moving as one rigid block — two out-of-phase waves give a less robotic,
      // more natural check-and-move, in both axes.
      const driftAmp = (holds ? 0.5 : roam ? 1.4 : 1);
      const driftY = (Math.sin(this.time * 0.45 + p.id * 1.7) * 4 + Math.cos(this.time * 0.27 + p.id * 2.3) * 3) * driftAmp;
      const driftX = Math.cos(this.time * 0.33 + p.id * 1.1) * 3 * driftAmp;
      // FOCUS PLAY: when attacking, the side funnels toward the favoured flank
      // (-1 left/low-y .. +1 right/high-y). Sign chosen so shots emerge on the
      // labelled side once the opposition has shifted across.
      const focusShift = attacking ? -t.focusPlay * 12 : 0;
      const tx = p.base.x + (b.pos.x - CENTER.x) * pull + lineShift + driftX;
      const ty =
        CENTER.y + (p.base.y - CENTER.y) * widthFactor + (b.pos.y - CENTER.y) * ballYPull + driftY + focusShift;
      p.target = clampPitch({
        // outfielders stay off both goal lines — never on/behind them (no pile-up)
        x: clamp(tx, 5, PITCH_LENGTH - 5),
        y: ty,
      });
    }

    if (possTeam !== null && b.owner) {
      // Pressing: intensity sets how many players close down, and the line of
      // engagement sets how high up the pitch they start. High press = up to 3
      // closers, high up; sit-off = one closer near the carrier.
      const defTeam = (1 - possTeam) as 0 | 1;
      const dT = this.tac(defTeam);
      const ownGoalX = defTeam === 0 ? 0 : PITCH_LENGTH;
      const ballDepth = Math.abs(b.pos.x - ownGoalX);
      // COUNTER-PRESS: in the seconds after losing the ball, a high counter-press
      // swarms to win it back (more bodies, further up); a low one drops & regroups.
      const justLost = this.sinceWon(possTeam) < 3.5; // defTeam lost it <3.5s ago
      const cpBoost = justLost ? (dT.counterPress - 0.5) * 2 : 0; // -1..+1 → range/closers
      const engageRange = 35 + dT.pressing * 60 + dT.lineHeight * 15 + cpBoost * 24;
      // in the defensive third the side MUST engage regardless of pressing
      // tactic — you don't let a man stroll into your box. At least two close
      // down (the presser + a cover), more with a high press.
      const inDanger = ballDepth < 30;
      let closers = inDanger
        ? Math.max(2, 1 + Math.round(dT.pressing * 2))
        : ballDepth < engageRange
          ? 1 + Math.round(dT.pressing * 2)
          : 1;
      closers = clamp(closers + Math.round(cpBoost), 1, 5);
      // players told to close down LESS are kept out of the press rotation
      const noPress = this.players.filter(
        (p) => p.team === defTeam && p.instr.closeDown === "less",
      );
      const pressers: Player[] = [];
      for (let i = 0; i < closers; i++) {
        const d = this.nearestOutfield(defTeam, b.pos, pressers.concat(noPress));
        if (!d) break;
        pressers.push(d);
        if (i === 0) {
          d.target = { ...b.pos };
        } else {
          const off = norm(sub(d.pos, b.pos));
          d.target = clampPitch({ x: b.pos.x + off.x * 5, y: b.pos.y + off.y * 5 });
        }
      }
      // players told to close down MORE jump the carrier when within range,
      // on top of the team's press (an aggressive individual harrier).
      for (const p of this.players) {
        if (p.team !== defTeam || p.role === "GK" || pressers.includes(p)) continue;
        if (p.instr.closeDown === "more" && dist(p.pos, b.pos) < 16) {
          p.target = { ...b.pos };
          pressers.push(p);
        }
      }

      const protectGoal = this.oppGoal(possTeam); // attackers' target = defenders' goal
      const marked = new Set<Player>();

      // INDIVIDUAL MARKING (player instruction): a player told to man-mark a
      // specific opponent (by name) or position (by role) tracks him goal-side,
      // regardless of the team's marking scheme.
      for (const d of this.players) {
        if (d.team !== defTeam || d.role === "GK" || !d.markName || pressers.includes(d)) continue;
        const tgt = this.resolveMark(d);
        if (!tgt) continue;
        marked.add(d);
        const toGoal = norm(sub(protectGoal, tgt.pos));
        const tight = d.tightMark ? 1.6 : 3.0;
        d.target = clampPitch({ x: tgt.pos.x + toGoal.x * tight, y: tgt.pos.y + toGoal.y * tight });
      }

      // TEAM MAN-MARKING: only if the side's scheme is man-marking. The back line
      // picks up the most dangerous central runner and sits goal-side, so he's
      // tracked rather than free. Zonal sides instead hold their shape (above).
      if (this.tac(defTeam).marking === "man") {
        const dangerous = this.players
          .filter(
            (p) =>
              p.team === possTeam &&
              p.role !== "GK" &&
              this.isThreat(p, possTeam) &&
              dist(p.pos, protectGoal) < 40,
          )
          .sort((a, c) => dist(a.pos, protectGoal) - dist(c.pos, protectGoal))
          .slice(0, 1);
        const backs = this.players.filter(
          (p) => p.team === defTeam && p.role === "DC" && !pressers.includes(p) && !marked.has(p),
        );
        for (const att of dangerous) {
          let marker: Player | null = null;
          let bd = Infinity;
          for (const d of backs) {
            if (marked.has(d)) continue;
            const dd = dist(d.pos, att.pos);
            if (dd < bd) {
              bd = dd;
              marker = d;
            }
          }
          if (!marker) break;
          marked.add(marker);
          const toGoal = norm(sub(protectGoal, att.pos));
          const tight = clamp(4.0 + dist(att.pos, protectGoal) * 0.05, 4.0, 7.0);
          marker.target = clampPitch({ x: att.pos.x + toGoal.x * tight, y: att.pos.y + toGoal.y * tight });
        }
      }

      // CUT THE PASSING LANE: a spare central defender drops into the line
      // between the ball and the most dangerous central runner, to read and
      // intercept the through ball rather than just retreating.
      const runner = this.players
        .filter((p) => p.team === possTeam && p.role !== "GK" && this.isThreat(p, possTeam))
        .sort((a, c) => dist(a.pos, protectGoal) - dist(c.pos, protectGoal))[0];
      if (runner) {
        const cover = this.players.find(
          (p) =>
            p.team === defTeam &&
            (p.role === "DC" || p.role === "DM") &&
            !pressers.includes(p) &&
            !marked.has(p),
        );
        if (cover) {
          const lane: Vec = {
            x: b.pos.x + (runner.pos.x - b.pos.x) * 0.45,
            y: b.pos.y + (runner.pos.y - b.pos.y) * 0.45,
          };
          cover.target = clampPitch(lane);
          marked.add(cover);
        }
      }

      // Support play: the nearest teammates take up angles around the carrier
      // to form passing triangles (two ahead in the half-spaces, one behind to
      // recycle) — this is what lets possession progress through the thirds.
      const goal = this.oppGoal(possTeam);
      const f = norm(sub(goal, b.owner.pos)); // forward, toward goal
      const rt: Vec = { x: f.y, y: -f.x }; // perpendicular (to the side)
      // two ahead in the half-spaces, one deeper to recycle — but with a little
      // live movement so support players check in/out rather than standing still
      const wob = Math.sin(this.time * 0.6) * 3;
      const slots: Vec[] = [
        { x: b.owner.pos.x + f.x * (16 + wob) + rt.x * 11, y: b.owner.pos.y + f.y * (16 + wob) + rt.y * 11 },
        { x: b.owner.pos.x + f.x * (16 - wob) - rt.x * 11, y: b.owner.pos.y + f.y * (16 - wob) - rt.y * 11 },
        { x: b.owner.pos.x - f.x * 9 + rt.x * 7, y: b.owner.pos.y - f.y * 9 + rt.y * 7 },
      ];
      const taken: Player[] = [b.owner];
      for (const slot of slots) {
        const sp = this.nearestOutfield(possTeam, slot, taken);
        if (sp) {
          sp.target = clampPitch(slot);
          taken.push(sp);
        }
      }

      // Off-ball runs in behind: forwards with sharp movement (or the
      // "runs in behind" trait) time runs into the channel beyond the last
      // defender, giving the carrier a through-ball target instead of everyone
      // coming to feet. This is where Off the Ball turns into chances.
      const adir = possTeam === 0 ? 1 : -1;
      const defs = this.players.filter((q) => q.team !== possTeam && q.role !== "GK");
      const lineX = defs.length
        ? adir > 0
          ? Math.max(...defs.map((q) => q.pos.x))
          : Math.min(...defs.map((q) => q.pos.x))
        : adir > 0
          ? 80
          : 25;
      const teamInAttack = adir > 0 ? b.pos.x > 45 : b.pos.x < 60;
      if (teamInAttack) {
        const lo = adir > 0 ? 50 : 5;
        const hi = adir > 0 ? 100 : 55;
        // on a counter-attack break the runners go earlier and more often
        const brk = this.sinceWon(possTeam) < 3 ? Math.max(0, this.tac(possTeam).counterAttack - 0.5) : 0;
        const mentality = this.tac(possTeam).mentality;
        for (const p of this.players) {
          if (p.team !== possTeam || p === b.owner) continue;
          const fwd = p.role === "ST" || p.role === "AM" || p.role === "MR" || p.role === "ML";
          const central = p.role === "MC" || p.role === "DM";
          if (!fwd && !central) continue; // full-backs/CBs hold shape (bar set pieces)
          const wantsForward =
            p.instr.getForward === true || p.traits.has("gets_forward") || p.traits.has("runs_in_behind");
          // Willingness to break the line this slice. Forwards always go; CENTRAL
          // midfielders make TIMED LATE RUNS scaled by Off The Ball, team mentality
          // and any getForward instruction — better movement → more, deeper runs
          // (no flat gate or cap, it scales smoothly up and down with the player).
          // DMs hold far more than MCs so the shape doesn't collapse. This is what
          // makes midfield a genuine scoring source instead of pure support.
          let drive: number;
          if (fwd) {
            drive = 1;
          } else {
            const movement = p.attrs.offTheBall / 20;
            const roleBase = p.role === "DM" ? 0.28 : 0.6;
            drive = roleBase * (0.35 + 0.65 * movement) * (0.8 + 0.5 * mentality) * (wantsForward ? 1.5 : 1);
          }
          // burst timing, staggered per player so the line never empties at once;
          // a higher drive lowers the threshold → the run comes more often & sooner
          const phase = Math.sin(this.time * 0.6 + p.id * 2.3);
          if (phase < 0.92 - drive * 0.75 - brk * 0.35) continue;
          // how far beyond/behind the last line they arrive: forwards run IN BEHIND;
          // central runners arrive LATE into the box / cut-back zone, deeper the
          // better their movement (Off The Ball), so they become real finishers.
          const depth = fwd
            ? 1 + p.attrs.offTheBall * 0.07
            : (p.role === "DM" ? -7 : -3) + p.attrs.offTheBall * 0.16;
          const targetX = clamp(lineX + adir * depth, lo, hi);
          // wide players hold a wider line (back-post threat); others come central
          const pullCentral = p.role === "MR" || p.role === "ML" ? 0.55 : 0.82;
          const targetY = clamp(34 + (p.pos.y - 34) * pullCentral - this.tac(possTeam).focusPlay * 9, 8, 60);
          p.target = clampPitch({ x: targetX, y: targetY });
        }
      }
    } else if (b.receiver && !b.isShot) {
      // a pass is in flight: the intended receiver runs onto the ball (so passes
      // connect intentionally instead of rolling to whoever is nearest), while
      // the closest opponent moves to contest it
      const lead = clampPitch({ x: b.pos.x + b.vel.x * 0.3, y: b.pos.y + b.vel.y * 0.3 });
      b.receiver.target = lead;
      const opp = this.nearestOutfield((1 - b.receiver.team) as 0 | 1, b.pos);
      if (opp) opp.target = { ...b.pos };
    } else {
      // genuinely loose (shot rebound, clearance): nearest of each side chases
      const a = this.nearestOutfield(0, b.pos);
      const c = this.nearestOutfield(1, b.pos);
      if (a) a.target = { ...b.pos };
      if (c) c.target = { ...b.pos };
    }

    // Separation: nudge every outfield player away from nearby teammates so the
    // side keeps its spacing and moves as individuals, not one rigid block.
    for (const p of this.players) {
      if (p === b.owner || p.role === "GK") continue;
      let sx = 0;
      let sy = 0;
      for (const q of this.players) {
        if (q === p || q.team !== p.team) continue;
        const dx = p.pos.x - q.pos.x;
        const dy = p.pos.y - q.pos.y;
        const d = Math.hypot(dx, dy);
        if (d > 0.001 && d < 8) {
          const w = (8 - d) / 8;
          sx += (dx / d) * w;
          sy += (dy / d) * w;
        }
      }
      if (sx !== 0 || sy !== 0) {
        p.target = clampPitch({ x: p.target.x + sx * 2.5, y: p.target.y + sy * 2.5 });
      }
    }

    // Getting open: attacking players whose team has the ball peel off their
    // marker into space to make themselves available — better movers do it more.
    // This is what turns a static block into players "showing" for a pass.
    if (possTeam !== null && b.owner) {
      for (const p of this.players) {
        if (p.team !== possTeam || p === b.owner || p.role === "GK") continue;
        const attacker =
          p.role === "ST" || p.role === "AM" || p.role === "MR" || p.role === "ML" || p.role === "MC";
        if (!attacker) continue;
        const marker = this.nearestOutfield((1 - possTeam) as 0 | 1, p.pos);
        if (marker && dist(marker.pos, p.pos) < 5.5) {
          // step away from the marker, toward the freer side, scaled by movement
          const away = norm(sub(p.pos, marker.pos));
          const mag = 1.4 + (p.attrs.offTheBall / 20) * 1.8;
          p.target = clampPitch({ x: p.target.x + away.x * mag, y: p.target.y + away.y * mag });
        }
      }

      // Overlap: an attack-duty full-back bombs on past the winger ahead of him,
      // hugging the touchline to stretch the pitch and offer a wide outlet.
      for (const fb of this.players) {
        if (fb.team !== possTeam || (fb.role !== "DL" && fb.role !== "DR") || fb.duty !== "attack") continue;
        const adir = possTeam === 0 ? 1 : -1;
        const ballAdvanced = adir > 0 ? b.pos.x > 50 : b.pos.x < 55;
        if (!ballAdvanced) continue;
        const touchY = fb.base.y < 34 ? 6 : PITCH_WIDTH - 6; // his flank's touchline
        const overlapX = clamp(b.pos.x + adir * 8, 12, PITCH_LENGTH - 12);
        fb.target = clampPitch({ x: overlapX, y: touchY });
      }
    }
  }

  private carrierUpdate(): void {
    const owner = this.ball.owner!;

    const t = this.tac(owner.team);

    const challenger = this.nearestOutfield(
      (1 - owner.team) as 0 | 1,
      owner.pos,
    );
    const press = challenger ? dist(challenger.pos, owner.pos) : 99;

    // residual tackle pressure: a defender can still nick it off a player who
    // dwells on the ball under a tight challenge (tackling vs balance/composure)
    if (press < 1.3 && owner.role !== "GK" && challenger) {
      const ca = challenger.attrs;
      const oa = owner.attrs;
      // TACKLING intensity (team knob + individual "tackle harder") and a
      // COUNTER-PRESS swarm right after the challenger's side lost the ball. The
      // base tackle/foul rates are clamped, so these are applied as multipliers
      // AFTER the clamp (otherwise the caps mask them). All neutral at 0.5.
      const dTac = this.tac(challenger.team).tackling;
      const harder = challenger.instr.tackleHarder === true;
      const justLostC = this.sinceWon(owner.team) < 3.5; // challenger's side just lost it
      const swarm = justLostC ? 1 + (this.tac(challenger.team).counterPress - 0.5) * 0.5 : 1;
      const winAggro = (0.8 + 0.4 * dTac) * (harder ? 1.12 : 1) * swarm; // 0.5/none → 1.0
      const foulAggro = (0.55 + 0.9 * dTac) * (harder ? 1.25 : 1); // 0.5/none → 1.0
      const tackleSkill =
        (ca.tackling + ca.aggression * 0.4 + ca.strength * 0.3) * this.sharp(challenger);
      const retain =
        (oa.dribbling + oa.balance * 0.4 + oa.composure * 0.3) * this.sharp(owner) *
        (owner.dribbleTimer > 0 ? 1.4 : 1); // hard to dispossess mid-burst
      const p = clamp(0.004, 0.06, 0.018 * (tackleSkill / retain)) * winAggro;
      if (this.rng.chance(p)) {
        this.turnover(challenger, "tackle");
        return;
      }
      // a mistimed / cynical challenge concedes a foul. This runs every tick a
      // defender is tight, so the per-tick probability must be tiny (it adds up
      // to ~20-25 fouls a match). Aggressive, less clean tacklers give away more,
      // and a side told to get stuck in (or to tackle harder) gives away more.
      let foulP = clamp(0.00006, 0.0035, 0.0021 * (ca.aggression / 12) * (12 / (ca.tackling + 4)));
      if (this.inFinalThird(owner)) foulP *= 1.3;
      if (this.inBoxAttacking(owner)) foulP *= 0.05; // defenders are very careful in the box
      foulP *= foulAggro;
      foulP *= this.contextFoulMul(); // derbies / high-stakes games are scrappier
      if (this.rng.chance(foulP)) {
        this.commitFoul(challenger, owner);
        return;
      }
    }

    // periodic decision — per-player cadence (a "slice"), quicker at high tempo.
    // On a counter-attack break the carrier decides faster still (snap forward).
    owner.decisionTimer -= DT;
    if (owner.decisionTimer > 0) return;
    const breaking = this.sinceWon(owner.team) < 3 ? Math.max(0, t.counterAttack - 0.5) : 0;
    owner.decisionTimer = (0.45 - 0.2 * t.tempo) * (1 - breaking * 0.3); // ~0.22-0.45s

    const goal = this.oppGoal(owner.team);
    const dGoal = dist(owner.pos, goal);
    // distance to the nearest defender — large = space, small = under pressure
    const space = challenger ? dist(challenger.pos, owner.pos) : 99;

    // goalkeepers just distribute the ball upfield
    if (owner.role === "GK") {
      const gp = this.choosePass(owner, space);
      if (gp) this.executePass(owner, gp.target, gp.type);
      return;
    }

    // SHOOT — decisively when in a good position. Quality combines closeness
    // and angle (central beats a tight byline angle); space and finishing scale
    // it up. Flair makes a player more willing to try from distance.
    const fromDistance = owner.traits.has("shoots_from_distance");
    const inRange =
      dGoal <
      20 + this.directness(owner.team) * 4 + (t.shootOnSight - 0.5) * 10 +
        (fromDistance ? 6 : 0) + (owner.instr.shoot === "more" ? 5 : 0);
    let goodChance = false;
    if (inRange) {
      const shootAttr =
        dGoal < 13
          ? owner.attrs.finishing
          : owner.attrs.finishing * 0.4 + owner.attrs.longShots * 0.6;
      // taper with distance but keep some threat from range, so long-shot
      // specialists and midfielders can actually have a crack (previously this
      // hit zero beyond ~22m, which made every shot come from the striker)
      // taper with distance; zero beyond ~26m so only long-shot types try from
      // range, but not so generous that junk shots pile up while dwelling
      const closeness = Math.max(0, 1 - dGoal / 24);
      const angle = 1 - Math.min(1, Math.abs(owner.pos.y - 34) / (dGoal + 7));
      const inBox = this.inBoxAttacking(owner);
      let shotProb = (0.2 + shootAttr / 22) * closeness * angle * 0.008;
      // crowded out: you can't get a clean shot away with a man on you — lay it
      // off / cut it back instead of blazing (this was killing the striker's
      // conversion, since he shot constantly from crowded box positions)
      if (space < 2.2) shotProb *= 0.45;
      else if (space < 3.2) shotProb *= 0.75;
      shotProb *= 0.85 + 0.3 * t.mentality;
      shotProb *= 0.55 + 0.9 * t.shootOnSight; // shoot-on-sight vs work into box
      if (owner.instr.shoot === "more") shotProb *= 1.4;
      else if (owner.instr.shoot === "less") shotProb *= 0.5;
      shotProb *= 0.9 + (owner.attrs.flair / 20) * 0.2; // flair players let fly
      if (fromDistance && dGoal > 16) shotProb *= 1.6; // happy to try from range
      // unmarked floors (space-gated) — a clear sight of goal
      if (dGoal < 14 && angle > 0.6 && space > 6) shotProb = Math.max(shotProb, 0.08);
      if (dGoal < 8 && angle > 0.75 && space > 7) shotProb = Math.max(shotProb, 0.16);
      // IN THE BOX with at least half a yard: more willing to shoot (a multiplier,
      // scaled by chance quality — but a crowded player still won't blaze it)
      if (inBox && space > 2.2) shotProb *= 1.5;
      goodChance = closeness * angle > 0.35 || inBox;
      if (this.rng.chance(shotProb)) {
        this.shoot(owner, this.chooseShotType(owner, dGoal, space));
        return;
      }
    }

    // CUT-BACK — in the box (often after cutting in or beating the byline), pull
    // it back to a team-mate arriving at the top of the box for a first-time
    // shot. This is the classic source of midfield & winger goals.
    if (this.inBoxAttacking(owner)) {
      const cb = this.bestCutbackTarget(owner);
      if (cb) {
        const cbProb = 0.016 + (owner.attrs.vision / 20) * 0.016;
        if (this.rng.chance(cbProb)) {
          this.cutback(owner, cb);
          return;
        }
      }
    }

    // TAKE-ON (1v1) — evaluated at the decision slice (so it happens at a
    // realistic rate, not every tick). When a defender is tight and there's
    // room to attack, a dribbler tries to beat his man rather than just recycle.
    if (space < 2.4 && challenger && this.spaceAhead(owner) > 4) {
      let want = 0.004 + (owner.attrs.dribbling / 20) * 0.012 + (owner.attrs.flair / 20) * 0.01;
      if (owner.traits.has("likes_to_dribble")) want += 0.025;
      if (this.inFinalThird(owner)) want *= 1.3; // commit more in dangerous areas
      want *= 0.7 + 0.6 * t.creativeFreedom; // expressive sides take more men on
      if (owner.instr.dribble === "more") want *= 1.7;
      else if (owner.instr.dribble === "less") want *= 0.35;
      if (this.rng.chance(want)) {
        this.attemptTakeOn(owner, challenger);
        return;
      }
    }

    // CROSS / CUT-BACK — from wide advanced areas or the byline, deliver into
    // the box rather than running the ball out. This is the end product that
    // turns wide possession into chances (headers / first-time finishes).
    const finalThirdX = owner.team === 0 ? owner.pos.x > 88 : owner.pos.x < 17;
    const atByline = owner.team === 0 ? owner.pos.x > 99 : owner.pos.x < 6;
    const wide = Math.abs(owner.pos.y - 34) > 15;
    if (finalThirdX && wide) {
      const boxTarget = this.bestBoxTarget(owner);
      if (boxTarget) {
        let crossProb = 0.03 + (owner.attrs.crossing / 20) * 0.05 + t.width * 0.03;
        if (owner.instr.cross === "more") crossProb *= 1.7;
        else if (owner.instr.cross === "less") crossProb *= 0.4;
        if (atByline) crossProb = Math.max(crossProb, 0.1);
        if (this.rng.chance(crossProb)) {
          this.cross(owner, boxTarget);
          return;
        }
      }
    }

    // PASS — choose the best target AND the right type of pass for it. Less
    // likely if we just passed up a good shooting chance (prefer to shoot/run).
    const pass = this.choosePass(owner, space);
    if (pass) {
      // pass mainly when pressured; in space, carry the ball forward instead of
      // tapping it sideways (cuts the ping-pong, makes build-up progressive)
      let passProb = 0.2 + 0.42 * (1 - Math.min(1, space / 6));
      if (goodChance) passProb *= 0.4;
      // in the box, don't pass it square — back yourself to shoot / cut it back /
      // beat the man (a true cut-back to an arriving runner is still allowed, but
      // the safe lay-off is heavily discouraged)
      if (this.inBoxAttacking(owner) && dist(pass.target.pos, goal) > dGoal - 2) passProb *= 0.55;
      if (this.rng.chance(passProb)) {
        this.executePass(owner, pass.target, pass.type);
        return;
      }
    }
    // otherwise: keep dribbling (movement already aims at goal)
  }

  /** Resolve a 1v1 take-on: dribbling/agility/balance/flair vs the defender's
   * tackling/marking/anticipation. Winning bursts past the man; losing is a
   * tackle. */
  private attemptTakeOn(owner: Player, challenger: Player): void {
    this.takeOnAtt++;
    const oa = owner.attrs;
    const ca = challenger.attrs;
    const beat =
      (oa.dribbling * 0.5 + oa.agility * 0.25 + oa.balance * 0.15 + oa.flair * 0.1) *
      this.sharp(owner);
    const stop =
      (ca.tackling * 0.5 + ca.marking * 0.2 + ca.anticipation * 0.2 + ca.strength * 0.1) *
      this.sharp(challenger);
    if (this.rng.chance(beat / (beat + stop))) {
      // the beaten defender may cynically haul him down instead of letting him go
      if (this.rng.chance((0.02 + challenger.attrs.aggression / 500) * this.contextFoulMul())) {
        this.commitFoul(challenger, owner);
        return;
      }
      this.takeOnWon++;
      owner.dribbleTimer = 1.2; // burst of pace & control
      // knock it past and leave the beaten man trailing behind the carrier
      const fwd = norm(sub(this.oppGoal(owner.team), owner.pos));
      challenger.pos = clampPitch({ x: owner.pos.x - fwd.x * 3, y: owner.pos.y - fwd.y * 3 });
      challenger.target = { ...challenger.pos };
      if (this.inFinalThird(owner) && this.crng.chance(0.55)) {
        this.emit("take_on", owner.team, owner.name, this.vary([`${owner.name} beats his man!`, `${owner.name} skips past the challenge!`, `Lovely skill from ${owner.name}!`, `${owner.name} dances past the defender!`]));
      }
    } else {
      this.turnover(challenger, "tackle");
    }
  }

  /**
   * Choose the best teammate to pass to AND the type of pass that fits the
   * situation. Vision lets a player even *see* the harder options (through /
   * lofted / chip); Passing/Technique decide how well they're executed.
   */
  private choosePass(
    owner: Player,
    space: number,
  ): { target: Player; type: PassType } | null {
    const goal = this.oppGoal(owner.team);
    const t = this.tac(owner.team);
    // per-player + transition adjustments to directness: a player told to play
    // more direct/shorter shifts his own ambition; on a counter-attack break the
    // whole side plays more directly to spring the runners.
    const breaking = this.sinceWon(owner.team) < 3 ? Math.max(0, t.counterAttack - 0.5) : 0;
    let D = this.directness(owner.team);
    if (owner.instr.passDirectness === "direct") D = clamp(D + 0.18, 0, 1);
    else if (owner.instr.passDirectness === "shorter") D = clamp(D - 0.18, 0, 1);
    D = clamp(D + breaking * 0.4, 0, 1);
    const cf = t.creativeFreedom; // expressiveness → more ambitious through-balls
    const oa = owner.attrs;
    const sees = (oa.vision / 20) * (0.6 + 0.8 * cf); // spotting the ambitious option
    const maxD = 26 + 34 * D + oa.vision * 0.5 + breaking * 8;
    let best: { target: Player; type: PassType } | null = null;
    let bestScore = -Infinity;

    for (const p of this.players) {
      if (p.team !== owner.team || p === owner || p.role === "GK") continue;
      const d = dist(owner.pos, p.pos);
      if (d < 3.5 || d > maxD) continue;

      const advancement = dist(owner.pos, goal) - dist(p.pos, goal); // +ve forward
      const marker = this.nearestOutfield((1 - owner.team) as 0 | 1, p.pos);
      const openness = marker ? Math.min(14, dist(marker.pos, p.pos)) : 14;
      const spaceAhead = this.spaceAhead(p); // room to run onto a ball
      const lateral = Math.abs(p.pos.y - owner.pos.y);
      const tgtGoal = dist(p.pos, goal);

      // decide the most appropriate pass type for THIS teammate. Players who
      // "try killer balls" look for the through ball more readily.
      const killer = owner.traits.has("tries_killer_balls");
      let type: PassType;
      if (advancement > 9 && spaceAhead > (killer ? 9 : 12) && this.rng.chance(sees * (killer ? 0.7 : 0.45))) {
        type = "through"; // a runner with clear space behind the line (vision)
      } else if (d > 30 && (lateral > 26 || advancement > 16) && this.rng.chance(0.18 + sees * 0.25)) {
        type = "lofted"; // a genuine switch / over-the-top — kept rarer (it hangs)
      } else if (space < 2 && d < 11 && this.rng.chance(oa.flair / 30)) {
        type = "chip"; // tight space, dink it over the press (risky, flair)
      } else if (d > 15 && D > 0.35) {
        type = "driven"; // progress at pace
      } else {
        type = "feet"; // safe, to feet (the bread and butter)
      }

      // score the option: progress + how open + a bonus for finding a shooter,
      // minus distance risk. Forward passes are strongly preferred — backward and
      // square balls are heavily penalised so the side PROGRESSES instead of
      // endlessly recycling (only going back when there's nothing else on).
      const shooterBonus = tgtGoal < 20 ? (20 - tgtGoal) * 0.5 : 0;
      const skill = oa.passing * 0.5 + oa.technique * 0.3 + oa.vision * 0.2;
      const typeRisk =
        type === "through" ? 8 : type === "lofted" ? 9 : type === "chip" ? 11 : type === "driven" ? 3 : 0;
      const riskPenalty = typeRisk * (1 - skill / 20);
      const progress =
        advancement >= 0
          ? advancement * (1.0 + 0.6 * D) * (1 + breaking * 0.45) // break = pour forward
          : advancement * 1.7; // backward hurts
      const score =
        progress +
        openness * (0.8 - 0.45 * D) +
        shooterBonus -
        d * (0.12 - 0.06 * D) -
        riskPenalty;
      if (score > bestScore) {
        bestScore = score;
        best = { target: p, type };
      }
    }
    return best;
  }

  /** Is a player inside the penalty area they are attacking? */
  private inBoxAttacking(p: Player): boolean {
    const inWidth = Math.abs(p.pos.y - 34) < 20.16;
    return (p.team === 0 ? p.pos.x > 88.5 : p.pos.x < 16.5) && inWidth;
  }

  /** Best teammate to aim a cross at — central, in or arriving in the box. */
  private bestBoxTarget(crosser: Player): Player | null {
    const goal = this.oppGoal(crosser.team);
    let best: Player | null = null;
    let bestScore = -Infinity;
    for (const p of this.players) {
      if (p.team !== crosser.team || p === crosser || p.role === "GK") continue;
      const advanced = crosser.team === 0 ? p.pos.x > 84 : p.pos.x < 21;
      const centralEnough = Math.abs(p.pos.y - 34) < 16;
      if (!advanced || !centralEnough) continue; // need a real target in the box
      const central = 1 - Math.min(1, Math.abs(p.pos.y - 34) / 18);
      const marker = this.nearestOutfield((1 - crosser.team) as 0 | 1, p.pos);
      const openness = marker ? Math.min(12, dist(marker.pos, p.pos)) : 12;
      const aerial = (p.attrs.heading + p.attrs.jumpingReach) / 2;
      // reward the player who's actually free (back-post winger, arriving
      // midfielder) rather than always hammering it at the central striker
      // the striker is the focal point in the box — aim for him a bit more; a
      // late-arriving attacking midfielder is a real threat at the back post too
      const focal =
        p.role === "ST" ? 3 : p.role === "AM" ? 3 : p.role === "MC" || p.role === "DM" ? 3 : 0;
      const score =
        central * 7 + openness * 1.6 + aerial * 0.4 + p.attrs.offTheBall * 0.15 + focal - dist(p.pos, goal) * 0.18;
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    return best;
  }

  /** Best team-mate arriving at the top of the box for a cut-back (central,
   * behind the carrier, in shooting range and open). */
  private bestCutbackTarget(carrier: Player): Player | null {
    const goal = this.oppGoal(carrier.team);
    const carrierDg = dist(carrier.pos, goal);
    let best: Player | null = null;
    let bestScore = -Infinity;
    for (const p of this.players) {
      if (p.team !== carrier.team || p === carrier || p.role === "GK") continue;
      const dg = dist(p.pos, goal);
      if (dg < 11 || dg > 23) continue; // the "top of the box" band
      if (Math.abs(p.pos.y - 34) > 15) continue; // central-ish
      if (dg < carrierDg - 1) continue; // must be behind the carrier (a pull-back)
      const marker = this.nearestOutfield((1 - carrier.team) as 0 | 1, p.pos);
      const open = marker ? Math.min(10, dist(marker.pos, p.pos)) : 10;
      // an arriving midfielder is the classic cut-back finisher — favour him
      const arriving = p.role === "MC" || p.role === "AM" || p.role === "DM" ? 4 : 0;
      const score = open * 1.5 + p.attrs.finishing * 0.2 + p.attrs.longShots * 0.1 + arriving - Math.abs(p.pos.y - 34) * 0.2;
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    return best;
  }

  /** Pull the ball back low to a team-mate at the top of the box. */
  private cutback(passer: Player, target: Player): void {
    const b = this.ball;
    const d = dist(passer.pos, target.pos);
    const skill = passer.attrs.passing * 0.6 + passer.attrs.vision * 0.4;
    const errSd = ((1 - skill / 20) * 2.5) / this.sharp(passer) + 1 + this.wx.passError;
    const aim: Vec = { x: target.pos.x + this.rng.gauss(0, errSd), y: target.pos.y + this.rng.gauss(0, errSd) };
    const dir = norm(sub(aim, passer.pos));
    passer.stat.passA++;
    b.owner = null;
    b.shooter = null;
    b.passer = passer;
    b.receiver = target;
    b.isShot = false;
    b.passType = "driven";
    b.fromCross = false;
    b.cutback = true;
    b.airTimer = 0;
    b.offsideFlag = null;
    b.lastTeam = passer.team;
    b.cooldown = 0.15;
    b.vel = { x: dir.x * (14 + d * 0.4), y: dir.y * (14 + d * 0.4) };
    this.emit("key_pass", passer.team, passer.name, this.vary([`${passer.name} cuts it back!`, `${passer.name} pulls it back from the byline...`, `Cut-back from ${passer.name}...`]));
  }

  /** Deliver a cross to a teammate in the box (lofted, beats the ground press). */
  private cross(crosser: Player, target: Player): void {
    const b = this.ball;
    const d = dist(crosser.pos, target.pos);
    // accuracy from Crossing (with Technique); poor crossers spray it
    const crossSkill = crosser.attrs.crossing * 0.7 + crosser.attrs.technique * 0.3;
    // crosses are imprecise: a packed box means most are contested/cleared, so
    // we DON'T auto-deliver to the target — it lands in the area to be fought for
    const errSd = ((1 - crossSkill / 20) * (4 + d * 0.16)) / this.sharp(crosser) + 1.5 + this.wx.passError;
    const aim: Vec = {
      x: target.pos.x + this.rng.gauss(0, errSd),
      y: target.pos.y + this.rng.gauss(0, errSd),
    };
    const dir = norm(sub(aim, crosser.pos));
    const speed = 15 + d * 0.35;
    this.crossCount++;
    crosser.stat.passA++;
    b.owner = null;
    b.shooter = null;
    b.passer = crosser;
    b.receiver = null; // contested in the box, not gifted to the target
    b.isShot = false;
    b.passType = "lofted";
    b.fromCross = true;
    b.airTimer = Math.min(1.3, d / 22);
    // real parabolic arc: launch upward so the ball lands (z→0) as airTimer ends
    b.z = 0;
    b.vz = (GRAVITY * b.airTimer) / 2;
    b.lastTeam = crosser.team;
    b.cooldown = 0.2;
    b.vel = { x: dir.x * speed, y: dir.y * speed };
    this.emit("cross", crosser.team, crosser.name, this.vary([`${crosser.name} swings in a cross...`, `${crosser.name} whips it into the box...`, `Cross from ${crosser.name}...`, `${crosser.name} delivers from the flank...`]));
  }

  /** Set up and deliver a corner: load the box with the best aerial players,
   * then swing it in for the existing aerial-duel logic to resolve (most are
   * cleared; some become headers on goal). */
  private concedeCorner(attackTeam: 0 | 1): void {
    this.cornerCount++;
    const goalX = attackTeam === 0 ? PITCH_LENGTH : 0;
    const cornerY = this.rng.chance(0.5) ? 1.5 : PITCH_WIDTH - 1.5;
    const boxX = attackTeam === 0 ? PITCH_LENGTH - 8 : 8;
    const defX = attackTeam === 0 ? PITCH_LENGTH - 5 : 5;
    // best delivery man takes it
    const taker = this.players
      .filter((p) => p.team === attackTeam && p.role !== "GK")
      .sort((a, c) => c.attrs.crossing + c.attrs.technique - (a.attrs.crossing + a.attrs.technique))[0]!;
    // load the box with the tallest attackers
    const attackers = this.players
      .filter((p) => p.team === attackTeam && p !== taker && p.role !== "GK")
      .sort((a, c) => c.attrs.heading + c.attrs.jumpingReach - (a.attrs.heading + a.attrs.jumpingReach));
    const inBox = attackers.slice(0, 4);
    inBox.forEach((p, i) => {
      p.pos = clampPitch({ x: boxX, y: 28 + i * 4 });
      p.target = { ...p.pos };
    });
    // defenders pack the six-yard area
    this.players
      .filter((p) => p.team !== attackTeam && p.role !== "GK")
      .slice(0, 5)
      .forEach((p, i) => {
        p.pos = clampPitch({ x: defX, y: 26 + i * 3.5 });
        p.target = { ...p.pos };
      });
    taker.pos = { x: goalX, y: cornerY };
    this.ball.owner = taker;
    this.ball.pos = { ...taker.pos };
    this.emit("corner", attackTeam, taker.name, this.vary([`Corner to ${this.shortName(attackTeam)}.`, `${taker.name} stands over the corner...`, `Corner kick, ${this.shortName(attackTeam)}...`]));
    // SET-PIECE HEADER: the box threat who attacks the delivery. CENTRE-BACKS who
    // come up for corners are a prime, realistic source of set-piece goals — so the
    // finisher is the best aerial threat in the box WITH a genuine edge for
    // defenders, rather than always the front line. (Defenders score ~14% of real
    // goals, mostly from set plays; this routes those finishes to them.)
    const aerialOf = (p: Player) =>
      p.attrs.heading * 0.6 + p.attrs.jumpingReach * 0.3 + p.attrs.aggression * 0.1 +
      (p.role === "DC" ? 3.5 : (p.role === "DL" || p.role === "DR") ? 1.8 : 0);
    const header = [...inBox].sort((a, c) => aerialOf(c) - aerialOf(a))[0]!;
    const aerial = (header.attrs.heading * 0.6 + header.attrs.jumpingReach * 0.3 + header.attrs.aggression * 0.1) * this.sharp(header);
    const marker = this.nearestOutfield((1 - attackTeam) as 0 | 1, header.pos);
    const block = marker ? marker.attrs.heading * 0.5 + marker.attrs.marking * 0.3 + marker.attrs.jumpingReach * 0.2 : 7;
    const delivery = 0.65 + taker.attrs.crossing / 45;
    // connect ~18% for a good delivery vs an even aerial duel → with the header's
    // own finishing this lands at the real ~2.5-3% of corners scored, almost all
    // by the CB/target-man who attacks it (lifts the defender goal share toward
    // the real ~14%). Scales with delivery quality and the aerial mismatch.
    const connect = clamp(0.05, 0.42, 0.18 * delivery * (aerial / (aerial + block)) * 2);
    if (this.rng.chance(connect)) {
      // win the flight and meet it around the penalty spot for a header on goal
      header.pos = clampPitch({ x: attackTeam === 0 ? PITCH_LENGTH - 9 : 9, y: 34 + this.rng.range(-3.5, 3.5) });
      this.ball.owner = header;
      this.ball.pos = { ...header.pos };
      this.shoot(header, "header", "setpiece");
    } else {
      // not a clean first contact — swung into the box for the aerial contest
      const target = this.bestBoxTarget(taker) ?? inBox[0]!;
      this.cross(taker, target);
    }
  }

  /** Open space ahead of a player toward the goal they attack (for runs). */
  private spaceAhead(p: Player): number {
    const goal = this.oppGoal(p.team);
    const probe: Vec = {
      x: p.pos.x + norm(sub(goal, p.pos)).x * 10,
      y: p.pos.y + norm(sub(goal, p.pos)).y * 10,
    };
    const opp = this.nearestOutfield((1 - p.team) as 0 | 1, probe);
    return opp ? dist(opp.pos, probe) : 14;
  }

  private chooseShotType(shooter: Player, dGoal: number, space: number): ShotType {
    const a = shooter.attrs;
    const gk = this.players.find((p) => p.role === "GK" && p.team !== shooter.team);
    const ownGoalX = shooter.team === 0 ? PITCH_LENGTH : 0;
    const keeperOff = gk ? Math.abs(gk.pos.x - ownGoalX) : 0;
    // keeper rushed off the line + a composed, technical player nearby: chip
    if (keeperOff > 5 && dGoal > 9 && dGoal < 22 && this.rng.chance((a.composure + a.technique) / 60)) {
      return "chip";
    }
    // players who "place shots" pick their spot rather than blasting it
    const placer = shooter.traits.has("places_shots");
    // distance or hurried: blast it (long shots / power); flair adds variety
    if (dGoal > 17 || space < 2.2) {
      const powerChance = (0.55 + a.flair / 50) * (placer ? 0.5 : 1);
      if (this.rng.chance(powerChance)) return "power";
    }
    return "placed";
  }

  /** Execute a pass of a given type — each behaves and connects differently. */
  private executePass(passer: Player, target: Player, type: PassType): void {
    const b = this.ball;
    const a = passer.attrs;
    const goalDir = norm(sub(this.oppGoal(target.team), target.pos));
    const d = dist(passer.pos, target.pos);
    const passSkill = a.passing * 0.55 + a.technique * 0.3 + a.vision * 0.15;

    // where the ball is aimed, and how it flies, depends on the type
    let aimPoint: Vec;
    let lead = 0; // metres ahead of the receiver (into space)
    let speed: number;
    let typeErr: number; // base difficulty multiplier
    let air = 0; // airborne time (lofted/chip beat the ground press)
    switch (type) {
      // speeds are crisp on purpose: a ball spending too long travelling reads as
      // "pinball". Real passes zip — keep air time short.
      case "feet": // safe, to the receiver's feet
        lead = 0; speed = 17 + d * 0.45; typeErr = 0.8; break;
      case "driven": // fast and low, into feet, to progress at pace
        lead = 1; speed = 23 + d * 0.55; typeErr = 1.0; break;
      case "through": // lead into space behind the line for a runner
        lead = 7 + Math.min(8, this.spaceAhead(target) * 0.4); speed = 20 + d * 0.5; typeErr = 1.4; break;
      case "lofted": // over the top / switch — flies over ground defenders
        lead = 6; speed = 19 + d * 0.45; typeErr = 1.5; air = Math.min(1.0, d / 28); break;
      case "chip": // dink over a nearby defender, short
        lead = 4; speed = 15 + d * 0.35; typeErr = 1.7; air = 0.4; break;
    }
    aimPoint = {
      x: target.pos.x + goalDir.x * lead,
      y: target.pos.y + goalDir.y * lead,
    };
    const errSd =
      ((1 - passSkill / 20) * (2.0 + d * 0.1) * typeErr) / this.sharp(passer) +
      this.wx.passError;
    const aim: Vec = {
      x: aimPoint.x + this.rng.gauss(0, errSd),
      y: aimPoint.y + this.rng.gauss(0, errSd),
    };
    const dir = norm(sub(aim, passer.pos));

    this.passesAtt[passer.team]++;
    this.passTypeCounts[type]++;
    passer.stat.passA++;
    b.owner = null;
    b.shooter = null;
    b.passer = passer;
    b.receiver = target; // the receiver moves to meet/run onto it
    b.isShot = false;
    b.passType = type;
    b.fromCross = false;
    b.airTimer = air;
    // lofted/chip passes get a real arc (air>0); ground passes stay at z=0
    b.z = 0;
    b.vz = (GRAVITY * air) / 2;
    b.lastTeam = passer.team;
    b.cooldown = 0.2;
    b.vel = { x: dir.x * speed, y: dir.y * speed };
    // OFFSIDE: a forward ball played to a teammate who has strayed beyond the
    // second-last defender is flagged — judged when he plays it (resolveLooseBall)
    // only balls played INTO SPACE behind the line can be offside — a driven ball
    // to feet in front of the defence isn't, and flagging it inflated offsides
    b.offsideFlag =
      (type === "through" || type === "lofted") && this.isOffside(target, passer)
        ? target.team
        : null;
    // only narrate genuinely dangerous through balls (final third, occasionally)
    const attHalf = passer.team === 0 ? passer.pos.x > 60 : passer.pos.x < 45;
    if (type === "through" && passer.role !== "GK" && attHalf && this.crng.chance(0.4)) {
      this.emit("key_pass", passer.team, passer.name, this.vary([`${passer.name} threads it through!`, `Clever ball from ${passer.name}!`, `${passer.name} slides one in behind!`, `${target.name} is sent through!`]));
    }
  }

  private shoot(shooter: Player, type: ShotType, chance: ChanceType = "open"): void {
    const goal = this.oppGoal(shooter.team);
    const dGoal = dist(shooter.pos, goal);
    const challenger = this.nearestOutfield((1 - shooter.team) as 0 | 1, shooter.pos);
    const pressure = challenger && dist(challenger.pos, shooter.pos) < 3 ? 2.5 : 0;
    const a = shooter.attrs;

    // which attribute and how the ball flies depends on the shot type
    let shootAttr: number;
    let speed: number;
    let spreadMul: number;
    switch (type) {
      case "power": // blasted — fast, harder to save, but wilder
        shootAttr = a.longShots * 0.6 + a.finishing * 0.4;
        speed = 27 + a.longShots * 0.3; spreadMul = 1.25; break;
      case "chip": // lifted over the keeper — placed, not powered
        shootAttr = a.technique * 0.5 + a.composure * 0.3 + a.finishing * 0.2;
        speed = 17 + a.technique * 0.2; spreadMul = 1.0; break;
      case "header": // first-time header from a cross — heading & power
        shootAttr = a.heading * 0.55 + a.finishing * 0.25 + a.jumpingReach * 0.2;
        speed = 16 + a.heading * 0.25; spreadMul = 1.25; break;
      case "placed": // finesse/side-foot — accurate
      default:
        shootAttr = dGoal < 14 ? a.finishing : a.finishing * 0.5 + a.longShots * 0.5;
        speed = 21 + a.finishing * 0.3; spreadMul = 1.05; break;
    }
    let spread = ((1 - shootAttr / 20) * 6.2 + 3.2 + dGoal * 0.18 + pressure + this.wx.shotScatter) * spreadMul;
    spread *= 1.2 - a.composure / 50; // composed finishers place it
    spread *= 1 + (1 - shooter.condition) * 0.3; // tired legs scuff it
    // A player's inaccuracy lives in 2D: it scatters the aim sideways AND in
    // height — so a shot can now sail OVER THE BAR, emergent from the same
    // accuracy model rather than a special case. SHOOTER QUALITY drives it with NO
    // hard caps: the same `spread` (better finishing/composure/long-shots →
    // smaller) sets how wide AND how high a player misses, scaling smoothly up and
    // down with the attributes — the only "cap" is the 1–20 rating range and the
    // laws of probability, never an artificial clamp.
    //
    // The horizontal aim is UNCHANGED from the long-calibrated model, so the
    // wide-miss rate, shot-side spread, saves and goals are all preserved. The
    // height is an INDEPENDENT scatter scaled by the SAME `spread`: a poor shooter
    // sprays it high as readily as wide, a clinical one keeps it down. Kept modest
    // (~7% of shots clear the bar on average) so it costs almost no goals — only a
    // shot that was BOTH on target and skied is "lost", a small slice — while
    // scaling smoothly from ~2% (elite) to ~17% (poor) with no ceiling: the only
    // cap is the 1–20 rating range, never an artificial clamp.
    const aimY = CENTER.y + this.rng.gauss(0, spread);
    let aimZBase = 0.5; // intended height: most shots are kept low...
    if (type === "power") aimZBase = 0.9; // ...power/long efforts are leant back
    else if (type === "chip") aimZBase = 1.7; // ...chips floated under the bar
    else if (type === "header") aimZBase = 0.7; // ...headers nodded down
    const skier = spread * (type === "chip" ? 0.08 : 0.13); // vertical scatter
    const aimZ = Math.max(0, aimZBase + this.rng.gauss(0, skier));
    const dir = norm(sub({ x: goal.x, y: aimY }, shooter.pos));

    // expected goals for this attempt: closer + more central = higher; headers
    // and chips are harder to convert
    const ang = 1 - Math.min(1, Math.abs(shooter.pos.y - 34) / (dGoal + 7));
    let xg = Math.max(0.015, 0.22 * Math.exp(-dGoal / 6.5)) * (0.35 + 0.65 * ang);
    if (type === "header") xg *= 0.65;
    else if (type === "chip") xg *= 0.8;
    else if (type === "power") xg *= 0.9;
    this.xg[shooter.team] += Math.min(0.9, xg);
    shooter.stat.shots++;

    this.ball.owner = null;
    this.ball.shooter = shooter;
    this.ball.receiver = null;
    this.ball.passer = null;
    this.ball.isShot = true;
    this.ball.shotType = type;
    this.ball.fromCross = false;
    this.ball.airTimer = 0;
    this.ball.aimY = aimY;
    this.ball.aimZ = aimZ;
    // launch the ball on a vertical arc that reaches aimZ as it crosses the line.
    // flight time ≈ horizontal distance / speed; vz0 = aimZ/t + ½·g·t lifts it so
    // gravity brings it down to aimZ at the goal (over-the-bar reads true on screen).
    {
      const flight = Math.max(0.15, dGoal / Math.max(1, speed));
      this.ball.z = 0;
      this.ball.vz = aimZ / flight + 0.5 * GRAVITY * flight;
    }
    this.ball.judged = false;
    this.ball.lastTeam = shooter.team;
    this.ball.cooldown = 0;
    // classify the chance: explicit (cut-back/cross/penalty/set-piece) wins,
    // else a sprung runner is "through", else open play.
    this.ball.chance = chance !== "open" ? chance : shooter.dribbleTimer > 0 ? "through" : shooter.assistFrom ? "open" : "open";
    this.ball.deflected = false;
    this.ball.vel = { x: dir.x * speed, y: dir.y * speed };
    this.shots[shooter.team]++;
    this.shotTypeCounts[type]++;
    this.shotDist.push(dGoal);
    this.shotSideByTeam[shooter.team].push(shooter.pos.y - 34);

    const n = shooter.name;
    const line =
      type === "header"
        ? this.vary([`${n} rises to meet it — header!`, `Header from ${n}!`, `${n} gets his head to it!`])
        : type === "chip"
          ? this.vary([`${n} tries to chip the keeper!`, `${n} attempts a delicate dink!`])
          : type === "power" || dGoal > 18
            ? this.vary([`${n} lets fly from distance!`, `${n} has a crack from range!`, `${n} shoots from the edge of the box!`])
            : this.vary([`${n} shoots!`, `${n} goes for goal!`, `Chance for ${n}!`, `${n} pulls the trigger!`]);
    this.emit("shot", shooter.team, n, line);
  }

  private turnover(winner: Player, kind: "tackle" | "interception"): void {
    const inFinalThird = this.inFinalThird(winner);
    this.ball.owner = winner;
    this.ball.vel = { x: 0, y: 0 };
    this.ball.shooter = null;
    this.ball.receiver = null;
    this.ball.passer = null;
    this.ball.isShot = false;
    this.ball.airTimer = 0;
    this.ball.passType = null;
    this.ball.shotType = null;
    this.ball.fromCross = false;
    this.ball.cutback = false;
    this.ball.offsideFlag = null;
    this.ball.lastTeam = winner.team;
    this.ball.cooldown = 0;
    this.notePossession(winner.team);
    // only a fraction of micro-duels count as a "tackle won" for the stat sheet
    if (kind === "tackle" && this.crng.chance(0.12)) winner.stat.tackles++;
    // a committed tackle occasionally leaves the tackler with a knock (rare)
    if (kind === "tackle") this.maybeInjure(winner, 0.001);
    // narrate only some final-third turnovers, so commentary stays readable
    if (inFinalThird && this.crng.chance(0.3)) {
      this.emit(
        kind,
        winner.team,
        winner.name,
        kind === "tackle"
          ? this.vary([`${winner.name} wins it with a strong tackle!`, `Crucial tackle by ${winner.name}!`, `${winner.name} dispossesses his man!`])
          : this.vary([`${winner.name} reads it and intercepts!`, `Intercepted by ${winner.name}!`, `${winner.name} cuts it out!`]),
      );
    }
  }

  private inFinalThird(p: Player): boolean {
    // is the player in the third nearest the goal they're attacking?
    return p.team === 0 ? p.pos.x > 70 : p.pos.x < 35;
  }

  /** Resolve a player's individual marking instruction to a current opponent:
   * an exact opponent name (fixed man-mark) or a Role (mark the nearest opponent
   * playing that position). */
  private resolveMark(d: Player): Player | null {
    if (!d.markName) return null;
    const oppTeam = (1 - d.team) as 0 | 1;
    const byName = this.players.find((p) => p.team === oppTeam && p.name === d.markName);
    if (byName) return byName;
    // otherwise treat the instruction as a position/role to pick up
    let best: Player | null = null;
    let bd = Infinity;
    for (const p of this.players) {
      if (p.team !== oppTeam || p.role !== (d.markName as Role)) continue;
      const dd = dist(p.pos, d.pos);
      if (dd < bd) {
        bd = dd;
        best = p;
      }
    }
    return best;
  }

  /** An advanced attacker worth man-marking (forward roles in the attacking
   * half), used by the defensive line to pick up runners. */
  private isThreat(p: Player, attTeam: 0 | 1): boolean {
    const inAttHalf = attTeam === 0 ? p.pos.x > 52 : p.pos.x < 53;
    return (
      inAttHalf &&
      (p.role === "ST" || p.role === "AM" || p.role === "MR" || p.role === "ML" || p.role === "MC")
    );
  }

  /** Is the receiver in an offside position relative to where the pass is played
   * from? Offside = in the attacking half, ahead of the ball, and beyond the
   * second-last defender (the last outfielder, with the keeper deepest). */
  private isOffside(receiver: Player, passer: Player): boolean {
    const oppGoal = this.oppGoal(receiver.team);
    const inAttHalf = receiver.team === 0 ? receiver.pos.x > 52.5 : receiver.pos.x < 52.5;
    if (!inAttHalf) return false;
    if (dist(receiver.pos, oppGoal) >= dist(passer.pos, oppGoal)) return false; // not ahead of ball
    const line = this.players
      .filter((p) => p.team !== receiver.team)
      .map((p) => Math.abs(p.pos.x - oppGoal.x))
      .sort((a, b) => a - b);
    const lineDist = line[1] ?? line[0] ?? 0; // second-last defender
    return Math.abs(receiver.pos.x - oppGoal.x) < lineDist - 0.5;
  }

  /** Pull play back for an offside: free kick (restart) to the defending side. */
  private awardOffside(offsideTeam: 0 | 1): void {
    this.offsideCount++;
    const defTeam = (1 - offsideTeam) as 0 | 1;
    const gk = this.players.find((p) => p.team === defTeam && p.role === "GK")!;
    this.claim(gk);
    if (this.crng.chance(0.5)) {
      this.emit("offside", offsideTeam, undefined, this.vary([`Flag's up — offside.`, `Offside! The run was too early.`, `Caught offside.`]));
    }
  }

  // ---- integration ----

  private integrate(): void {
    // players move toward their targets
    for (const p of this.players) {
      const toTarget = sub(p.target, p.pos);
      const d = len(toTarget);
      if (d > 0.01) {
        const sp = this.effSpeed(p);
        const cap = (p === this.ball.owner ? sp * 0.9 : sp) * DT;
        const stepLen = Math.min(cap, d);
        const dir = norm(toTarget);
        p.pos = clampPitch({
          x: p.pos.x + dir.x * stepLen,
          y: p.pos.y + dir.y * stepLen,
        });
      }
    }

    const b = this.ball;
    if (b.owner) {
      // ball glued just ahead of the carrier, toward goal (at his feet)
      const dir = norm(sub(this.oppGoal(b.owner.team), b.owner.pos));
      b.pos = { x: b.owner.pos.x + dir.x * 0.8, y: b.owner.pos.y + dir.y * 0.8 };
      b.vel = { x: 0, y: 0 };
      b.z = 0;
      b.vz = 0;
    } else {
      b.pos = { x: b.pos.x + b.vel.x * DT, y: b.pos.y + b.vel.y * DT };
      // VERTICAL PHYSICS: gravity acts on the ball; it bounces off the turf. The
      // same rule governs every airborne ball — a lofted pass, a cross, a clipped
      // shot — only the launch velocity differs.
      if (b.z > 0 || b.vz !== 0) {
        b.vz -= GRAVITY * DT;
        b.z += b.vz * DT;
        if (b.z <= 0) {
          b.z = 0;
          b.vz = b.vz < -1.5 ? -b.vz * 0.5 : 0; // bounce (restitution ~0.5) or settle
        }
      }
      // a ball on the ground rolls and slows with friction; high in the air it
      // keeps its pace (light drag only).
      const airborne = b.z > 0.5;
      const decay = airborne ? 0.992 : 0.97 * (2 - this.wx.friction);
      b.vel = { x: b.vel.x * decay, y: b.vel.y * decay };
    }
  }

  /** Give a player clean possession and clear any in-flight shot state. */
  private claim(p: Player): void {
    const b = this.ball;
    b.owner = p;
    b.vel = { x: 0, y: 0 };
    b.pos = { ...p.pos };
    b.shooter = null;
    b.receiver = null;
    b.passer = null;
    b.isShot = false;
    b.shotType = null;
    b.passType = null;
    b.fromCross = false;
    b.cutback = false;
    b.deflected = false;
    b.airTimer = 0;
    b.judged = false;
    b.offsideFlag = null;
    b.lastTeam = p.team;
    this.notePossession(p.team);
  }

  /** Spill the ball loose just in front of goal — a rebound off the keeper or the
   * woodwork that the nearest player (attacker following up, or a defender
   * scrambling clear) reacts to next tick. */
  private looseInBox(attackTeam: 0 | 1): void {
    const b = this.ball;
    const goalX = attackTeam === 0 ? PITCH_LENGTH : 0;
    const dir = attackTeam === 0 ? -1 : 1; // back out from the goal line
    b.owner = null;
    b.shooter = null;
    b.isShot = false;
    b.judged = true;
    b.shotType = null;
    b.passType = null;
    b.fromCross = false;
    b.cutback = false;
    b.deflected = false;
    b.airTimer = 0;
    b.offsideFlag = null;
    b.chance = "rebound";
    b.pos = clampPitch({ x: goalX + dir * (6 + this.rng.range(0, 6)), y: clamp(34 + this.rng.gauss(0, 6), 8, 60) });
    const sp = 3 + this.rng.range(0, 4);
    const ang = this.rng.range(0, Math.PI * 2);
    b.vel = { x: Math.cos(ang) * sp, y: Math.sin(ang) * sp };
    b.lastTeam = attackTeam;
    b.cooldown = 0.1;
  }

  private resolveLooseBall(): void {
    const b = this.ball;
    if (b.cooldown > 0) return;
    // a lofted/chipped pass is in the air: it flies over the ground press and
    // can't be cut out until it comes down
    if (b.airTimer > 0) return;
    const segStart: Vec = { x: b.pos.x - b.vel.x * DT, y: b.pos.y - b.vel.y * DT };

    // (1) A shot nearing the goal: the defending keeper gets FIRST chance to
    // save it — ahead of any outfield defender standing on the line — so on-
    // target shots aren't waved in untouched.
    if (b.isShot && b.shooter && !b.judged) {
      const shooter = b.shooter;
      const defGoalX = shooter.team === 0 ? PITCH_LENGTH : 0;
      const nearGoal = Math.abs(b.pos.x - defGoalX) < 11;
      const gk = this.players.find(
        (p) => p.role === "GK" && p.team !== shooter.team,
      );
      if (nearGoal && gk && segDist(gk.pos, segStart, b.pos) < 4.6) {
        // on target = the shot's projected crossing point is between the posts
        // AND under the bar — a ball sailing over isn't a save, it's a miss.
        const onTarget = b.aimY > GOAL_Y_MIN && b.aimY < GOAL_Y_MAX && b.aimZ < CROSSBAR;
        if (onTarget) {
          b.judged = true;
          const corner = Math.min(1, Math.abs(b.pos.y - 34) / 3.66);
          const ga = gk.attrs;
          const saveSkill = ga.reflexes * 0.5 + ga.handling * 0.3 + ga.oneOnOnes * 0.2;
          let saveProb = Math.max(
            0.15,
            Math.min(0.94, (0.42 + saveSkill / 40) * (1 - 0.3 * corner) * this.sharp(gk)),
          );
          // a chip beats a keeper caught off his line; if he's home it's easy
          if (b.shotType === "chip") {
            const keeperOff = Math.abs(gk.pos.x - (gk.team === 0 ? 0 : PITCH_LENGTH));
            saveProb = keeperOff > 4 ? saveProb * 0.4 : Math.min(0.95, saveProb * 1.15);
          }
          if (b.deflected) saveProb *= 0.78; // slightly wrong-footed by the deflection
          if (this.rng.chance(saveProb)) {
            this.shotsOnTarget[shooter.team]++; // on target and saved
            shooter.stat.sot++;
            gk.stat.saves++;
            this.shotOutcomes.saved++;
            this.emit("save", gk.team, gk.name, this.vary([`...and ${gk.name} saves!`, `Great stop by ${gk.name}!`, `${gk.name} keeps it out!`, `Saved by ${gk.name}!`]));
            // the keeper parries behind for a corner, holds it, or can only push
            // it back into a dangerous area — a loose rebound to follow up.
            const r = this.rng.next();
            if (r < 0.5) this.concedeCorner(shooter.team);
            else if (r < 0.66) this.looseInBox(shooter.team);
            else this.claim(gk);
            return;
          }
          // not saved → goal-bound, but it may crash off the WOODWORK — emergent
          // from the aim: a shot aimed near a post/the bar clips the frame far
          // more often than one struck down the middle.
          const nearPost = Math.min(Math.abs(b.aimY - GOAL_Y_MIN), Math.abs(b.aimY - GOAL_Y_MAX));
          const woodP = clamp(0.008, 0.12, 0.11 * (1 - nearPost / 2.2));
          if (this.rng.chance(woodP)) {
            this.shotOutcomes.woodwork++;
            this.emit("shot_off", shooter.team, shooter.name, this.vary([`...off the post!`, `...off the crossbar!`, `It rattles the woodwork!`, `Off the upright!`]));
            if (this.rng.chance(0.5)) {
              this.looseInBox(shooter.team); // rebounds back into play
            } else if (this.rng.chance(0.45)) {
              this.concedeCorner(shooter.team); // deflects behind
            } else {
              b.isShot = false; b.shooter = null;
              this.deadBall(false, shooter.team, gk.team); // bounces clear → goal kick
            }
            return;
          }
          // else: beaten — the goal is recorded (and counted) at the line
          return;
        }
      }
    }

    let claimant: Player | null = null;
    let bd = Infinity;
    for (const p of this.players) {
      const reach = p.role === "GK" ? 4.6 : 1.4;
      const d = segDist(p.pos, segStart, b.pos);
      if (d < reach && d < bd) {
        bd = d;
        claimant = p;
      }
    }
    if (!claimant) return;

    const fromOpponent = b.lastTeam !== null && b.lastTeam !== claimant.team;

    // (1a) OFFSIDE: if a flagged attacker is first to the ball, blow it up; if a
    // defender gets there first, wave play on (advantage).
    if (b.offsideFlag !== null) {
      if (claimant.team === b.offsideFlag) {
        this.awardOffside(b.offsideFlag);
        return;
      }
      b.offsideFlag = null;
    }

    // (1a-ii) A cut-back has reached a team-mate at the top of the box: he hits
    // it first time (a prime midfield/winger chance). The cut-back is AIMED at the
    // arriving runner (usually a late midfielder), so let HIM finish it rather than
    // whoever is merely nearest — otherwise the central striker hoovers up every
    // cut-back and midfield never scores. Falls back to the claimant if the
    // intended runner isn't actually there to meet it.
    if (b.cutback) {
      b.cutback = false;
      const runner =
        b.receiver && b.receiver.team === claimant.team && b.receiver.role !== "GK" && dist(b.receiver.pos, b.pos) < 6
          ? b.receiver
          : claimant;
      const goal = this.oppGoal(runner.team);
      if (!fromOpponent && runner.role !== "GK" && dist(runner.pos, goal) < 23) {
        if (b.passer && b.passer.team === runner.team && b.passer !== runner) {
          b.passer.stat.passC++;
          b.passer.stat.keyPasses++;
          runner.assistFrom = b.passer; // credit the cut-back as an assist
        }
        this.shoot(runner, this.chooseShotType(runner, dist(runner.pos, goal), 5), "cutback");
        return;
      }
      // otherwise a defender cuts it out — falls through to normal control
    }

    // (1b) A cross has come down: contest it. An attacker who wins the aerial
    // duel heads at goal; otherwise a defender heads it clear. Most crosses are
    // cleared — exactly as in real football.
    if (b.fromCross) {
      b.fromCross = false;
      if (!fromOpponent && claimant.role !== "GK" && this.inBoxAttacking(claimant)) {
        const def = this.nearestOutfield((1 - claimant.team) as 0 | 1, claimant.pos);
        const ca = claimant.attrs;
        const att = ca.heading * 0.55 + ca.jumpingReach * 0.3 + ca.bravery * 0.15;
        // even UNMARKED, connecting cleanly with a cross scales with aerial
        // ability — a great header attacks it, a poor one mistimes the leap or
        // glances it wide (no flat 80%). Centred so a typical box forward still
        // wins ~0.8, scaling smoothly up and down with quality, no hard cap.
        let winProb = att / (att + 3.2);
        if (def && dist(def.pos, claimant.pos) < 4) {
          const da = def.attrs;
          const dAer = da.heading * 0.45 + da.jumpingReach * 0.3 + da.marking * 0.25;
          winProb = att / (att + dAer);
        }
        if (this.rng.chance(winProb)) {
          this.shoot(claimant, "header", b.chance === "setpiece" ? "setpiece" : "cross"); // won the header
          return;
        }
        if (def) {
          // defender heads it clear — sometimes only as far as a corner
          if (this.rng.chance(0.3)) this.concedeCorner(claimant.team);
          else this.claim(def);
          return;
        }
      }
      // otherwise dealt with by the keeper/defender below (a clearance)
    }

    // (2) An outfield defender in the line of the shot: he BLOCKS it cleanly,
    // it DEFLECTS off him (changing direction — a real, common event that
    // wrong-foots the keeper, flies wide, or wickedly loops in), or it flies past.
    if (b.isShot && b.shooter && b.shooter.team !== claimant.team) {
      // HANDBALL: a defender flinging himself in the way sometimes blocks it with
      // an arm — a penalty in HIS OWN box (and occasionally a booking).
      const ownGoalX = claimant.team === 0 ? 0 : PITCH_LENGTH;
      const inOwnBox = Math.abs(claimant.pos.x - ownGoalX) < 16.5 && Math.abs(claimant.pos.y - 34) < 20.16;
      if (claimant.role !== "GK" && inOwnBox && this.rng.chance(0.003)) {
        this.handballs++;
        this.emit("penalty", claimant.team, claimant.name, `Handball by ${claimant.name}! The referee points to the spot...`);
        if (!claimant.yellow && this.rng.chance(0.3)) { claimant.yellow = true; this.yellowCards++; }
        this.awardPenalty(b.shooter.team);
        return;
      }
      // block vs deflection vs flies-past. (These are flat per-tick rates by
      // design: a shot is exposed to a defender over several ticks, so the rate
      // compounds into the realistic ~25% blocked — a single emergent formula
      // here destabilises that. The shot's PATH after a deflection, however, IS
      // emergent below.)
      const r = this.rng.next();
      if (r < 0.12) {
        claimant.stat.blocks++;
        this.shotOutcomes.blocked++;
        this.emit("block", claimant.team, claimant.name, this.vary([`...blocked by ${claimant.name}!`, `${claimant.name} throws himself in front of it!`, `Blocked!`]));
        if (this.rng.chance(0.55) && b.shooter) this.concedeCorner(b.shooter.team);
        else this.claim(claimant);
        return;
      }
      if (r < 0.155) {
        // DEFLECTION: ricochet off the defender sends it on a new path — usually
        // wide (a corner), occasionally wrong-footing the keeper or wickedly
        // looping in, and rarely turned into his own net.
        this.deflections++;
        const gx = b.shooter.team === 0 ? PITCH_LENGTH : 0;
        const wobble = this.rng.gauss(0, 7.5); // big spread → most deflections go wide
        const newAim = clamp(b.aimY + wobble, 18, 50);
        const wasOff = b.aimY <= GOAL_Y_MIN || b.aimY >= GOAL_Y_MAX;
        const nowOn = newAim > GOAL_Y_MIN && newAim < GOAL_Y_MAX;
        b.aimY = newAim;
        const sp = Math.max(8, len(b.vel) * 0.85);
        const nd = norm(sub({ x: gx, y: newAim }, b.pos));
        b.vel = { x: nd.x * sp, y: nd.y * sp };
        b.judged = false;
        // a wayward effort turned IN off the defender is an own goal (rare); an
        // on-target deflection stays the shooter's (credited deflected).
        b.chance = wasOff && nowOn && this.rng.chance(0.35) ? "owngoal" : "deflected";
        b.deflected = true;
        this.emit("shot", claimant.team, claimant.name, this.vary([`Deflection off ${claimant.name}!`, `It takes a wicked deflection!`, `Off ${claimant.name} — the keeper's wrong-footed!`]));
        return;
      }
      return;
    }
    // a LIVE shot is not "controllable" by a nearby player — it flies on to the
    // keeper / goal / wide. (Without this, bodies in the box silently absorbed
    // ~60% of shots, so almost nothing reached goal = far too few on target.)
    if (b.isShot) return;

    // open-play loose ball (pass, clearance, deflection): first touch / handling.
    // A tight defender and tired legs both make a clean first touch harder — a
    // heavy touch spills it loose (the ball simply isn't claimed this tick).
    const ca = claimant.attrs;
    const controlAttr =
      claimant.role === "GK" ? ca.handling : (ca.firstTouch + ca.technique) / 2;
    let controlProb = (0.56 + controlAttr / 45) * this.sharp(claimant);
    if (claimant.role !== "GK") {
      const presser = this.nearestOutfield((1 - claimant.team) as 0 | 1, b.pos);
      if (presser && dist(presser.pos, b.pos) < 2.5) {
        controlProb *= 0.78 + (ca.composure / 20) * 0.12; // composed under pressure
      }
    }
    // intercepting an opponent's pass cleanly is harder than collecting your
    // own — this keeps possession with the passing side. A SAFE pass from a
    // low-directness (possession) side is harder to pick off than a risky direct
    // ball, so possession styles actually keep the ball and stay competitive
    // (balanced D=0.5 → ~0.55, unchanged; tiki-taka ~0.48; route-one ~0.62).
    if (b.lastTeam !== null && b.lastTeam !== claimant.team) {
      controlProb *= 0.45 + this.directness(b.lastTeam) * 0.2;
    } else if (b.passer && b.passer !== claimant) {
      // a well-weighted ball from a good passer is easier to control and keep —
      // so a world-class passer's side retains possession better (and losing him
      // means more giveaways). Centred so the average passer is neutral.
      controlProb *= 0.9 + b.passer.attrs.passing / 170;
    }
    controlProb = clamp(controlProb, 0.15, 0.95);
    if (!this.rng.chance(controlProb)) return;
    const completedPass = b.lastTeam === claimant.team;
    const passer = b.passer;
    const wasKey = b.passType === "through" || b.fromCross;
    this.claim(claimant);
    if (completedPass) {
      this.passesComp[claimant.team]++;
      if (passer && passer !== claimant) {
        passer.stat.passC++;
        claimant.assistFrom = passer; // remember who fed me (for assists)
        // a key pass = a through ball / cross that finds a teammate in the final third
        if (wasKey && this.inFinalThird(claimant)) passer.stat.keyPasses++;
        // CREATIVITY: a defence-splitting through ball from a high-vision passer
        // RELEASES the runner — a yard of space, a clean look at goal. This is
        // how a world-class playmaker (vision/passing) actually creates chances,
        // so removing him noticeably reduces the side's quality chances.
        if (
          b.passType === "through" &&
          this.inFinalThird(claimant) &&
          claimant.role !== "GK"
        ) {
          const craft = passer.attrs.vision * 0.5 + passer.attrs.passing * 0.5;
          // OFFSIDE TRAP — the risk half of the gamble. A high trap kills most
          // runs (offsides won, handled by the flag), but a ball that BEATS it
          // leaves the back line caught upfield: the runner is sprung clean
          // through far more often, scaled by his pace/anticipation/off-the-ball
          // (does he time and win the run?). High risk to match the high reward.
          const defTeam = (1 - claimant.team) as 0 | 1;
          const trap = this.tac(defTeam).offsideTrap;
          const ra = claimant.attrs;
          const runner = (ra.pace * 0.4 + ra.offTheBall * 0.4 + ra.anticipation * 0.2) / 20;
          const springP = craft / 34 + trap * runner * 0.45;
          if (this.rng.chance(springP)) {
            claimant.dribbleTimer = trap > 0.35 ? 1.7 : 1.1; // clean through if the trap is beaten
            if (trap > 0.35) {
              // the back line stepped up and got caught the wrong side — drop the
              // nearest covering defender behind the runner so it's a real 1-on-1
              const cover = this.nearestOutfield(defTeam, claimant.pos);
              if (cover && cover.role !== "GK") {
                const back = norm(sub(this.oppGoal(claimant.team), claimant.pos));
                cover.pos = clampPitch({ x: claimant.pos.x - back.x * 6, y: claimant.pos.y - back.y * 6 });
                cover.target = { ...cover.pos };
              }
            }
          }
        }
      }
    }
    if (fromOpponent && this.inFinalThird(claimant)) {
      this.emit(
        "interception",
        claimant.team,
        claimant.name,
        `${claimant.name} intercepts in a dangerous area.`,
      );
    }
  }

  private checkBounds(): void {
    const b = this.ball;
    if (b.owner) return;

    // behind a goal line — only a shot can become a goal; anything else is a
    // goal kick (open-play balls don't trickle in)
    if (b.pos.x <= 0) {
      if (b.isShot && b.shooter?.team === 1 && b.pos.y >= GOAL_Y_MIN && b.pos.y <= GOAL_Y_MAX && b.aimZ < CROSSBAR) {
        this.scoreGoal(1);
      } else {
        this.deadBall(b.isShot, 1, 0);
      }
      return;
    }
    if (b.pos.x >= PITCH_LENGTH) {
      if (b.isShot && b.shooter?.team === 0 && b.pos.y >= GOAL_Y_MIN && b.pos.y <= GOAL_Y_MAX && b.aimZ < CROSSBAR) {
        this.scoreGoal(0);
      } else {
        this.deadBall(b.isShot, 0, 1);
      }
      return;
    }

    // touchlines -> throw-in to the side that didn't put it out
    if (b.pos.y <= 0 || b.pos.y >= PITCH_WIDTH) {
      const toTeam = (b.lastTeam === 0 ? 1 : 0) as 0 | 1;
      b.pos.y = b.pos.y <= 0 ? 0.5 : PITCH_WIDTH - 0.5;
      const taker = this.nearestOutfield(toTeam, b.pos);
      if (taker) {
        b.owner = taker;
        b.pos = { ...taker.pos };
      }
      b.vel = { x: 0, y: 0 };
      b.isShot = false;
      b.shooter = null;
      b.lastTeam = toTeam;
    }
  }

  /**
   * Ball went behind the goal line but missed: a shot becomes a miss (and a
   * goal kick), anything else is just a goal kick to the defending side.
   * @param wasShot whether the dead ball resulted from a shot
   * @param attackTeam team that played the ball out (attacking)
   * @param defTeam defending team that restarts with a goal kick
   */
  private deadBall(wasShot: boolean, attackTeam: 0 | 1, defTeam: 0 | 1): void {
    const b = this.ball;
    if (wasShot && b.shooter) {
      // distinguish a ball sailing over the bar from one dragged wide (emergent
      // from the shot's projected height) — and narrate it accordingly
      const overBar = b.aimZ >= CROSSBAR;
      this.shotOutcomes.offtarget++;
      if (overBar) this.shotOutcomes.over++;
      this.emit(
        "shot_off",
        attackTeam,
        b.shooter.name,
        overBar
          ? this.vary([`...over the bar!`, `${b.shooter.name} skies it!`, `...high over the top!`, `He leans back and blazes it over!`])
          : this.vary([`...just wide!`, `...off target.`, `${b.shooter.name} drags it wide.`, `...whistles past the post!`, `So close!`]),
      );
      // an off-target effort is sometimes deflected behind off a defender — a
      // corner, not a goal kick (a real-world source of corners)
      if (this.rng.chance(0.15)) {
        this.concedeCorner(attackTeam);
        return;
      }
    }
    const gk = this.players.find((p) => p.team === defTeam && p.role === "GK")!;
    b.owner = gk;
    b.pos = { ...gk.pos };
    b.vel = { x: 0, y: 0 };
    b.isShot = false;
    b.shooter = null;
    b.lastTeam = defTeam;
  }

  private scoreGoal(team: 0 | 1): void {
    this.score[team]++;
    this.shotsOnTarget[team]++; // a goal is, by definition, on target
    this.goalsByChance[this.ball.chance]++;
    if (this.ball.shotType) this.goalsByShot[this.ball.shotType]++;
    this.shotOutcomes.goal++;
    const shooter = this.ball.shooter;
    // an own goal (a wayward effort turned in off a defender) counts for the
    // attacking team but is NOT credited to the shooter as a goal.
    if (this.ball.chance === "owngoal") {
      this.ownGoals++;
      this.emit("goal", team, undefined, this.vary([`OWN GOAL! It's turned into his own net — ${this.shortName(team)} benefit!`, `Off the defender and in — an own goal for ${this.shortName(team)}!`]));
    } else {
      const scorer = shooter?.name ?? "Unknown";
      if (shooter) {
        shooter.stat.goals++;
        shooter.stat.sot++;
        const assister = shooter.assistFrom;
        if (assister && assister.team === team && assister !== shooter) assister.stat.assists++;
      }
      this.emit("goal", team, scorer, this.vary([`GOAL! ${scorer} scores for ${this.shortName(team)}!`, `${scorer} finds the net — GOAL for ${this.shortName(team)}!`, `It's there! ${scorer} scores!`, `GOAL!! ${scorer} makes it count for ${this.shortName(team)}!`]));
    }
    // leave the ball in the net and hold briefly so the goal is seen / captured
    // for replay, then kick off
    this.ball.owner = null;
    this.ball.vel = { x: 0, y: 0 };
    this.ball.isShot = false;
    this.celebrateTimer = 2.4;
    this.celebrateScorer = shooter ?? null;
    this.pendingKickoff = (1 - team) as 0 | 1;
    // a goal swings momentum: the scorers ride it, the conceders are rocked
    const opp = (1 - team) as 0 | 1;
    this.momentum[team] = clamp(this.momentum[team] + 0.4, -1, 1);
    this.momentum[opp] = clamp(this.momentum[opp] - 0.4, -1, 1);
  }

  /** Brief goal celebration: the scorer wheels away toward the corner and his
   * team-mates chase to mob him, while the ball stays in the net. */
  private celebrationMove(): void {
    const team = this.celebrateScorer ? this.celebrateScorer.team : ((1 - this.pendingKickoff) as 0 | 1);
    const scorer = this.celebrateScorer;
    const goal = this.oppGoal(team);
    // run off toward the nearer corner flag of the goal just scored at
    const cornerY = (scorer ? scorer.pos.y : 34) < 34 ? 6 : PITCH_WIDTH - 6;
    const runTo: Vec = { x: goal.x - (team === 0 ? 18 : -18), y: cornerY };
    for (const p of this.players) {
      if (p.team !== team || p.role === "GK") continue;
      const tgt = p === scorer ? runTo : scorer ? scorer.pos : runTo;
      const to = sub(tgt, p.pos);
      const d = len(to);
      if (d > 1) {
        const dir = norm(to);
        const stepLen = Math.min(this.effSpeed(p) * DT * 0.9, d);
        p.pos = clampPitch({ x: p.pos.x + dir.x * stepLen, y: p.pos.y + dir.y * stepLen });
      }
    }
  }

  private shortName(team: 0 | 1): string {
    return team === 0 ? this.home.short : this.away.short;
  }

  private emit(
    type: MatchEventType,
    team: 0 | 1 | undefined,
    playerName: string | undefined,
    text: string,
  ): void {
    this.events.push({
      minute: Math.min(90, Math.floor(this.time / 60)),
      type,
      team: team,
      playerName,
      text,
    });
  }

  /** Pick a commentary line (uses the commentary RNG, never the sim RNG). */
  private vary(opts: string[]): string {
    return this.crng.pick(opts);
  }

  /** Occasional build-up commentary while a team holds the ball in attack. */
  private narrateBuildup(): void {
    const o = this.ball.owner;
    if (!o) return;
    this.buildupTimer -= DT;
    if (this.buildupTimer > 0) return;
    this.buildupTimer = this.crng.range(10, 16);
    if (o.role === "GK") return;
    const inAttHalf = o.team === 0 ? o.pos.x > 52.5 : o.pos.x < 52.5;
    if (!inAttHalf) return;
    const tn = o.team === 0 ? this.home.short : this.away.short;
    const flank = o.pos.y > 45 ? "down the left" : o.pos.y < 23 ? "down the right" : "through the middle";
    this.emit(
      "buildup",
      o.team,
      undefined,
      this.vary([
        `${tn} building ${flank}`,
        `${tn} work it ${flank}`,
        `${tn} probing for an opening`,
        `${o.name} looks for a way through`,
        `${tn} keeping possession`,
      ]),
    );
  }

  // ---- rendering ----

  snapshot(): Snapshot {
    const totPoss = this.possessionTicks[0] + this.possessionTicks[1] || 1;
    const poss0 = Math.round((this.possessionTicks[0] / totPoss) * 100);
    const pa = (i: 0 | 1): number =>
      this.passesAtt[i] === 0
        ? 0
        : Math.round((this.passesComp[i] / this.passesAtt[i]) * 100);
    const fit = (team: 0 | 1): number => {
      const xs = this.players.filter((p) => p.team === team);
      return Math.round((xs.reduce((s, p) => s + p.condition, 0) / xs.length) * 100);
    };
    return {
      time: this.time,
      minute: Math.min(90, Math.floor(this.time / 60)),
      score: [...this.score] as [number, number],
      shots: [...this.shots] as [number, number],
      shotsOnTarget: [...this.shotsOnTarget] as [number, number],
      xg: [Math.round(this.xg[0] * 10) / 10, Math.round(this.xg[1] * 10) / 10],
      possession: [poss0, 100 - poss0],
      passAccuracy: [pa(0), pa(1)],
      fitness: [fit(0), fit(1)],
      finished: this.finished,
      homeShort: this.home.short,
      awayShort: this.away.short,
      homeStyle: this.tactics[0].style,
      awayStyle: this.tactics[1].style,
      weather: this.weather,
      ball: { ...this.ball.pos },
      ballMode: this.celebrateTimer > 0
        ? "goal"
        : this.ball.owner
          ? "dribble"
          : this.ball.isShot
            ? "shot"
            : this.ball.fromCross
              ? "cross"
              : (this.ball.passType ?? "loose"),
      ownerRole: this.ball.owner ? this.ball.owner.role : null,
      players: this.players.map((p) => ({
        x: p.pos.x,
        y: p.pos.y,
        number: p.number,
        name: p.name,
        team: p.team,
        role: p.role,
        color: p.color,
        textColor: p.textColor,
        hasBall: p === this.ball.owner,
        rating: this.playerRating(p),
        goals: p.stat.goals,
        assists: p.stat.assists,
        shots: p.stat.shots,
        fitness: Math.round(p.condition * 100),
        injured: p.injured,
        roleName: p.roleName,
        duty: p.duty,
      })),
      events: this.events,
    };
  }

  /** Live player rating, 4.5–10, FM-style from contributions. */
  private playerRating(p: Player): number {
    const s = p.stat;
    let r = 6.2;
    if (p.role === "GK") {
      const conceded = this.score[1 - p.team];
      r = 6.6 + s.saves * 0.18 - conceded * 0.35;
    } else {
      r +=
        s.goals * 0.9 + s.assists * 0.5 + s.sot * 0.08 + s.keyPasses * 0.12 +
        s.tackles * 0.05 + s.blocks * 0.1;
      if (s.passA >= 8) r += (s.passC / s.passA - 0.78) * 0.8;
    }
    return Math.max(4.5, Math.min(10, Math.round(r * 10) / 10));
  }
}
