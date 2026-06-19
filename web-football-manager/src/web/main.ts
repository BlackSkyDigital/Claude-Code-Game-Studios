import { Match, type Snapshot } from "../engine/match.js";
import { TEAMS } from "../engine/data.js";
import {
  GOAL_Y_MAX,
  GOAL_Y_MIN,
  PITCH_LENGTH,
  PITCH_WIDTH,
} from "../engine/types.js";
import {
  TACTICAL_STYLES,
  styleLabel,
  tacticsForStyle,
  type TacticalStyle,
} from "../engine/tactics.js";
import { WEATHER_TYPES, weatherLabel, type Weather } from "../engine/conditions.js";

// ---- DOM ----
const $ = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const canvas = $<HTMLCanvasElement>("pitch");
const ctx = canvas.getContext("2d")!;
const homeSel = $<HTMLSelectElement>("homeSel");
const awaySel = $<HTMLSelectElement>("awaySel");
const seedInput = $<HTMLInputElement>("seed");
const newBtn = $<HTMLButtonElement>("newBtn");
const playBtn = $<HTMLButtonElement>("playBtn");
const nameHome = $("nameHome");
const nameAway = $("nameAway");
const scoreHome = $("scoreHome");
const scoreAway = $("scoreAway");
const shotsLine = $("shots");
const clockEl = $("clock");
const feed = $("feed");
const stPoss = [$("stPoss0"), $("stPoss1")] as const;
const stShots = [$("stShots0"), $("stShots1")] as const;
const stSot = [$("stSot0"), $("stSot1")] as const;
const stPass = [$("stPass0"), $("stPass1")] as const;
const stFit = [$("stFit0"), $("stFit1")] as const;
const homeStyleSel = $<HTMLSelectElement>("homeStyle");
const awayStyleSel = $<HTMLSelectElement>("awayStyle");
const weatherSel = $<HTMLSelectElement>("weatherSel");
const conditionsLine = $("conditions");
const commNow = $("commNow");
const commPrev = $("commPrev");
const hlSel = $<HTMLSelectElement>("hlMode");
const skipSel = $<HTMLSelectElement>("skipSpeed");
const replayToggleBtn = $<HTMLButtonElement>("replayToggle");
const replayBtn = $<HTMLButtonElement>("replayBtn");
const stXg = [$("stXg0"), $("stXg1")] as const;
const ratingsBox = $("ratings");

// ---- pitch transform (metres -> pixels) ----
const M = 26;
const sx = (canvas.width - 2 * M) / PITCH_LENGTH;
const sy = (canvas.height - 2 * M) / PITCH_WIDTH;
const X = (x: number) => M + x * sx;
const Y = (y: number) => M + y * sy;

// ---- state ----
let match: Match | null = null;
let playing = false;
let timeScale = 6; // SIMULATED seconds per REAL second (frame-rate independent)
let lastFrame = 0;
let acc = 0; // leftover simulated time not yet stepped
let alpha = 1; // interpolation fraction between prev and curr snapshot
let lastEventCount = 0;
const STEP = 0.1; // must match the engine's internal DT

// two snapshots so we can interpolate for smooth, TV-like motion
let prevSnap: Snapshot | null = null;
let currSnap: Snapshot | null = null;

// fading ball trail (pixel coords) so passes/shots read as streaks
const trail: { x: number; y: number; mode: string }[] = [];
// on-pitch event flash (GOAL! / SAVED! / OFF TARGET)
let flash: { text: string; color: string; until: number } | null = null;

