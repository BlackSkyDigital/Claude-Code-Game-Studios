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

// ---- pitch transform (metres -> pixels) ----
const M = 26;
const sx = (canvas.width - 2 * M) / PITCH_LENGTH;
const sy = (canvas.height - 2 * M) / PITCH_WIDTH;
const X = (x: number) => M + x * sx;
const Y = (y: number) => M + y * sy;

// ---- state ----
let match: Match | null = null;
let playing = false;
let timeScale = 8; // SIMULATED seconds per REAL second (frame-rate independent)
let lastFrame = 0;
let acc = 0; // leftover simulated time not yet stepped
let lastEventCount = 0;
const STEP = 0.1; // must match the engine's internal DT

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
  playing = true;
  playBtn.textContent = "Pause";
  nameHome.textContent = h.short;
  nameAway.textContent = a.short;
  draw(match.snapshot());
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

function draw(snap: Snapshot): void {
  drawPitch();

  // players
  for (const p of snap.players) {
    const px = X(p.x);
    const py = Y(p.y);
    if (p.hasBall) {
      ctx.beginPath();
      ctx.arc(px, py, 13, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,80,0.35)";
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(px, py, 9, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.stroke();
    ctx.fillStyle = p.textColor;
    ctx.font = "bold 10px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(p.number), px, py);
  }

  // ball
  ctx.beginPath();
  ctx.arc(X(snap.ball.x), Y(snap.ball.y), 5, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "#000";
  ctx.stroke();

  // HUD
  scoreHome.textContent = String(snap.score[0]);
  scoreAway.textContent = String(snap.score[1]);
  shotsLine.textContent = `Shots ${snap.shots[0]} – ${snap.shots[1]}`;
  const mm = String(Math.floor(snap.minute)).padStart(2, "0");
  clockEl.textContent = snap.finished ? "FT" : `${mm}'`;

  // match stats
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

  // commentary (append only new events)
  if (snap.events.length > lastEventCount) {
    const shown = new Set([
      "goal",
      "save",
      "shot_off",
      "interception",
      "tackle",
      "kickoff",
      "half_time",
      "full_time",
    ]);
    for (let i = lastEventCount; i < snap.events.length; i++) {
      const e = snap.events[i]!;
      if (!shown.has(e.type)) continue;
      const row = document.createElement("div");
      row.className = `ev ev-${e.type}`;
      row.textContent = `${e.minute}'  ${e.text}`;
      feed.prepend(row);
    }
    lastEventCount = snap.events.length;
  }
}

// ---- loop ----
// Fixed-timestep playback: real elapsed time drives how many 0.1s sim steps we
// run, so the match plays at the same pace on any device regardless of frame
// rate (a 120Hz phone no longer runs it at double speed).
function tick(now: number): void {
  requestAnimationFrame(tick);
  const dtReal = lastFrame ? (now - lastFrame) / 1000 : 0;
  lastFrame = now;
  if (!match || !playing || match.finished) return;

  acc += Math.min(dtReal, 0.1) * timeScale; // clamp to avoid jumps after pauses
  let steps = Math.floor(acc / STEP);
  acc -= steps * STEP;
  steps = Math.min(steps, 60); // safety cap
  for (let i = 0; i < steps && !match.finished; i++) match.step();

  draw(match.snapshot());
  if (match.finished) {
    playing = false;
    playBtn.textContent = "Play";
  }
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
