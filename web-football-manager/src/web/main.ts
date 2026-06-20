import { Match, type Snapshot } from "../engine/match.js";
import { TEAMS } from "../engine/data.js";
import {
  GOAL_Y_MAX,
  GOAL_Y_MIN,
  PITCH_LENGTH,
  PITCH_WIDTH,
  type Duty,
  type PlayerInstructions,
} from "../engine/types.js";
import {
  TACTICAL_STYLES,
  styleLabel,
  tacticsForStyle,
  type TacticalStyle,
  type TeamTactics,
} from "../engine/tactics.js";
import { FORMATION_NAMES, FORMATIONS, type Slot } from "../engine/formations.js";
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
const homeMarkSel = $<HTMLSelectElement>("homeMark");
const awayMarkSel = $<HTMLSelectElement>("awayMark");
const weatherSel = $<HTMLSelectElement>("weatherSel");
const conditionsLine = $("conditions");
const commNow = $("commNow");
const commPrev = $("commPrev");
const hlSel = $<HTMLSelectElement>("hlMode");
const spdSlider = $<HTMLInputElement>("spdSlider");
const spdVal = $("spdVal");
const skipSlider = $<HTMLInputElement>("skipSlider");
const skipVal = $("skipVal");
const replayToggleBtn = $<HTMLButtonElement>("replayToggle");
const replayBtn = $<HTMLButtonElement>("replayBtn");
const stXg = [$("stXg0"), $("stXg1")] as const;
const ratingsBox = $("ratings");
// live tactical control
const homeFormSel = $<HTMLSelectElement>("homeForm");
const awayFormSel = $<HTMLSelectElement>("awayForm");
const tiSide = $<HTMLSelectElement>("tiSide");
const tiPreset = $<HTMLSelectElement>("tiPreset");
const tiMarkSel = $<HTMLSelectElement>("tiMarkSel");
const tiSliders = $("tiSliders");
const tiCustom = $("tiCustom");
const piPlayer = $<HTMLSelectElement>("piPlayer");
const piControls = $("piControls");
const fmEdit = $<HTMLCanvasElement>("fmEdit");
const fmApply = $<HTMLButtonElement>("fmApply");
const fmReset = $<HTMLButtonElement>("fmReset");

// the live source of truth for tactics & formations (sliders mutate these and
// push them into the running Match)
let liveTactics: [TeamTactics, TeamTactics] = [tacticsForStyle("balanced"), tacticsForStyle("balanced")];
let liveFormation: [string | Slot[], string | Slot[]] = ["4-3-3", "4-3-3"];
// per-player instruction state, keyed `${side}:${number}`
const piState = new Map<string, { duty: Duty; instr: PlayerInstructions }>();
// formation editor working slots (home-orientation) for the side being edited
let editorSlots: Slot[] = [];

// ---- pitch transform (metres -> pixels) ----
const M = 26;
const sx = (canvas.width - 2 * M) / PITCH_LENGTH;
const sy = (canvas.height - 2 * M) / PITCH_WIDTH;
const X = (x: number) => M + x * sx;
const Y = (y: number) => M + y * sy;

