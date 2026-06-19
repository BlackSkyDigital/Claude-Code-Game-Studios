import { RNG } from "./rng.js";
import { FORMATIONS, mirror, type Slot } from "./formations.js";
import {
  GOAL_Y_MAX,
  GOAL_Y_MIN,
  PITCH_LENGTH,
  PITCH_WIDTH,
  type Attrs,
  type MatchEvent,
  type MatchEventType,
  type Role,
  type TeamDef,
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
  weather?: Weather;
  neutral?: boolean;
}

const DT = 0.1; // simulation seconds per step
const HALF_SECONDS = 45 * 60;
const FULL_SECONDS = 90 * 60;
const CENTER: Vec = { x: PITCH_LENGTH / 2, y: PITCH_WIDTH / 2 };

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
}

interface Ball {
  pos: Vec;
  vel: Vec;
  owner: Player | null;
  lastTeam: 0 | 1 | null; // team that last touched it (for interceptions/credit)
  shooter: Player | null; // set while a shot is in flight
  receiver: Player | null; // intended target of an in-flight pass (runs onto it)
  isShot: boolean;
  aimY: number; // projected crossing point of the current shot (for on-target)
  judged: boolean; // whether the current shot has already been adjudicated
  cooldown: number; // seconds during which the ball cannot be controlled
}