// colour the ball trail by what the ball is doing
const MODE_COLOR: Record<string, string> = {
  dribble: "#ffffff",
  feet: "#a7e8ff",
  driven: "#5ec8ff",
  through: "#ffe27a",
  lofted: "#ffc266",
  chip: "#ffc266",
  cross: "#ff9a3c",
  shot: "#ff5a5a",
  goal: "#7ef08a",
  loose: "#cfd8e3",
};
const MODE_LABEL: Record<string, string> = {
  dribble: "On the ball",
  feet: "Pass",
  driven: "Driven pass",
  through: "Through ball",
  lofted: "Lofted ball",
  chip: "Chip",
  cross: "Cross",
  shot: "Shot!",
  goal: "GOAL!",
  loose: "Loose ball",
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const near = (a: number, b: number): boolean => Math.abs(a - b) < 5; // <5m = real move, else a teleport

// ---- highlight modes (FM-style) ----
// The sim runs the whole match. The view fast-forwards until a notable EVENT
// occurs, then plays the passage of play LEADING TO it (build-up -> event) as
// a clip. The mode sets how many events qualify (the importance threshold) —
// NOT how much build-up is shown (every shown highlight includes its build-up).
let highlightMode = "comprehensive";
let skipSpeed = 48; // sim-seconds per real-second while skipping between highlights

// importance level of each event (1 = biggest). A mode shows every event whose
// level is <= its threshold.
const EVENT_LEVEL: Record<string, number> = {
  goal: 1,
  penalty: 1, // a spot kick is always a headline moment
  save: 2, // an on-target chance the keeper had to stop
  block: 2,
  shot: 3,
  shot_off: 3,
  take_on: 3, // a player beating his man is worth seeing
  cross: 4,
  key_pass: 4,
  corner: 4,
  offside: 4,
  interception: 4,
  tackle: 4,
  injury: 4,
};
const MODE_THRESHOLD: Record<string, number> = {
  goals: 1,
  key: 2,
  extended: 3,
  comprehensive: 4,
};

// ---- replay / highlight clips: a rolling buffer of recent snapshots ----
const buffer: Snapshot[] = [];
const BUFFER_MAX = 140; // ~14s at 0.1s — enough to show the build-up to a chance
let replaysOn = true;
let replayClip: Snapshot[] | null = null;
let replayPos = 0; // float index into the clip
let pendingReplay = false; // a goal asked for an extra replay (Full mode)
let clipTrigger = false; // a qualifying event happened this step
let clipCooldown = 0; // sim-steps after a clip before another can trigger
let lastRatingsUpdate = 0;

function fillSelect(sel: HTMLSelectElement, opts: [string, string][]): void {
  sel.innerHTML = "";
  for (const [value, label] of opts) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    sel.appendChild(opt);
  }
}

function fillTeamSelects(): void {
  const teamOpts = TEAMS.map((t, i) => [String(i), t.name] as [string, string]);
  fillSelect(homeSel, teamOpts);
  fillSelect(awaySel, teamOpts);
  homeSel.value = "0";
  awaySel.value = "1";

  const styleOpts = TACTICAL_STYLES.map((s) => [s, styleLabel(s)] as [string, string]);
  fillSelect(homeStyleSel, styleOpts);
  fillSelect(awayStyleSel, styleOpts);
  homeStyleSel.value = "balanced";
  awayStyleSel.value = "balanced";

  fillSelect(weatherSel, WEATHER_TYPES.map((w) => [w, weatherLabel(w)] as [string, string]));
  weatherSel.value = "clear";
}

function newMatch(): void {
  const h = TEAMS[Number(homeSel.value)]!;
  const a = TEAMS[Number(awaySel.value)]!;
  const seed = Number(seedInput.value) || 1;
  match = new Match(h, a, seed, {
    homeTactics: tacticsForStyle(homeStyleSel.value as TacticalStyle),
    awayTactics: tacticsForStyle(awayStyleSel.value as TacticalStyle),
    weather: weatherSel.value as Weather,
  });
  lastEventCount = 0;
  feed.innerHTML = "";
  commNow.textContent = "Kick-off!";
  commPrev.textContent = "";
  trail.length = 0;
  flash = null;
  acc = 0;
  buffer.length = 0;
  replayClip = null;
  pendingReplay = false;
  clipTrigger = false;
  clipCooldown = 0;
  playing = true;
  playBtn.textContent = "Pause";
  nameHome.textContent = h.short;
  nameAway.textContent = a.short;
  currSnap = prevSnap = match.snapshot();
  render();
}

