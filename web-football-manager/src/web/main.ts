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
  loose: "Loose ball",
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const near = (a: number, b: number): boolean => Math.abs(a - b) < 5; // <5m = real move, else a teleport

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

/** Interpolated render between prevSnap and currSnap for smooth motion. */
function render(): void {
  if (!currSnap) return;
  const cur = currSnap;
  const prev = prevSnap ?? cur;

  drawPitch();
  drawTrail();

  for (let i = 0; i < cur.players.length; i++) {
    const cp = cur.players[i]!;
    const pp = prev.players[i] ?? cp;
    const x = near(pp.x, cp.x) ? lerp(pp.x, cp.x, alpha) : cp.x;
    const y = near(pp.y, cp.y) ? lerp(pp.y, cp.y, alpha) : cp.y;
    drawPlayer(X(x), Y(y), cp);
  }

  // interpolated ball + trail point
  const bx = near(prev.ball.x, cur.ball.x) ? lerp(prev.ball.x, cur.ball.x, alpha) : cur.ball.x;
  const by = near(prev.ball.y, cur.ball.y) ? lerp(prev.ball.y, cur.ball.y, alpha) : cur.ball.y;
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

  // action label (top-left of pitch) so you can tell what's happening
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = MODE_COLOR[cur.ballMode] ?? "#fff";
  ctx.font = "bold 12px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(MODE_LABEL[cur.ballMode] ?? "", M + 6, M + 6);
  ctx.globalAlpha = 1;

  drawFlash();
  updateHUD(cur);
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
    stPass[i].textContent = `${snap.passAccuracy[i]}%`;
    stFit[i].textContent = `${snap.fitness[i]}%`;
  }
  conditionsLine.textContent =
    `${styleLabel(snap.homeStyle as TacticalStyle)}  ·  ${weatherLabel(snap.weather as Weather)}  ·  ` +
    `${styleLabel(snap.awayStyle as TacticalStyle)}`;
}

const FLASH: Record<string, { text: string; color: string }> = {
  goal: { text: "⚽  GOAL!", color: "#7ef08a" },
  save: { text: "🧤  SAVED!", color: "#7ec8ff" },
  block: { text: "🛡  BLOCKED!", color: "#ff8e8e" },
  shot_off: { text: "↗  OFF TARGET", color: "#ffce5a" },
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
  }
  lastEventCount = snap.events.length;
}

// ---- loop ----
// Fixed-timestep simulation + interpolated rendering: real time drives the sim
// at `timeScale`, and we render between the last two sim states for smooth,
// broadcast-style motion that's the same on any device.
function tick(now: number): void {
  requestAnimationFrame(tick);
  const dtReal = lastFrame ? (now - lastFrame) / 1000 : 0;
  lastFrame = now;

  if (match && playing && !match.finished) {
    acc += Math.min(dtReal, 0.1) * timeScale;
    let safety = 0;
    while (acc >= STEP && !match.finished && safety < 200) {
      match.step();
      prevSnap = currSnap;
      currSnap = match.snapshot();
      processEvents(currSnap);
      acc -= STEP;
      safety++;
    }
    if (match.finished) {
      playing = false;
      playBtn.textContent = "Play";
    }
  }
  alpha = playing ? Math.min(1, acc / STEP) : 1;
  render();
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

fillTeamSelects();
newMatch();
requestAnimationFrame(tick);