// ---- state ----
let match: Match | null = null;
let playing = false;
let timeScale = 5; // SIMULATED seconds per REAL second (frame-rate independent)
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
  foul: 4,
  injury: 4,
  substitution: 4,
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

  const markOpts: [string, string][] = [["zonal", "Zonal"], ["man", "Man-marking"]];
  fillSelect(homeMarkSel, markOpts);
  fillSelect(awayMarkSel, markOpts);
  // marking dropdown follows the style preset, but can be overridden
  const syncMark = (style: HTMLSelectElement, mark: HTMLSelectElement) =>
    style.addEventListener("change", () => {
      mark.value = tacticsForStyle(style.value as TacticalStyle).marking;
    });
  syncMark(homeStyleSel, homeMarkSel);
  syncMark(awayStyleSel, awayMarkSel);
  homeMarkSel.value = tacticsForStyle("balanced").marking;
  awayMarkSel.value = tacticsForStyle("balanced").marking;

  const formOpts = FORMATION_NAMES.map((f) => [f, f] as [string, string]);
  fillSelect(homeFormSel, formOpts);
  fillSelect(awayFormSel, formOpts);
  homeFormSel.value = TEAMS[0]?.formation && FORMATION_NAMES.includes(TEAMS[0].formation) ? TEAMS[0].formation : "4-3-3";
  awayFormSel.value = TEAMS[1]?.formation && FORMATION_NAMES.includes(TEAMS[1].formation) ? TEAMS[1].formation : "4-3-3";
  // formation can be changed live (re-shapes the side mid-match)
  homeFormSel.addEventListener("change", () => applyFormationSelect(0, homeFormSel.value));
  awayFormSel.addEventListener("change", () => applyFormationSelect(1, awayFormSel.value));

  const presetOpts: [string, string][] = [["", "— preset —"], ...TACTICAL_STYLES.map((s) => [s, styleLabel(s)] as [string, string])];
  fillSelect(tiPreset, presetOpts);

  fillSelect(weatherSel, WEATHER_TYPES.map((w) => [w, weatherLabel(w)] as [string, string]));
  weatherSel.value = "clear";
}