// ---- drawing ----
function drawPitch(): void {
  // mown stripes
  const bands = 12;
  const bandW = (canvas.width - 2 * M) / bands;
  for (let i = 0; i < bands; i++) {
    ctx.fillStyle = i % 2 === 0 ? "#2f8f3f" : "#2a8438";
    ctx.fillRect(M + i * bandW, M, bandW, canvas.height - 2 * M);
  }

  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 2;
  const line = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.beginPath();
    ctx.moveTo(X(x1), Y(y1));
    ctx.lineTo(X(x2), Y(y2));
    ctx.stroke();
  };
  const rect = (x: number, y: number, w: number, h: number) => {
    ctx.strokeRect(X(x), Y(y), w * sx, h * sy);
  };

  // boundary + halfway
  rect(0, 0, PITCH_LENGTH, PITCH_WIDTH);
  line(52.5, 0, 52.5, PITCH_WIDTH);

  // centre circle + spot
  ctx.beginPath();
  ctx.ellipse(X(52.5), Y(34), 9.15 * sx, 9.15 * sy, 0, 0, Math.PI * 2);
  ctx.stroke();
  spot(52.5, 34);

  // penalty + goal areas, both ends
  const cy = 34;
  rect(0, cy - 20.16, 16.5, 40.32);
  rect(0, cy - 9.16, 5.5, 18.32);
  spot(11, 34);
  rect(PITCH_LENGTH - 16.5, cy - 20.16, 16.5, 40.32);
  rect(PITCH_LENGTH - 5.5, cy - 9.16, 5.5, 18.32);
  spot(PITCH_LENGTH - 11, 34);

  // goals
  ctx.lineWidth = 4;
  line(0, GOAL_Y_MIN, 0, GOAL_Y_MAX);
  line(PITCH_LENGTH, GOAL_Y_MIN, PITCH_LENGTH, GOAL_Y_MAX);
  ctx.lineWidth = 2;
}

function spot(x: number, y: number): void {
  ctx.beginPath();
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.arc(X(x), Y(y), 2, 0, Math.PI * 2);
  ctx.fill();
}

