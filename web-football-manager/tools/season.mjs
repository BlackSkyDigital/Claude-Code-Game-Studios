// Full Premier League season simulation: every team plays every other home AND
// away (380 matches for 20 teams), each side using its real formation, default
// tactical style and per-player instructions from the dataset. Prints the final
// table, top scorers and league-wide stats.
//
// Usage: node tools/season.mjs [seedOffset]
import { Match } from "../dist/engine/match.js";
import { TEAMS } from "../dist/engine/data.js";
import { tacticsForStyle } from "../dist/engine/tactics.js";

const SEED = Number(process.argv[2]) || 0;
const tac = (t) => tacticsForStyle(t.style ?? "balanced");

const table = TEAMS.map((t) => ({ short: t.short, name: t.name, P: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0, Pts: 0 }));
const idx = Object.fromEntries(TEAMS.map((t, i) => [t.short, i]));
const scorers = new Map(); // "short|name" -> goals
let totalGoals = 0, homeWins = 0, awayWins = 0, draws = 0, matches = 0;

let fixture = 0;
for (let h = 0; h < TEAMS.length; h++) {
  for (let a = 0; a < TEAMS.length; a++) {
    if (h === a) continue;
    const home = TEAMS[h], away = TEAMS[a];
    const m = new Match(home, away, fixture++ * 101 + SEED + 17, {
      homeTactics: tac(home), awayTactics: tac(away),
      homeFormation: home.formation, awayFormation: away.formation,
    });
    m.simulate();
    const [gh, ga] = m.score;
    const th = table[h], ta = table[a];
    th.P++; ta.P++; th.GF += gh; th.GA += ga; ta.GF += ga; ta.GA += gh;
    totalGoals += gh + ga; matches++;
    if (gh > ga) { th.W++; ta.L++; th.Pts += 3; homeWins++; }
    else if (gh < ga) { ta.W++; th.L++; ta.Pts += 3; awayWins++; }
    else { th.D++; ta.D++; th.Pts++; ta.Pts++; draws++; }
    for (const p of m.snapshot().players) {
      if (p.goals <= 0) continue;
      const club = p.team === 0 ? home.short : away.short;
      const key = `${club}|${p.name}`;
      scorers.set(key, (scorers.get(key) ?? 0) + p.goals);
    }
  }
}

table.sort((x, y) => y.Pts - x.Pts || (y.GF - y.GA) - (x.GF - x.GA) || y.GF - x.GF);
console.log(`=== PREMIER LEAGUE — FINAL TABLE (38 games, ${matches} matches) ===`);
console.log("Pos Team   P   W  D  L   GF  GA   GD  Pts");
table.forEach((t, i) => {
  const gd = t.GF - t.GA;
  console.log(
    `${String(i + 1).padStart(2)}  ${t.short.padEnd(4)} ${String(t.P).padStart(2)} ${String(t.W).padStart(3)} ${String(t.D).padStart(2)} ${String(t.L).padStart(2)} ${String(t.GF).padStart(4)} ${String(t.GA).padStart(3)} ${(gd >= 0 ? "+" + gd : gd).toString().padStart(4)} ${String(t.Pts).padStart(4)}`,
  );
});

const top = [...scorers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
console.log("\n=== TOP SCORERS ===");
top.forEach(([k, g], i) => {
  const [club, name] = k.split("|");
  console.log(`${String(i + 1).padStart(2)}  ${String(g).padStart(2)}  ${name} (${club})`);
});

console.log("\n=== LEAGUE STATS ===");
console.log(`Goals: ${totalGoals}  (${(totalGoals / matches).toFixed(2)}/game)`);
console.log(`Home wins ${homeWins} (${(100 * homeWins / matches).toFixed(0)}%) · Draws ${draws} (${(100 * draws / matches).toFixed(0)}%) · Away wins ${awayWins} (${(100 * awayWins / matches).toFixed(0)}%)`);
console.log(`Champions: ${table[0].name} (${table[0].Pts} pts) · Relegated: ${table.slice(-3).map((t) => t.short).join(", ")}`);