function newMatch(): void {
  const h = TEAMS[Number(homeSel.value)]!;
  const a = TEAMS[Number(awaySel.value)]!;
  const seed = Number(seedInput.value) || 1;
  // build the live tactics from the style presets + marking choice
  liveTactics = [
    tacticsForStyle(homeStyleSel.value as TacticalStyle),
    tacticsForStyle(awayStyleSel.value as TacticalStyle),
  ];
  liveTactics[0].marking = homeMarkSel.value as "zonal" | "man";
  liveTactics[1].marking = awayMarkSel.value as "zonal" | "man";
  liveFormation = [homeFormSel.value, awayFormSel.value];
  match = new Match(h, a, seed, {
    homeTactics: liveTactics[0],
    awayTactics: liveTactics[1],
    homeFormation: liveFormation[0],
    awayFormation: liveFormation[1],
    weather: weatherSel.value as Weather,
  });
  seedPlayerInstructions(h, a);
  refreshTacticsPanel();
  refreshPlayerPicker();
  loadEditorFromFormation();
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
  // role + duty shown on hover (e.g. "Inverted Winger · attack")
  const tip = `${p.roleName} · ${p.duty}`;
  return `<div class="rrow" title="${tip}"><span class="rnum">${p.number}</span><span class="rname">${p.name}${p.goals ? " ⚽" : ""}${inj}</span>${bar}<span class="rval" style="background:${c}22;color:${c}">${p.rating.toFixed(1)}</span></div>`;
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

/** After a highlight triggers, keep simulating (and buffering) until the action
 * has fully resolved — the shot is saved/missed, or the goal is scored AND the
 * brief celebration has played — so a clip never cuts before the ball hits the
 * net and the players wheel away. */
function captureClipTail(): void {
  if (!match) return;
  let safety = 70; // hard cap (~7s of sim) in case a scramble drags on
  while (match && !match.finished && safety-- > 0) {
    const bm = currSnap?.ballMode;
    if (bm !== "shot" && bm !== "goal" && bm !== "cross") break; // play has settled
    match.step();
    prevSnap = currSnap;
    currSnap = match.snapshot();
    buffer.push(currSnap);
    if (buffer.length > BUFFER_MAX) buffer.shift();
    processEvents(currSnap);
    if (clipCooldown > 0) clipCooldown--;
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
    // slow-mo the strike & the delivery; let the goal/celebration play at normal pace
    const clipPace = cm === "shot" || cm === "cross" ? timeScale * 0.4 : timeScale;
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
      if (pendingReplay) { pendingReplay = false; captureClipTail(); startReplay(); return true; }
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
  if (clipTrigger && clipCooldown <= 0) {
    captureClipTail(); // play the chance out (ball in net + celebration) before the clip
    startReplay(); // then play the build-up -> resolution clip
  }
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
// two independent speed sliders, FM-style: how fast highlights PLAY, and how
// fast the match fast-forwards BETWEEN highlights.
const spdLabel = (v: number) => (v <= 2 ? "Slow" : v <= 6 ? "Normal" : v <= 11 ? "Fast" : "Very Fast");
const skipLabel = (v: number) => (v <= 24 ? "Slow" : v <= 70 ? "Fast" : "Instant");
function applySpeeds(): void {
  timeScale = Number(spdSlider.value);
  skipSpeed = Number(skipSlider.value);
  spdVal.textContent = spdLabel(timeScale);
  skipVal.textContent = skipLabel(skipSpeed);
}
spdSlider.addEventListener("input", applySpeeds);
skipSlider.addEventListener("input", applySpeeds);
applySpeeds();
hlSel.addEventListener("change", () => {
  highlightMode = hlSel.value;
  clipCooldown = 0;
  clipTrigger = false;
});
replayToggleBtn.addEventListener("click", () => {
  replaysOn = !replaysOn;
  replayToggleBtn.textContent = replaysOn ? "On" : "Off";
  replayToggleBtn.classList.toggle("active", replaysOn);
});
replayBtn.addEventListener("click", () => {
  if (!replayClip) startReplay();
});

// ============================================================================
//  LIVE TACTICAL CONTROL — team instructions, player instructions, formations
// ============================================================================

const pct = (v: number): string => `${Math.round(v * 100)}%`;
type NumKnob =
  | "mentality" | "tempo" | "directness" | "pressing" | "lineHeight" | "width"
  | "tackling" | "shootOnSight" | "creativeFreedom" | "counterPress"
  | "counterAttack" | "focusPlay" | "offsideTrap";
const KNOBS: { key: NumKnob; label: string; min: number; max: number; step: number; fmt: (v: number) => string }[] = [
  { key: "mentality", label: "Mentality", min: -1, max: 1, step: 0.05, fmt: (v) => v <= -0.5 ? "Very Defensive" : v < -0.15 ? "Defensive" : v < 0.15 ? "Balanced" : v < 0.5 ? "Attacking" : "Very Attacking" },
  { key: "tempo", label: "Tempo", min: 0, max: 1, step: 0.05, fmt: pct },
  { key: "directness", label: "Passing directness", min: 0, max: 1, step: 0.05, fmt: pct },
  { key: "pressing", label: "Pressing intensity", min: 0, max: 1, step: 0.05, fmt: pct },
  { key: "lineHeight", label: "Defensive line", min: 0, max: 1, step: 0.05, fmt: pct },
  { key: "width", label: "Attacking width", min: 0, max: 1, step: 0.05, fmt: pct },
  { key: "tackling", label: "Tackling", min: 0, max: 1, step: 0.05, fmt: (v) => v < 0.35 ? "Stay on feet" : v < 0.65 ? "Normal" : "Get stuck in" },
  { key: "shootOnSight", label: "Shoot on sight", min: 0, max: 1, step: 0.05, fmt: (v) => v < 0.35 ? "Work into box" : v < 0.65 ? "Mixed" : "Shoot on sight" },
  { key: "creativeFreedom", label: "Creative freedom", min: 0, max: 1, step: 0.05, fmt: (v) => v < 0.35 ? "Disciplined" : v < 0.65 ? "Balanced" : "Expressive" },
  { key: "counterPress", label: "Counter-press", min: 0, max: 1, step: 0.05, fmt: (v) => v < 0.35 ? "Regroup" : v < 0.65 ? "Balanced" : "Win it back" },
  { key: "counterAttack", label: "Counter-attack", min: 0, max: 1, step: 0.05, fmt: (v) => v < 0.35 ? "Hold shape" : v < 0.65 ? "Balanced" : "Break fast" },
  { key: "focusPlay", label: "Focus play", min: -1, max: 1, step: 0.1, fmt: (v) => v < -0.3 ? "Left flank" : v > 0.3 ? "Right flank" : "Through middle" },
  { key: "offsideTrap", label: "Offside trap", min: 0, max: 1, step: 0.05, fmt: (v) => v < 0.1 ? "Off" : pct(v) },
];

function defaultDutyLocal(role: string): Duty {
  if (role === "GK" || role === "DC") return "defend";
  if (role === "DL" || role === "DR" || role === "DM" || role === "MC") return "support";
  return "attack";
}

/** Does a tactics object match a named preset (so we can show "Preset: X" vs "Custom")? */
function detectPreset(t: TeamTactics): string {
  for (const s of TACTICAL_STYLES) {
    const p = tacticsForStyle(s);
    const same = KNOBS.every((k) => Math.abs((p[k.key] as number) - (t[k.key] as number)) < 0.001) && p.marking === t.marking;
    if (same) return styleLabel(s);
  }
  return "Custom";
}

function refreshTacticsPanel(): void {
  const side = Number(tiSide.value) as 0 | 1;
  const t = liveTactics[side];
  tiMarkSel.value = t.marking;
  tiSliders.innerHTML = "";
  for (const k of KNOBS) {
    const wrap = document.createElement("div");
    wrap.className = "sld";
    const lab = document.createElement("label");
    lab.innerHTML = `<span>${k.label}</span><span class="sval">${k.fmt(t[k.key] as number)}</span>`;
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(k.min); input.max = String(k.max); input.step = String(k.step);
    input.value = String(t[k.key] as number);
    const val = lab.querySelector(".sval") as HTMLSpanElement;
    input.addEventListener("input", () => {
      const v = Number(input.value);
      (liveTactics[side][k.key] as number) = v;
      val.textContent = k.fmt(v);
      match?.setTactics(side, liveTactics[side]);
      tiCustom.textContent = `Preset: ${detectPreset(liveTactics[side])}`;
    });
    wrap.appendChild(lab); wrap.appendChild(input);
    tiSliders.appendChild(wrap);
  }
  tiCustom.textContent = `Preset: ${detectPreset(t)}`;
}

tiSide.addEventListener("change", () => { refreshTacticsPanel(); loadEditorFromFormation(); });
tiMarkSel.addEventListener("change", () => {
  const side = Number(tiSide.value) as 0 | 1;
  liveTactics[side].marking = tiMarkSel.value as "zonal" | "man";
  match?.setTactics(side, liveTactics[side]);
  tiCustom.textContent = `Preset: ${detectPreset(liveTactics[side])}`;
});
tiPreset.addEventListener("change", () => {
  const style = tiPreset.value as TacticalStyle;
  if (!style) return;
  const side = Number(tiSide.value) as 0 | 1;
  liveTactics[side] = tacticsForStyle(style);
  match?.setTactics(side, liveTactics[side]);
  tiPreset.value = "";
  refreshTacticsPanel();
});

// ---- player instructions ----

function seedPlayerInstructions(h: typeof TEAMS[number], a: typeof TEAMS[number]): void {
  piState.clear();
  ([h, a] as const).forEach((def, side) => {
    for (const p of def.players) {
      piState.set(`${side}:${p.number}`, {
        duty: p.duty ?? defaultDutyLocal(p.role),
        instr: { ...(p.instructions ?? {}) },
      });
    }
  });
}

function refreshPlayerPicker(): void {
  const h = TEAMS[Number(homeSel.value)]!;
  const a = TEAMS[Number(awaySel.value)]!;
  const opts: [string, string][] = [];
  h.players.forEach((p) => opts.push([`0:${p.number}`, `H ${p.number} ${p.name}`]));
  a.players.forEach((p) => opts.push([`1:${p.number}`, `A ${p.number} ${p.name}`]));
  fillSelect(piPlayer, opts);
  refreshPiControls();
}

function sel(label: string, value: string, options: [string, string][], onChange: (v: string) => void, full = false): HTMLElement {
  const wrap = document.createElement("div");
  if (full) wrap.className = "full";
  const l = document.createElement("label"); l.textContent = label;
  const s = document.createElement("select");
  for (const [v, t] of options) { const o = document.createElement("option"); o.value = v; o.textContent = t; s.appendChild(o); }
  s.value = value;
  s.addEventListener("change", () => onChange(s.value));
  wrap.appendChild(l); wrap.appendChild(s);
  return wrap;
}

function refreshPiControls(): void {
  piControls.innerHTML = "";
  const key = piPlayer.value;
  if (!key) return;
  const [sideS, numS] = key.split(":");
  const side = Number(sideS) as 0 | 1;
  const num = Number(numS);
  const st = piState.get(key);
  if (!st) return;
  const apply = (patch: PlayerInstructions) => { st.instr = { ...st.instr, ...patch }; match?.setPlayerInstruction(side, num, st.instr); };
  const tri: [string, string][] = [["", "Auto"], ["more", "More"], ["less", "Less"]];
  const onoff: [string, string][] = [["", "Off"], ["on", "On"]];
  // mark target: an opponent's player names
  const oppDef = TEAMS[Number(side === 0 ? awaySel.value : homeSel.value)]!;
  const markOpts: [string, string][] = [["", "None"], ...oppDef.players.filter((p) => p.role !== "GK").map((p) => [p.name, p.name] as [string, string])];

  piControls.appendChild(sel("Duty", st.duty, [["defend", "Defend"], ["support", "Support"], ["attack", "Attack"]], (v) => { st.duty = v as Duty; match?.setDuty(side, num, st.duty); }));
  piControls.appendChild(sel("Shoot", st.instr.shoot ?? "", tri, (v) => apply({ shoot: (v || undefined) as PlayerInstructions["shoot"] })));
  piControls.appendChild(sel("Dribble", st.instr.dribble ?? "", tri, (v) => apply({ dribble: (v || undefined) as PlayerInstructions["dribble"] })));
  piControls.appendChild(sel("Cross", st.instr.cross ?? "", tri, (v) => apply({ cross: (v || undefined) as PlayerInstructions["cross"] })));
  piControls.appendChild(sel("Close down", st.instr.closeDown ?? "", tri, (v) => apply({ closeDown: (v || undefined) as PlayerInstructions["closeDown"] })));
  piControls.appendChild(sel("Passing", st.instr.passDirectness ?? "", [["", "Auto"], ["shorter", "Shorter"], ["direct", "Direct"]], (v) => apply({ passDirectness: (v || undefined) as PlayerInstructions["passDirectness"] })));
  piControls.appendChild(sel("Roam", st.instr.roam ? "on" : "", onoff, (v) => apply({ roam: v === "on" })));
  piControls.appendChild(sel("Get forward", st.instr.getForward ? "on" : "", onoff, (v) => apply({ getForward: v === "on" })));
  piControls.appendChild(sel("Hold position", st.instr.holdPosition ? "on" : "", onoff, (v) => apply({ holdPosition: v === "on" })));
  piControls.appendChild(sel("Tackle harder", st.instr.tackleHarder ? "on" : "", onoff, (v) => apply({ tackleHarder: v === "on" })));
  piControls.appendChild(sel("Tight marking", st.instr.tightMark ? "on" : "", onoff, (v) => apply({ tightMark: v === "on" })));
  piControls.appendChild(sel("Man-mark", st.instr.mark ?? "", markOpts, (v) => apply({ mark: v || undefined }), true));
}

piPlayer.addEventListener("change", refreshPiControls);

// ---- formation: live select + custom drag editor ----

function applyFormationSelect(side: 0 | 1, name: string): void {
  liveFormation[side] = name;
  match?.setFormation(side, name);
  if (Number(tiSide.value) === side) loadEditorFromFormation();
}

function currentFormationSlots(side: 0 | 1): Slot[] {
  const spec = liveFormation[side];
  const base = Array.isArray(spec) ? spec : (FORMATIONS[spec] ?? FORMATIONS["4-3-3"]!);
  return base.map((s) => ({ role: s.role, pos: { x: s.pos.x, y: s.pos.y } }));
}

function loadEditorFromFormation(): void {
  editorSlots = currentFormationSlots(Number(tiSide.value) as 0 | 1);
  drawEditor();
}

const EW = fmEdit.width, EH = fmEdit.height;
const ex = (x: number) => (x / PITCH_LENGTH) * EW;
const ey = (y: number) => (y / PITCH_WIDTH) * EH;
function drawEditor(): void {
  const c = fmEdit.getContext("2d")!;
  c.fillStyle = "#23702f"; c.fillRect(0, 0, EW, EH);
  c.strokeStyle = "rgba(255,255,255,0.35)"; c.lineWidth = 1;
  c.strokeRect(2, 2, EW - 4, EH - 4);
  c.beginPath(); c.moveTo(EW / 2, 2); c.lineTo(EW / 2, EH - 2); c.stroke();
  for (const s of editorSlots) {
    c.beginPath(); c.arc(ex(s.pos.x), ey(s.pos.y), 9, 0, Math.PI * 2);
    c.fillStyle = s.role === "GK" ? "#888" : "#2f8f3f"; c.fill();
    c.strokeStyle = "rgba(0,0,0,0.5)"; c.stroke();
    c.fillStyle = "#fff"; c.font = "8px system-ui"; c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText(s.role, ex(s.pos.x), ey(s.pos.y));
  }
}

let dragIdx = -1;
function editorPoint(e: PointerEvent): { x: number; y: number } {
  const r = fmEdit.getBoundingClientRect();
  const mx = ((e.clientX - r.left) / r.width) * EW;
  const my = ((e.clientY - r.top) / r.height) * EH;
  return { x: (mx / EW) * PITCH_LENGTH, y: (my / EH) * PITCH_WIDTH };
}
fmEdit.addEventListener("pointerdown", (e) => {
  const pt = editorPoint(e);
  let best = -1, bd = 1e9;
  editorSlots.forEach((s, i) => {
    if (s.role === "GK") return; // keeper stays
    const d = Math.hypot(s.pos.x - pt.x, s.pos.y - pt.y);
    if (d < bd) { bd = d; best = i; }
  });
  if (best >= 0 && bd < 8) { dragIdx = best; fmEdit.setPointerCapture(e.pointerId); }
});
fmEdit.addEventListener("pointermove", (e) => {
  if (dragIdx < 0) return;
  const pt = editorPoint(e);
  editorSlots[dragIdx]!.pos = {
    x: Math.max(8, Math.min(PITCH_LENGTH - 6, pt.x)),
    y: Math.max(3, Math.min(PITCH_WIDTH - 3, pt.y)),
  };
  drawEditor();
});
const endDrag = () => { dragIdx = -1; };
fmEdit.addEventListener("pointerup", endDrag);
fmEdit.addEventListener("pointercancel", endDrag);

fmApply.addEventListener("click", () => {
  const side = Number(tiSide.value) as 0 | 1;
  liveFormation[side] = editorSlots.map((s) => ({ role: s.role, pos: { ...s.pos } }));
  match?.setFormation(side, liveFormation[side]);
  fmApply.textContent = "Applied ✓";
  setTimeout(() => (fmApply.textContent = "Apply to side"), 1200);
});
fmReset.addEventListener("click", () => {
  const side = Number(tiSide.value) as 0 | 1;
  const name = (side === 0 ? homeFormSel : awayFormSel).value;
  liveFormation[side] = name;
  editorSlots = currentFormationSlots(side);
  match?.setFormation(side, name);
  drawEditor();
});

fillTeamSelects();
newMatch();
requestAnimationFrame(tick);