function drawPlayer(px: number, py: number, p: Snapshot["players"][number]): void {
  if (p.hasBall) {
    ctx.beginPath();
    ctx.arc(px, py, 12, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,238,90,0.30)";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,238,90,0.9)";
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(px, py, 8.5, 0, Math.PI * 2);
  ctx.fillStyle = p.color;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.stroke();
  ctx.fillStyle = p.textColor;
  ctx.font = "bold 10px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(p.number), px, py);
}

function drawTrail(): void {
  ctx.lineCap = "round";
  for (let i = 1; i < trail.length; i++) {
    const a = trail[i - 1]!;
    const b = trail[i]!;
    if (Math.hypot(b.x - a.x, b.y - a.y) > 55) continue; // skip teleports (kickoff, pickup)
    ctx.globalAlpha = 0.08 + 0.55 * (i / trail.length);
    ctx.strokeStyle = MODE_COLOR[b.mode] ?? "#ffffff";
    ctx.lineWidth = b.mode === "shot" ? 4 : 3;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawFlash(): void {
  if (!flash || performance.now() > flash.until) return;
  const remain = (flash.until - performance.now()) / 1300;
  ctx.globalAlpha = Math.min(1, remain * 1.4);
  ctx.fillStyle = flash.color;
  ctx.font = "bold 34px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(flash.text, canvas.width / 2, M + 40);
  ctx.globalAlpha = 1;
}

/** Draw the pitch + players + ball, interpolated between two snapshots. */
function drawScene(cur: Snapshot, prev: Snapshot, a: number, replay = false): void {
  drawPitch();
  drawTrail();

  for (let i = 0; i < cur.players.length; i++) {
    const cp = cur.players[i]!;
    const pp = prev.players[i] ?? cp;
    const x = near(pp.x, cp.x) ? lerp(pp.x, cp.x, a) : cp.x;
    const y = near(pp.y, cp.y) ? lerp(pp.y, cp.y, a) : cp.y;
    drawPlayer(X(x), Y(y), cp);
  }

  const bx = near(prev.ball.x, cur.ball.x) ? lerp(prev.ball.x, cur.ball.x, a) : cur.ball.x;
  const by = near(prev.ball.y, cur.ball.y) ? lerp(prev.ball.y, cur.ball.y, a) : cur.ball.y;
  const px = X(bx);
  const py = Y(by);
  trail.push({ x: px, y: py, mode: cur.ballMode });
  if (trail.length > 16) trail.shift();
  if (cur.ballMode === "shot" || cur.ballMode === "cross") {
    ctx.beginPath();
    ctx.arc(px, py, 9, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,90,90,0.25)";
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(px, py, 4.5, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "#000";
  ctx.stroke();

  ctx.globalAlpha = 0.85;
  ctx.fillStyle = MODE_COLOR[cur.ballMode] ?? "#fff";
  ctx.font = "bold 12px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(MODE_LABEL[cur.ballMode] ?? "", M + 6, M + 6);
  ctx.globalAlpha = 1;

  if (replay) {
    ctx.fillStyle = "rgba(255,90,90,0.9)";
    ctx.font = "bold 14px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("🔁 REPLAY", canvas.width / 2, M + 6);
  }

  drawTimeline(cur);
}

/** A thin 0–90' incident strip along the bottom with markers. */
function drawTimeline(snap: Snapshot): void {
  const y = canvas.height - M + 8;
  const x0 = M;
  const w = canvas.width - 2 * M;
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x0 + w, y);
  ctx.stroke();
  // progress
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x0 + w * Math.min(1, snap.minute / 90), y);
  ctx.stroke();
  const MARK: Record<string, string> = {
    goal: "#7ef08a", save: "#7ec8ff", block: "#ff8e8e", shot_off: "#ffce5a", shot: "#ffd36a",
  };
  for (const e of snap.events) {
    const c = MARK[e.type];
    if (!c) continue;
    const ex = x0 + w * Math.min(1, e.minute / 90);
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(ex, y, e.type === "goal" ? 4 : 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawReport(snap: Snapshot): void {
  ctx.fillStyle = "rgba(8,12,18,0.86)";
  ctx.fillRect(M + 30, M + 24, canvas.width - 2 * M - 60, canvas.height - 2 * M - 70);
  const cx = canvas.width / 2;
  let yy = M + 60;
  ctx.textAlign = "center";
  ctx.fillStyle = "#f0f6fc";
  ctx.font = "bold 26px system-ui, sans-serif";
  ctx.fillText(`FULL TIME  ${snap.homeShort} ${snap.score[0]} – ${snap.score[1]} ${snap.awayShort}`, cx, yy);
  yy += 30;
  ctx.font = "13px system-ui, sans-serif";
  ctx.fillStyle = "#8b949e";
  ctx.fillText(`Poss ${snap.possession[0]}-${snap.possession[1]}%   ·   Shots ${snap.shots[0]}-${snap.shots[1]}   ·   xG ${snap.xg[0]}-${snap.xg[1]}`, cx, yy);
  yy += 28;
  // top scorers
  const scorers = snap.players.filter((p) => p.goals > 0).sort((a, b) => b.goals - a.goals);
  ctx.fillStyle = "#9af2a6";
  ctx.font = "13px system-ui, sans-serif";
  for (const s of scorers.slice(0, 6)) {
    ctx.fillText(`⚽ ${s.name}${s.goals > 1 ? " ×" + s.goals : ""} (${s.team === 0 ? snap.homeShort : snap.awayShort})`, cx, yy);
    yy += 19;
  }
  yy += 8;
  // top ratings each side
  ctx.fillStyle = "#cfd8e3";
  const top = (t: 0 | 1) =>
    snap.players.filter((p) => p.team === t).sort((a, b) => b.rating - a.rating)[0];
  const mh = top(0);
  const ma = top(1);
  if (mh) ctx.fillText(`★ ${snap.homeShort}: ${mh.name} ${mh.rating.toFixed(1)}`, cx - 110, yy);
  if (ma) ctx.fillText(`★ ${snap.awayShort}: ${ma.name} ${ma.rating.toFixed(1)}`, cx + 110, yy);
}

/** Interpolated render of the live match. */
function render(): void {
  if (!currSnap) return;
  drawScene(currSnap, prevSnap ?? currSnap, alpha);
  drawFlash();
  updateHUD(currSnap);
  if (currSnap.finished) drawReport(currSnap);
}

function updateHUD(snap: Snapshot): void {
  scoreHome.textContent = String(snap.score[0]);
  scoreAway.textContent = String(snap.score[1]);
  shotsLine.textContent = `Shots ${snap.shots[0]} – ${snap.shots[1]}`;
  const mm = String(Math.floor(snap.minute)).padStart(2, "0");
  clockEl.textContent = snap.finished ? "FT" : `${mm}'`;
  for (const i of [0, 1] as const) {
    stPoss[i].textContent = `${snap.possession[i]}%`;
    stShots[i].textContent = String(snap.shots[i]);
    stSot[i].textContent = String(snap.shotsOnTarget[i]);
    stXg[i].textContent = snap.xg[i].toFixed(1);
    stPass[i].textContent = `${snap.passAccuracy[i]}%`;
    stFit[i].textContent = `${snap.fitness[i]}%`;
  }
  // ratings panel (throttled — rebuilding DOM is comparatively expensive)
  const now = performance.now();
  if (now - lastRatingsUpdate > 700) {
    lastRatingsUpdate = now;
    updateRatings(snap);
  }
  conditionsLine.textContent =
    `${styleLabel(snap.homeStyle as TacticalStyle)}  ·  ${weatherLabel(snap.weather as Weather)}  ·  ` +
    `${styleLabel(snap.awayStyle as TacticalStyle)}`;
}

const ROLE_ORDER: Record<string, number> = {
  GK: 0, DR: 1, DC: 2, DL: 3, DM: 4, MC: 5, MR: 6, ML: 7, AM: 8, ST: 9,
};
function ratingColor(r: number): string {
  return r >= 7.5 ? "#3fb950" : r >= 6.5 ? "#8b949e" : "#d29922";
}
function fitnessColor(f: number): string {
  return f >= 80 ? "#3fb950" : f >= 65 ? "#d29922" : "#f85149";
}
function rrow(p: Snapshot["players"][number] | undefined): string {
  if (!p) return "<div></div>";
  const c = ratingColor(p.rating);
  const fc = fitnessColor(p.fitness);
  const inj = p.injured ? ' <span title="carrying a knock">🩹</span>' : "";
  // a slim fitness bar so individual stamina/injury is visible at a glance
  const bar = `<span class="fbar" title="fitness ${p.fitness}%"><span style="width:${p.fitness}%;background:${fc}"></span></span>`;
  return `<div class="rrow"><span class="rnum">${p.number}</span><span class="rname">${p.name}${p.goals ? " ⚽" : ""}${inj}</span>${bar}<span class="rval" style="background:${c}22;color:${c}">${p.rating.toFixed(1)}</span></div>`;
}
function updateRatings(snap: Snapshot): void {
  const home = snap.players
    .filter((p) => p.team === 0)
    .sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9));
  const away = snap.players
    .filter((p) => p.team === 1)
    .sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9));
  let html = "";
  for (let i = 0; i < 11; i++) html += rrow(home[i]) + rrow(away[i]);
  ratingsBox.innerHTML = html;
}

function startReplay(): void {
  if (buffer.length < 8) return;
  replayClip = buffer.slice();
  replayPos = 0;
  trail.length = 0;
}

const FLASH: Record<string, { text: string; color: string }> = {
  goal: { text: "⚽  GOAL!", color: "#7ef08a" },
  penalty: { text: "🎯  PENALTY!", color: "#7ef08a" },
  save: { text: "🧤  SAVED!", color: "#7ec8ff" },
  block: { text: "🛡  BLOCKED!", color: "#ff8e8e" },
  shot_off: { text: "↗  OFF TARGET", color: "#ffce5a" },
  take_on: { text: "✨  BEATS HIS MAN", color: "#d2a8ff" },
  corner: { text: "🚩  CORNER", color: "#ffb066" },
  offside: { text: "🚩  OFFSIDE", color: "#9aa4b2" },
};

function processEvents(snap: Snapshot): void {
  if (snap.events.length <= lastEventCount) return;
  for (let i = lastEventCount; i < snap.events.length; i++) {
    const e = snap.events[i]!;
    // live commentary ticker at the bottom — narrates the whole passage of play
    commPrev.textContent = commNow.textContent;
    commNow.textContent = `${e.minute}'  ${e.text}`;
    commNow.className = `c-${e.type}`;
    // scrolling history panel keeps the notable beats
    if (e.type !== "buildup") {
      const row = document.createElement("div");
      row.className = `ev ev-${e.type}`;
      row.textContent = `${e.minute}'  ${e.text}`;
      feed.prepend(row);
    }
    const f = FLASH[e.type];
    if (f) flash = { text: f.text, color: f.color, until: performance.now() + 1300 };
    // does this event qualify as a highlight for the current mode?
    const lvl = EVENT_LEVEL[e.type];
    const thr = MODE_THRESHOLD[highlightMode];
    if (lvl !== undefined && thr !== undefined && lvl <= thr) clipTrigger = true;
    // Full mode plays live; optionally auto-replay goals there
    if (e.type === "goal" && replaysOn && highlightMode === "full") pendingReplay = true;
  }
  lastEventCount = snap.events.length;
}

function renderCommentaryOnly(): void {
  ctx.fillStyle = "#0a0e14";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (currSnap) updateHUD(currSnap);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#6b7480";
  ctx.font = "bold 20px system-ui, sans-serif";
  ctx.fillText("COMMENTARY ONLY", canvas.width / 2, canvas.height / 2 - 16);
  ctx.fillStyle = "#cfd8e3";
  ctx.font = "14px system-ui, sans-serif";
  ctx.fillText("Following the match via the commentary below", canvas.width / 2, canvas.height / 2 + 14);
}

function renderSkip(): void {
  ctx.fillStyle = "#0c1118";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (currSnap) updateHUD(currSnap);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffce5a";
  ctx.font = "bold 18px system-ui, sans-serif";
  ctx.fillText("⏩ skipping to next highlight…", canvas.width / 2, canvas.height / 2 - 8);
  if (currSnap) {
    ctx.fillStyle = "#6b7480";
    ctx.font = "13px system-ui, sans-serif";
    ctx.fillText(`${currSnap.minute}'`, canvas.width / 2, canvas.height / 2 + 18);
  }
}

/** Advance the live sim by one frame's worth of real time at the given pace. */
function stepSim(simSeconds: number, onEvent?: () => boolean): void {
  acc += simSeconds;
  let steps = Math.floor(acc / STEP);
  acc -= steps * STEP;
  steps = Math.min(steps, 500);
  for (let i = 0; i < steps && match && !match.finished; i++) {
    match.step();
    prevSnap = currSnap;
    currSnap = match.snapshot();
    buffer.push(currSnap);
    if (buffer.length > BUFFER_MAX) buffer.shift();
    processEvents(currSnap);
    if (clipCooldown > 0) clipCooldown--;
    if (onEvent && onEvent()) {
      acc = 0;
      break;
    }
  }
  if (match && match.finished) {
    playing = false;
    playBtn.textContent = "Play";
  }
}

// ---- loop ----
// FM-style: the sim runs the whole match. The view fast-forwards until a
// qualifying EVENT (by mode threshold), then plays the buffered passage of play
// LEADING TO it (build-up -> event) as a clip. Full = live; Commentary = text.
function tick(now: number): void {
  requestAnimationFrame(tick);
  const dtReal = lastFrame ? Math.min((now - lastFrame) / 1000, 0.1) : 0;
  lastFrame = now;

  // 1) A clip (highlight or replay) is playing — it owns the view and pauses
  //    the live sim. Shots/crosses/goals within it slow down so they're seen.
  if (replayClip) {
    const i0 = Math.min(Math.floor(replayPos), replayClip.length - 1);
    const cm = replayClip[i0]!.ballMode;
    const clipPace = cm === "shot" || cm === "cross" || cm === "goal" ? timeScale * 0.4 : timeScale;
    replayPos += (dtReal * clipPace) / STEP;
    if (replayPos >= replayClip.length - 1) {
      replayClip = null;
      trail.length = 0;
      clipCooldown = 20; // ~2s before another highlight can trigger
    } else {
      const i = Math.floor(replayPos);
      drawScene(replayClip[i]!, replayClip[Math.max(0, i - 1)]!, replayPos - i, true);
      if (currSnap) updateHUD(currSnap);
      return;
    }
  }

  if (!match || !playing || match.finished) {
    if (highlightMode === "commentary") renderCommentaryOnly();
    else render();
    return;
  }

  if (highlightMode === "full") {
    const cm = currSnap?.ballMode;
    const watch = cm === "shot" || cm === "cross" ? timeScale * 0.4 : timeScale;
    stepSim(dtReal * watch, () => {
      if (pendingReplay) { pendingReplay = false; startReplay(); return true; }
      return false;
    });
    if (replayClip) { drawScene(replayClip[0]!, replayClip[0]!, 0, true); if (currSnap) updateHUD(currSnap); return; }
    alpha = playing ? Math.min(1, acc / STEP) : 1;
    render();
    return;
  }

  if (highlightMode === "commentary") {
    stepSim(dtReal * skipSpeed);
    renderCommentaryOnly();
    return;
  }

  // clip modes: fast-forward, watching for a qualifying event
  clipTrigger = false;
  stepSim(dtReal * skipSpeed, () => clipTrigger && clipCooldown <= 0);
  if (clipTrigger && clipCooldown <= 0) startReplay(); // play the build-up clip
  if (replayClip) { drawScene(replayClip[0]!, replayClip[0]!, 0, true); if (currSnap) updateHUD(currSnap); return; }
  renderSkip(); // between highlights
}

// ---- wiring ----
newBtn.addEventListener("click", newMatch);
playBtn.addEventListener("click", () => {
  if (!match) return;
  if (match.finished) {
    newMatch();
    return;
  }
  playing = !playing;
  playBtn.textContent = playing ? "Pause" : "Play";
});
for (const btn of document.querySelectorAll<HTMLButtonElement>("[data-speed]")) {
  btn.addEventListener("click", () => {
    timeScale = Number(btn.dataset.speed);
    for (const b of document.querySelectorAll("[data-speed]"))
      b.classList.toggle("active", b === btn);
  });
}
hlSel.addEventListener("change", () => {
  highlightMode = hlSel.value;
  clipCooldown = 0;
  clipTrigger = false;
});
skipSel.addEventListener("change", () => {
  skipSpeed = Number(skipSel.value);
});
replayToggleBtn.addEventListener("click", () => {
  replaysOn = !replaysOn;
  replayToggleBtn.textContent = replaysOn ? "On" : "Off";
  replayToggleBtn.classList.toggle("active", replaysOn);
});
replayBtn.addEventListener("click", () => {
  if (!replayClip) startReplay();
});

fillTeamSelects();
newMatch();
requestAnimationFrame(tick);
