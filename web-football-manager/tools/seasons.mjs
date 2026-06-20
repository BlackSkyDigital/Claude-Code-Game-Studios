// Multi-season aggregator: run K full PL seasons (different seeds) and report
// where teams TYPICALLY land (avg finishing position & points), plus the league
// landmarks (champion / top-4 / mid-table / relegation points), goals/game and
// top-scorer level — compared against real Premier League norms from the last
// ~5 seasons (2021-22 … 2025-26).
//
// Real-life landmark targets (5-season averages, rounded):
//   Champion ~88 (84-93) · 4th ~72 (69-75) · 7th ~60 · 10th ~51 ·
//   17th(safe) ~38 (35-40) · 20th ~22 (16-26) · goals/game ~2.82 ·
//   top scorer ~28 (23-36) · home/draw/away ~45/24/31
//
// Usage: node tools/seasons.mjs [K]
import { Match } from "../dist/engine/match.js";
import { TEAMS } from "../dist/engine/data.js";
import { tacticsForStyle } from "../dist/engine/tactics.js";

const K = Number(process.argv[2]) || 3;
const tac = (t) => tacticsForStyle(t.style ?? "balanced");

const agg = Object.fromEntries(TEAMS.map((t) => [t.short, { name: t.name, pts: 0, pos: 0, gf: 0, ga: 0 }]));
const landmark = {}; // finishing position -> summed points
let totGoals = 0, totMatches = 0, hw = 0, dr = 0, aw = 0;
const topScorers = []; // per-season golden boot

for (let s = 0; s < K; s++) {
  const table = TEAMS.map((t) => ({ short: t.short, P: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0, Pts: 0 }));
  const scorers = new Map();
  let fixture = 0;
  for (let h = 0; h < TEAMS.length; h++) {
    for (let a = 0; a < TEAMS.length; a++) {
      if (h === a) continue;
      const home = TEAMS[h], away = TEAMS[a];
      const m = new Match(home, away, fixture++ * 101 + s * 1000003 + 17, {
        homeTactics: tac(home), awayTactics: tac(away),
        homeFormation: home.formation, awayFormation: away.formation,
      });
      m.simulate();
      const [gh, ga] = m.score;
      const th = table[h], ta = table[a];
      th.GF += gh; th.GA += ga; ta.GF += ga; ta.GA += gh;
      totGoals += gh + ga; totMatches++;
      if (gh > ga) { th.W++; ta.L++; th.Pts += 3; hw++; }
      else if (gh < ga) { ta.W++; th.L++; ta.Pts += 3; aw++; }
      else { th.D++; ta.D++; th.Pts++; ta.Pts++; dr++; }
      for (const p of m.snapshot().players) {
        if (p.goals <= 0) continue;
        const club = p.team === 0 ? home.short : away.short;
        const key = `${club}|${p.name}`;
        scorers.set(key, (scorers.get(key) ?? 0) + p.goals);
      }
    }
  }
  table.sort((x, y) => y.Pts - x.Pts || (y.GF - y.GA) - (x.GF - x.GA) || y.GF - x.GF);
  table.forEach((t, i) => {
    const A = agg[t.short];
    A.pts += t.Pts; A.pos += i + 1; A.gf += t.GF; A.ga += t.GA;
    landmark[i + 1] = (landmark[i + 1] ?? 0) + t.Pts;
  });
  topScorers.push(Math.max(...[...scorers.values()]));
}

const avgTable = Object.entries(agg)
  .map(([short, A]) => ({ short, name: A.name, pos: A.pos / K, pts: A.pts / K, gf: A.gf / K, ga: A.ga / K }))
  .sort((x, y) => x.pos - y.pos);

console.log(`=== TYPICAL TABLE over ${K} seasons (avg finishing position) ===`);
console.log("Team   avgPos  avgPts   GF   GA");
avgTable.forEach((t) => console.log(`${t.short.padEnd(4)}  ${t.pos.toFixed(1).padStart(5)}  ${t.pts.toFixed(1).padStart(5)}  ${t.gf.toFixed(0).padStart(3)}  ${t.ga.toFixed(0).padStart(3)}`));

const lm = (p) => (landmark[p] / K).toFixed(0);
const real = { 1: "88 (84-93)", 4: "72 (69-75)", 7: "60", 10: "51", 17: "38 (35-40)", 20: "22 (16-26)" };
console.log("\n=== LANDMARK POINTS (sim vs real) ===");
for (const p of [1, 4, 7, 10, 17, 20]) console.log(`  ${String(p).padStart(2)}th: sim ${lm(p).padStart(3)}   real ${real[p]}`);
console.log("\n=== LEAGUE STATS (sim vs real) ===");
console.log(`  goals/game : ${(totGoals / totMatches).toFixed(2)}   real ~2.82`);
console.log(`  home/draw/away : ${(100*hw/totMatches).toFixed(0)}/${(100*dr/totMatches).toFixed(0)}/${(100*aw/totMatches).toFixed(0)}   real ~45/24/31`);
console.log(`  golden boot : avg ${(topScorers.reduce((a,b)=>a+b,0)/K).toFixed(0)}, range ${Math.min(...topScorers)}-${Math.max(...topScorers)}   real ~28 (23-36)`);
