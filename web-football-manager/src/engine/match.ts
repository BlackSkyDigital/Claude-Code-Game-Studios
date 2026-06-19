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
  maxSpeed: number; // m/s
}

interface Ball {
  pos: Vec;
  vel: Vec;
  owner: Player | null;
  lastTeam: 0 | 1 | null; // team that last touched it (for interceptions/credit)
  shooter: Player | null; // set while a shot is in flight
  isShot: boolean;
  judged: boolean; // whether the current shot has already been adjudicated
  cooldown: number; // seconds during which the ball cannot be controlled
}

/** Rendering snapshot — everything the view needs, nothing it doesn't. */
export interface Snapshot {
  time: number;
  minute: number;
  score: [number, number];
  shots: [number, number];
  finished: boolean;
  homeShort: string;
  awayShort: string;
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

  time = 0;
  score: [number, number] = [0, 0];
  shots: [number, number] = [0, 0];
  events: MatchEvent[] = [];
  finished = false;

  constructor(home: TeamDef, away: TeamDef, seed = 1) {
    this.home = home;
    this.away = away;
    this.rng = new RNG(seed);
    this.setupPlayers();
    this.ball = {
      pos: { ...CENTER },
      vel: { x: 0, y: 0 },
      owner: null,
      lastTeam: null,
      shooter: null,
      isShot: false,
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
      def.players.forEach((pd, i) => {
        const slot = slots[i]!;
        const base = teamIdx === 0 ? { ...slot.pos } : mirror(slot.pos);
        this.players.push({
          id: id++,
          team: teamIdx,
          name: pd.name,
          number: pd.number,
          role: pd.role,
          attrs: pd.attrs,
          color: def.color,
          textColor: def.textColor,
          pos: { ...base },
          base,
          target: { ...base },
          maxSpeed: 5 + pd.attrs.pace * 0.18,
        });
      });
    }
  }

  private oppGoal(team: 0 | 1): Vec {
    return { x: team === 0 ? PITCH_LENGTH : 0, y: PITCH_WIDTH / 2 };
  }

