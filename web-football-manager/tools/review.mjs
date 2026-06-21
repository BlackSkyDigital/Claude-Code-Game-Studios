// Deep-review probe: aggregates how goals are created (chance type & shot type),
// shot outcomes, and the rate of "football" events (deflections, own goals,
// handballs, free kicks, penalties, corners) across many mixed matches — to check
// the football is varied and realistic, not single-source.
import { Match } from "../dist/engine/match.js";
import { TEAMS } from "../dist/engine/data.js";
import { tacticsForStyle } from "../dist/engine/tactics.js";

const N = Number(process.argv[2]) || 60;
const chance = {}, shot = {}, out = {};
let goals = 0, defl = 0, og = 0, hb = 0, fk = 0, pen = 0, cor = 0, m2 = 0;
const add = (o, k, v = 1) => (o[k] = (o[k] ?? 0) + v);

for (let s = 1; s <= N; s++) {
  const h = TEAMS[s % TEAMS.length], a = TEAMS[(s * 7 + 3) % TEAMS.length];
  if (h === a) continue;
  const m = new Match(h, a, s * 13 + 2, { homeTactics: tacticsForStyle(h.style ?? "balanced"), awayTactics: tacticsForStyle(a.style ?? "balanced"), homeFormation: h.formation, awayFormation: a.formation });
  m.simulate();
  m2++;
  for (const k in m.goalsByChance) add(chance, k, m.goalsByChance[k]);
  for (const k in m.goalsByShot) add(shot, k, m.goalsByShot[k]);
  for (const k in m.shotOutcomes) add(out, k, m.shotOutcomes[k]);
  goals += m.score[0] + m.score[1];
  defl += m.deflections; og += m.ownGoals; hb += m.handballs; fk += m.freeKicks;
  pen += m.penaltyCount; cor += m.cornerCount;
}
const pctOf = (o, tot) => Object.entries(o).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(100 * v / tot).toFixed(0)}%`).join("  ");
const totGoals = Object.values(chance).reduce((a, b) => a + b, 0) || 1;
// "over" is a subset of offtarget — exclude it from the outcome total so the
// four outcomes still sum to 100%, and report over-the-bar share separately.
const over = out.over ?? 0; delete out.over;
const totShots = Object.values(out).reduce((a, b) => a + b, 0) || 1;
console.log(`=== FOOTBALL REVIEW over ${m2} matches (${(goals / m2).toFixed(2)} goals/match) ===`);
console.log("GOALS by chance :", pctOf(chance, totGoals), "  (real: open-play/cross/through/cut-back/set-piece all meaningful)");
console.log("GOALS by shot   :", pctOf(shot, totGoals), "  (real ~ foot ~75 / head ~18 / pen ~7)");
console.log("SHOT outcomes   :", pctOf(out, totShots), "  (real ~ goal 10 / saved 25 / blocked 28 / off 37)");
console.log(`  of off-target, OVER THE BAR ${(100 * over / (out.offtarget || 1)).toFixed(0)}% (${(over / m2).toFixed(1)}/match) — rest dragged wide`);
console.log("\nEvents per match:");
console.log(`  deflections ${(defl / m2).toFixed(1)} · own goals ${(og / m2).toFixed(2)} · handballs ${(hb / m2).toFixed(2)} · free kicks ${(fk / m2).toFixed(1)} · penalties ${(pen / m2).toFixed(2)} · corners ${(cor / m2).toFixed(1)}`);