/** Rendering snapshot — everything the view needs, nothing it doesn't. */
export interface Snapshot {
  time: number;
  minute: number;
  score: [number, number];
  shots: [number, number];
  shotsOnTarget: [number, number];
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
  players: {
    x: number;
    y: number;
    number: number;
    color: string;
    textColor: string;
    hasBall: boolean;
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

export class Match {
  readonly home: TeamDef;
  readonly away: TeamDef;
  private rng: RNG;
  private players: Player[] = [];
  private ball: Ball;
  private decisionTimer = 0;
  private startedSecondHalf = false;
  private tactics: [TeamTactics, TeamTactics];
  private weather: Weather;
  private wx: WeatherMods;
  private edge: HomeEdge;

  time = 0;
  score: [number, number] = [0, 0];
  shots: [number, number] = [0, 0];
  shotsOnTarget: [number, number] = [0, 0];
  possessionTicks: [number, number] = [0, 0];
  passesAtt: [number, number] = [0, 0];
  passesComp: [number, number] = [0, 0];
  events: MatchEvent[] = [];
  finished = false;

  constructor(home: TeamDef, away: TeamDef, seed = 1, setup: MatchSetup = {}) {
    this.home = home;
    this.away = away;
    this.rng = new RNG(seed);
    this.tactics = [
      setup.homeTactics ?? tacticsForStyle("balanced"),
      setup.awayTactics ?? tacticsForStyle("balanced"),
    ];
    this.weather = setup.weather ?? "clear";
    this.wx = weatherMods(this.weather);
    this.edge = homeEdge(setup.neutral ?? false);
    this.setupPlayers();
    this.ball = {
      pos: { ...CENTER },
      vel: { x: 0, y: 0 },
      owner: null,
      lastTeam: null,
      shooter: null,
      receiver: null,
      isShot: false,
      aimY: 34,
      judged: false,
      cooldown: 0,
    };
    this.kickoff(0, true);
  }

  // ---- setup ----

  private setupPlayers(): void {
    let id = 0;
    for (const teamIdx of [0, 1] as const) {
      const def = teamIdx === 0 ? this.home : this.away;
      const slots: Slot[] = FORMATIONS[def.formation] ?? FORMATIONS["4-3-3"]!;
      // away side starts marginally more fatigued from travel (home advantage)
      const startCond = teamIdx === 0 ? 1.0 : 1.0 - this.edge.awayTravelPenalty;
      def.players.forEach((pd, i) => {
        const slot = slots[i]!;
        const base = teamIdx === 0 ? { ...slot.pos } : mirror(slot.pos);
        const a = pd.attrs;
        this.players.push({
          id: id++,
          team: teamIdx,
          name: pd.name,
          number: pd.number,
          role: pd.role,
          attrs: a,
          color: def.color,
          textColor: def.textColor,
          pos: { ...base },
          base,
          target: { ...base },
          // speed blends pace (top speed) and acceleration
          baseSpeed: 4.6 + ((a.pace + a.acceleration) / 2) * 0.19,
          condition: startCond,
        });
      });
    }
  }

  private oppGoal(team: 0 | 1): Vec {
    return { x: team === 0 ? PITCH_LENGTH : 0, y: PITCH_WIDTH / 2 };
  }

  // ---- condition / tactics helpers ----

  private tac(team: 0 | 1): TeamTactics {
    return this.tactics[team];
  }

  /** Current top speed, reduced by fatigue. */
  private effSpeed(p: Player): number {
    return p.baseSpeed * (0.62 + 0.38 * p.condition);
  }

  /** Execution sharpness 0..~1.1 — fatigue lowers it, home advantage lifts it. */
  private sharp(p: Player): number {
    const homeBoost = p.team === 0 ? this.edge.homeSharpness : 1;
    return (0.7 + 0.3 * p.condition) * homeBoost;
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

  private kickoff(kickingTeam: 0 | 1, matchStart: boolean): void {
    for (const p of this.players) p.pos = { ...p.base };
    this.ball.pos = { ...CENTER };
    this.ball.vel = { x: 0, y: 0 };
    this.ball.shooter = null;
    this.ball.receiver = null;
    this.ball.isShot = false;
    this.ball.cooldown = 0;
    this.ball.lastTeam = kickingTeam;
    // give the ball to a central player of the kicking team
    const central = this.players
      .filter((p) => p.team === kickingTeam && p.role !== "GK")
      .sort((a, b) => dist(a.base, CENTER) - dist(b.base, CENTER))[0]!;
    this.ball.owner = central;
    if (matchStart) {
      this.emit("kickoff", undefined, undefined, "Kick-off!");
    }
  }

  // ---- main step ----

  step(): void {
    if (this.finished) return;
    this.time += DT;
    if (this.ball.cooldown > 0) this.ball.cooldown -= DT;
    if (this.ball.owner) this.possessionTicks[this.ball.owner.team]++;
    this.updateFatigue();

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
    // Stay near the line, narrowing the angle by coming out as the ball nears.
    const ownGoalX = gk.team === 0 ? 0 : PITCH_LENGTH;
    const d = Math.abs(this.ball.pos.x - ownGoalX);
    // Always a couple of metres off the line (so the keeper never renders
    // behind the goal and can still reach shots), edging out as the ball nears.
    const off = d < 10 ? Math.min(3.0, 2.2 + (10 - d) * 0.1) : 2.2;
    const x = gk.team === 0 ? off : PITCH_LENGTH - off;
    // hug goal centre, shading only slightly toward the ball so both posts
    // stay within reach
    const y = Math.max(32, Math.min(36, 34 + (this.ball.pos.y - 34) * 0.12));
    return { x, y };
  }

  private assignMovement(): void {
    const b = this.ball;
    const possTeam = b.owner ? b.owner.team : null;

    for (const p of this.players) {
      if (p === b.owner) {
        const g = this.oppGoal(p.team);
        const d = norm(sub(g, p.pos));
        p.target = clampPitch({ x: p.pos.x + d.x * 10, y: p.pos.y + d.y * 10 });
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
      const line = fwd ? 1.25 : def ? 0.8 : 1.05;
      const pull = (attacking ? 0.5 + 0.12 * t.mentality : 0.42) * line;
      const lineShift = dir * (t.lineHeight - 0.5) * 24;
      const widthFactor = 0.7 + 0.6 * t.width; // narrow .. wide
      // slow, per-player drift so players drift into space individually
      const drift = Math.sin(this.time * 0.45 + p.id * 1.7) * 3;
      const tx = p.base.x + (b.pos.x - CENTER.x) * pull + lineShift;
      const ty =
        CENTER.y + (p.base.y - CENTER.y) * widthFactor + (b.pos.y - CENTER.y) * 0.18 + drift;
      p.target = clampPitch({
        // outfielders never retreat onto their own goal line
        x: dir > 0 ? clamp(tx, 6, PITCH_LENGTH) : clamp(tx, 0, PITCH_LENGTH - 6),
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
      const engageRange = 35 + dT.pressing * 60 + dT.lineHeight * 15;
      const closers = ballDepth < engageRange ? 1 + Math.round(dT.pressing * 2) : 1;
      const pressers: Player[] = [];
      for (let i = 0; i < closers; i++) {
        const d = this.nearestOutfield(defTeam, b.pos, pressers);
        if (!d) break;
        pressers.push(d);
        if (i === 0) {
          d.target = { ...b.pos };
        } else {
          const off = norm(sub(d.pos, b.pos));
          d.target = clampPitch({ x: b.pos.x + off.x * 5, y: b.pos.y + off.y * 5 });
        }
      }
      // Support play: the nearest teammates take up angles around the carrier
      // to form passing triangles (two ahead in the half-spaces, one behind to
      // recycle) — this is what lets possession progress through the thirds.
      const goal = this.oppGoal(possTeam);
      const f = norm(sub(goal, b.owner.pos)); // forward, toward goal
      const rt: Vec = { x: f.y, y: -f.x }; // perpendicular (to the side)
      const slots: Vec[] = [
        { x: b.owner.pos.x + f.x * 16 + rt.x * 11, y: b.owner.pos.y + f.y * 16 + rt.y * 11 },
        { x: b.owner.pos.x + f.x * 16 - rt.x * 11, y: b.owner.pos.y + f.y * 16 - rt.y * 11 },
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
  }

  private carrierUpdate(): void {
    const owner = this.ball.owner!;

    const t = this.tac(owner.team);

    // continuous tackle pressure: a tackling/aggression/strength duel against
    // the carrier's dribbling/balance/composure (sharpness falls with fatigue)
    const challenger = this.nearestOutfield(
      (1 - owner.team) as 0 | 1,
      owner.pos,
    );
    if (challenger && dist(challenger.pos, owner.pos) < 1.3 && owner.role !== "GK") {
      const ca = challenger.attrs;
      const oa = owner.attrs;
      const tackleSkill =
        (ca.tackling + ca.aggression * 0.4 + ca.strength * 0.3) * this.sharp(challenger);
      const retain =
        (oa.dribbling + oa.balance * 0.4 + oa.composure * 0.3) * this.sharp(owner);
      const p = clamp(0.005, 0.08, 0.03 * (tackleSkill / retain));
      if (this.rng.chance(p)) {
        this.turnover(challenger, "tackle");
        return;
      }
    }

    // periodic decision — tempo controls how quickly the carrier acts
    this.decisionTimer -= DT;
    if (this.decisionTimer > 0) return;
    this.decisionTimer = 0.7 - 0.4 * t.tempo;

    const goal = this.oppGoal(owner.team);
    const dGoal = dist(owner.pos, goal);
    // distance to the nearest defender — large = space, small = under pressure
    const space = challenger ? dist(challenger.pos, owner.pos) : 99;

    // goalkeepers just distribute the ball upfield
    if (owner.role === "GK") {
      const tgt = this.bestPassTarget(owner);
      if (tgt) this.pass(owner, tgt);
      return;
    }

    // SHOOT — decisively when in a good position. Quality combines closeness
    // and angle (central is better than tight by the byline); space and the
    // finishing/long-shots attribute scale it up.
    const inRange = dGoal < 20 + this.directness(owner.team) * 4;
    let goodChance = false;
    if (inRange) {
      const shootAttr =
        dGoal < 13
          ? owner.attrs.finishing
          : owner.attrs.finishing * 0.4 + owner.attrs.longShots * 0.6;
      const closeness = Math.max(0, 1 - dGoal / 22);
      const angle = 1 - Math.min(1, Math.abs(owner.pos.y - 34) / (dGoal + 7));
      let shotProb = (0.2 + shootAttr / 22) * closeness * angle * 0.042;
      if (space < 2.5) shotProb *= 0.5; // crowded out
      shotProb *= 0.85 + 0.3 * t.mentality;
      // a clear, close chance in front of goal: take it
      if (dGoal < 7 && angle > 0.75 && space > 4.5) shotProb = Math.max(shotProb, 0.15);
      goodChance = closeness * angle > 0.35;
      if (this.rng.chance(shotProb)) {
        this.shoot(owner);
        return;
      }
    }

    // PASS — likely when pressed or building up, but NOT when we just passed up
    // a good shooting chance (then prefer to shoot/dribble, not recycle it out)
    const target = this.bestPassTarget(owner);
    if (target) {
      let passProb = 0.3 + 0.4 * (1 - Math.min(1, space / 6));
      if (goodChance) passProb *= 0.4;
      if (this.rng.chance(passProb)) {
        this.pass(owner, target);
        return;
      }
    }
    // otherwise: keep dribbling (movement already aims at goal)
  }

  private bestPassTarget(owner: Player): Player | null {
    const goal = this.oppGoal(owner.team);
    const D = this.directness(owner.team); // 0 short/safe .. 1 long/direct
    // direct sides + good vision consider longer passes
    const maxD = 28 + 34 * D + owner.attrs.vision * 0.4;
    let best: Player | null = null;
    let bestScore = -Infinity;
    for (const p of this.players) {
      if (p.team !== owner.team || p === owner || p.role === "GK") continue;
      const d = dist(owner.pos, p.pos);
      if (d < 4 || d > maxD) continue;
      const advancement = dist(owner.pos, goal) - dist(p.pos, goal); // +ve = more advanced
      const opp = this.nearestOutfield((1 - owner.team) as 0 | 1, p.pos);
      const openness = opp ? Math.min(12, dist(opp.pos, p.pos)) : 12;
      // bonus for finding a teammate in a shooting position (through balls /
      // cut-backs) so possession actually turns into chances
      const tgtGoal = dist(p.pos, goal);
      const shootingBonus = tgtGoal < 20 ? (20 - tgtGoal) * 0.9 : 0;
      // direct play prizes progress and tolerates risk/range; possession play
      // prizes keeping the ball — but always value progress over square balls
      const score =
        advancement * (0.7 + 0.7 * D) +
        openness * (1.2 - 0.7 * D) +
        shootingBonus -
        d * (0.12 - 0.06 * D);
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    return best;
  }

  private pass(passer: Player, target: Player): void {
    const d = dist(passer.pos, target.pos);
    const a = passer.attrs;
    const passSkill = a.passing * 0.6 + a.technique * 0.4;
    // accuracy falls with distance, poor weather and fatigue; rises with skill
    const errSd =
      ((1 - passSkill / 20) * (2.4 + d * 0.12)) / this.sharp(passer) + this.wx.passError;
    const aim: Vec = {
      x: target.pos.x + this.rng.gauss(0, errSd),
      y: target.pos.y + this.rng.gauss(0, errSd),
    };
    const dir = norm(sub(aim, passer.pos));
    const speed = Math.min(24, 13 + d * 0.45);
    this.passesAtt[passer.team]++;
    this.ball.owner = null;
    this.ball.shooter = null;
    this.ball.receiver = target; // the receiver will run onto it
    this.ball.isShot = false;
    this.ball.lastTeam = passer.team;
    this.ball.cooldown = 0.2;
    this.ball.vel = { x: dir.x * speed, y: dir.y * speed };
  }

  private shoot(shooter: Player): void {
    const goal = this.oppGoal(shooter.team);
    const dGoal = dist(shooter.pos, goal);
    const challenger = this.nearestOutfield(
      (1 - shooter.team) as 0 | 1,
      shooter.pos,
    );
    const pressure =
      challenger && dist(challenger.pos, shooter.pos) < 3 ? 2.5 : 0;
    const a = shooter.attrs;
    const shootAttr = dGoal < 14 ? a.finishing : a.finishing * 0.4 + a.longShots * 0.6;
    // composure tightens the spread; pressure, distance, weather and fatigue widen it
    let spread = (1 - shootAttr / 20) * 6 + 4.5 + dGoal * 0.12 + pressure + this.wx.shotScatter;
    spread *= 1.2 - a.composure / 50; // composed finishers place it
    spread *= 1 + (1 - shooter.condition) * 0.3; // tired legs scuff it
    const aimY = CENTER.y + this.rng.gauss(0, spread);
    const aim: Vec = { x: goal.x, y: aimY };
    const dir = norm(sub(aim, shooter.pos));
    const speed = 20 + shootAttr * 0.35;
    this.ball.owner = null;
    this.ball.shooter = shooter;
    this.ball.receiver = null;
    this.ball.isShot = true;
    this.ball.aimY = aimY;
    this.ball.judged = false;
    this.ball.lastTeam = shooter.team;
    this.ball.cooldown = 0; // adjudicate the shot immediately, every step
    this.ball.vel = { x: dir.x * speed, y: dir.y * speed };
    this.shots[shooter.team]++;
  }

  private turnover(winner: Player, kind: "tackle" | "interception"): void {
    const inFinalThird = this.inFinalThird(winner);
    this.ball.owner = winner;
    this.ball.vel = { x: 0, y: 0 };
    this.ball.shooter = null;
    this.ball.receiver = null;
    this.ball.isShot = false;
    this.ball.lastTeam = winner.team;
    this.ball.cooldown = 0;
    if (inFinalThird) {
      this.emit(
        kind,
        winner.team,
        winner.name,
        kind === "tackle"
          ? `${winner.name} wins it with a strong tackle.`
          : `${winner.name} reads it and intercepts.`,
      );
    }
  }

  private inFinalThird(p: Player): boolean {
    // is the player in the third nearest the goal they're attacking?
    return p.team === 0 ? p.pos.x > 70 : p.pos.x < 35;
  }

  // ---- integration ----

  private integrate(): void {
    // players move toward their targets
    for (const p of this.players) {
      const toTarget = sub(p.target, p.pos);
      const d = len(toTarget);
      if (d > 0.01) {
        const sp = this.effSpeed(p);
        const cap = (p === this.ball.owner ? sp * 0.82 : sp) * DT;
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
      // ball glued just ahead of the carrier, toward goal
      const dir = norm(sub(this.oppGoal(b.owner.team), b.owner.pos));
      b.pos = { x: b.owner.pos.x + dir.x * 0.8, y: b.owner.pos.y + dir.y * 0.8 };
      b.vel = { x: 0, y: 0 };
    } else {
      b.pos = { x: b.pos.x + b.vel.x * DT, y: b.pos.y + b.vel.y * DT };
      const decay = 0.97 * (2 - this.wx.friction); // wetter/heavier ball slows faster
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
    b.isShot = false;
    b.judged = false;
    b.lastTeam = p.team;
  }

  private resolveLooseBall(): void {
    const b = this.ball;
    if (b.cooldown > 0) return;
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
        const onTarget = b.aimY > GOAL_Y_MIN && b.aimY < GOAL_Y_MAX;
        if (onTarget) {
          b.judged = true;
          const corner = Math.min(1, Math.abs(b.pos.y - 34) / 3.66);
          const ga = gk.attrs;
          const saveSkill = ga.reflexes * 0.5 + ga.handling * 0.3 + ga.oneOnOnes * 0.2;
          const saveProb = Math.max(
            0.2,
            Math.min(0.94, (0.45 + saveSkill / 40) * (1 - 0.3 * corner) * this.sharp(gk)),
          );
          if (this.rng.chance(saveProb)) {
            this.shotsOnTarget[shooter.team]++; // on target and saved
            this.claim(gk);
            this.emit("save", gk.team, gk.name, `${gk.name} saves it!`);
          }
          // if beaten: leave it — the goal is recorded (and counted) at the line
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

    // (2) An outfield defender may block a shot with their body
    if (b.isShot && b.shooter && b.shooter.team !== claimant.team) {
      if (this.rng.chance(0.18)) {
        this.claim(claimant);
        this.emit("save", claimant.team, claimant.name, `${claimant.name} blocks it!`);
      }
      return;
    }

    // open-play loose ball (pass, clearance, deflection): first touch / handling
    const ca = claimant.attrs;
    const controlAttr =
      claimant.role === "GK" ? ca.handling : (ca.firstTouch + ca.technique) / 2;
    let controlProb = 0.5 + controlAttr / 45;
    // intercepting an opponent's pass cleanly is harder than collecting your
    // own — this keeps possession with the passing side more often (realistic
    // ~75-80% completion) rather than constant giveaways
    if (b.lastTeam !== null && b.lastTeam !== claimant.team) controlProb *= 0.55;
    if (!this.rng.chance(controlProb)) return;
    const completedPass = b.lastTeam === claimant.team;
    this.claim(claimant);
    if (completedPass) this.passesComp[claimant.team]++;
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
      if (b.isShot && b.shooter?.team === 1 && b.pos.y >= GOAL_Y_MIN && b.pos.y <= GOAL_Y_MAX) {
        this.scoreGoal(1);
      } else {
        this.deadBall(b.isShot, 1, 0);
      }
      return;
    }
    if (b.pos.x >= PITCH_LENGTH) {
      if (b.isShot && b.shooter?.team === 0 && b.pos.y >= GOAL_Y_MIN && b.pos.y <= GOAL_Y_MAX) {
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
      this.emit(
        "shot_off",
        attackTeam,
        b.shooter.name,
        `${b.shooter.name} fires it just wide.`,
      );
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
    const scorer = this.ball.shooter?.name ?? "Unknown";
    this.emit("goal", team, scorer, `GOAL! ${scorer} scores for ${this.shortName(team)}!`);
    this.kickoff((1 - team) as 0 | 1, false);
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
      players: this.players.map((p) => ({
        x: p.pos.x,
        y: p.pos.y,
        number: p.number,
        color: p.color,
        textColor: p.textColor,
        hasBall: p === this.ball.owner,
      })),
      events: this.events,
    };
  }
}