  private kickoff(kickingTeam: 0 | 1, matchStart: boolean): void {
    for (const p of this.players) p.pos = { ...p.base };
    this.ball.pos = { ...CENTER };
    this.ball.vel = { x: 0, y: 0 };
    this.ball.shooter = null;
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
    exclude?: Player,
  ): Player | null {
    let best: Player | null = null;
    let bd = Infinity;
    for (const p of this.players) {
      if (p.team !== team || p.role === "GK" || p === exclude) continue;
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
    const off = d < 20 ? Math.min(5, (20 - d) * 0.3) : 0;
    const lineOff = Math.min(2, off); // stay close to the line to make saves
    const x = gk.team === 0 ? lineOff : PITCH_LENGTH - lineOff;
    // hug goal centre, shading slightly toward the ball
    const y = Math.max(31.5, Math.min(36.5, 34 + (this.ball.pos.y - 34) * 0.25));
    return { x, y };
  }

  private assignMovement(): void {
    const b = this.ball;
    const possTeam = b.owner ? b.owner.team : null;

    for (const p of this.players) {
      if (p === b.owner) {
        const g = this.oppGoal(p.team);
        p.target = clampPitch({
          x: p.pos.x + norm(sub(g, p.pos)).x * 10,
          y: p.pos.y + norm(sub(g, p.pos)).y * 10,
        });
        continue;
      }
      if (p.role === "GK") {
        p.target = this.gkTarget(p);
        continue;
      }
      const pull = p.team === possTeam ? 0.55 : 0.4;
      p.target = clampPitch({
        x: p.base.x + (b.pos.x - CENTER.x) * pull,
        y: p.base.y + (b.pos.y - CENTER.y) * 0.3,
      });
    }

    if (possTeam !== null && b.owner) {
      // closest defender presses the ball
      const presser = this.nearestOutfield(
        (1 - possTeam) as 0 | 1,
        b.pos,
      );
      if (presser) presser.target = { ...b.pos };
      // a teammate offers a forward passing option
      const goal = this.oppGoal(possTeam);
      const ahead: Vec = {
        x: b.owner.pos.x + norm(sub(goal, b.owner.pos)).x * 16,
        y: b.owner.pos.y < CENTER.y ? b.owner.pos.y + 10 : b.owner.pos.y - 10,
      };
      const support = this.nearestOutfield(possTeam, ahead, b.owner);
      if (support) support.target = clampPitch(ahead);
    } else {
      // loose ball: nearest of each side chases it
      const a = this.nearestOutfield(0, b.pos);
      const c = this.nearestOutfield(1, b.pos);
      if (a) a.target = { ...b.pos };
      if (c) c.target = { ...b.pos };
    }
  }

  private carrierUpdate(): void {
    const owner = this.ball.owner!;

    // continuous tackle pressure from the nearest opponent
    const challenger = this.nearestOutfield(
      (1 - owner.team) as 0 | 1,
      owner.pos,
    );
    if (challenger && dist(challenger.pos, owner.pos) < 1.3 && owner.role !== "GK") {
      const p = Math.max(
        0.005,
        Math.min(0.07, 0.03 * (challenger.attrs.tackling / owner.attrs.control)),
      );
      if (this.rng.chance(p)) {
        this.turnover(challenger, "tackle");
        return;
      }
    }

    // periodic decision: shoot / pass / keep dribbling
    this.decisionTimer -= DT;
    if (this.decisionTimer > 0) return;
    this.decisionTimer = 0.5;

    const goal = this.oppGoal(owner.team);
    const dGoal = dist(owner.pos, goal);
    const pressure = challenger ? dist(challenger.pos, owner.pos) : 99;

    // goalkeepers just distribute the ball upfield
    if (owner.role === "GK") {
      const t = this.bestPassTarget(owner);
      if (t) this.pass(owner, t);
      return;
    }

    // shoot — only from sensible range, and rarely
    if (dGoal < 20) {
      let shotProb = (owner.attrs.shooting / 20) * Math.max(0, 1 - dGoal / 22) * 0.08;
      if (pressure < 3) shotProb *= 0.5;
      if (this.rng.chance(shotProb)) {
        this.shoot(owner);
        return;
      }
    }

    // pass — more likely under pressure
    const target = this.bestPassTarget(owner);
    if (target) {
      const passProb = 0.25 + 0.4 * (1 - Math.min(1, pressure / 6));
      if (this.rng.chance(passProb)) {
        this.pass(owner, target);
        return;
      }
    }
    // otherwise: keep dribbling (movement already aims at goal)
  }

  private bestPassTarget(owner: Player): Player | null {
    const goal = this.oppGoal(owner.team);
    let best: Player | null = null;
    let bestScore = -Infinity;
    for (const p of this.players) {
      if (p.team !== owner.team || p === owner || p.role === "GK") continue;
      const d = dist(owner.pos, p.pos);
      if (d < 4 || d > 45) continue;
      const advancement = dist(owner.pos, goal) - dist(p.pos, goal); // +ve = more advanced
      const opp = this.nearestOutfield((1 - owner.team) as 0 | 1, p.pos);
      const openness = opp ? Math.min(12, dist(opp.pos, p.pos)) : 12;
      const score = advancement * 0.6 + openness * 1.2 - d * 0.1;
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    return best;
  }

  private pass(passer: Player, target: Player): void {
    const d = dist(passer.pos, target.pos);
    const errSd = (1 - passer.attrs.passing / 20) * (3 + d * 0.12);
    const aim: Vec = {
      x: target.pos.x + this.rng.gauss(0, errSd),
      y: target.pos.y + this.rng.gauss(0, errSd),
    };
    const dir = norm(sub(aim, passer.pos));
    const speed = Math.min(24, 13 + d * 0.45);
    this.ball.owner = null;
    this.ball.shooter = null;
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
    const spread =
      (1 - shooter.attrs.shooting / 20) * 5 + 3.5 + dGoal * 0.08 + pressure;
    const aimY = CENTER.y + this.rng.gauss(0, spread);
    const aim: Vec = { x: goal.x, y: aimY };
    const dir = norm(sub(aim, shooter.pos));
    const speed = 22 + shooter.attrs.shooting * 0.3;
    this.ball.owner = null;
    this.ball.shooter = shooter;
    this.ball.isShot = true;
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
        const cap = (p === this.ball.owner ? p.maxSpeed * 0.82 : p.maxSpeed) * DT;
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
      b.vel = { x: b.vel.x * 0.97, y: b.vel.y * 0.97 }; // rolling friction
    }
  }

  /** Give a player clean possession and clear any in-flight shot state. */
  private claim(p: Player): void {
    const b = this.ball;
    b.owner = p;
    b.vel = { x: 0, y: 0 };
    b.pos = { ...p.pos };
    b.shooter = null;
    b.isShot = false;
    b.judged = false;
    b.lastTeam = p.team;
  }

  private resolveLooseBall(): void {
    const b = this.ball;
    if (b.cooldown > 0) return;
    const segStart: Vec = { x: b.pos.x - b.vel.x * DT, y: b.pos.y - b.vel.y * DT };
    let claimant: Player | null = null;
    let bd = Infinity;
    for (const p of this.players) {
      // keepers reach across the goalmouth; outfielders only what's near them
      const reach = p.role === "GK" ? 4 : 1.4;
      const d = segDist(p.pos, segStart, b.pos);
      if (d < reach && d < bd) {
        bd = d;
        claimant = p;
      }
    }
    if (!claimant) return;

    const fromOpponent = b.lastTeam !== null && b.lastTeam !== claimant.team;
    const isOppShot = b.isShot && b.shooter != null && b.shooter.team !== claimant.team;

    if (isOppShot) {
      if (claimant.role === "GK") {
        if (b.judged) return; // already beaten this shot
        const onTarget = b.pos.y > GOAL_Y_MIN - 0.3 && b.pos.y < GOAL_Y_MAX + 0.3;
        if (!onTarget) return; // wide — let it run out for a goal kick
        b.judged = true;
        const corner = Math.min(1, Math.abs(b.pos.y - 34) / 3.66);
        const saveProb = Math.max(
          0.2,
          Math.min(0.95, (0.62 + claimant.attrs.control / 40) * (1 - 0.3 * corner)),
        );
        if (!this.rng.chance(saveProb)) return; // beaten — ball runs into the net
        this.claim(claimant);
        this.emit("save", claimant.team, claimant.name, `${claimant.name} saves it!`);
        return;
      }
      // an outfield defender's body might block it, but never consumes the
      // keeper's save chance — if no block, the shot runs on
      if (this.rng.chance(0.18)) {
        this.claim(claimant);
        this.emit("save", claimant.team, claimant.name, `${claimant.name} blocks it!`);
      }
      return;
    }

    // open-play loose ball (pass, clearance, deflection)
    const controlProb = 0.55 + claimant.attrs.control / 50;
    if (!this.rng.chance(controlProb)) return;
    this.claim(claimant);
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
    return {
      time: this.time,
      minute: Math.min(90, Math.floor(this.time / 60)),
      score: [...this.score] as [number, number],
      shots: [...this.shots] as [number, number],
      finished: this.finished,
      homeShort: this.home.short,
      awayShort: this.away.short,
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
