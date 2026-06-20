// Multi-team × multi-formation grid: every team tries every formation against a
// common opponent (LIV, balanced 4-3-3) on a neutral venue. Each cell is the avg
// goal difference (team's perspective). Shows formations play distinctly AND
// interact with squad quality, with a variance summary per team & per formation.
import { Match } from "../dist/engine/match.js";
import { TEAMS } from "../dist/engine/data.js";
import { tacticsForStyle } from "../dist/engine/tactics.js";
import { FORMATION_NAMES } from "../dist/engine/formations.js";

const N = Number(process.argv[2]) || 10;
const OPP = TEAMS.find((t) => t.short === "LIV") ?? TEAMS[1];
const bal = () => tacticsForStyle("balanced");

const std = (xs) => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
};

function cell(team, formation) {
  let gd = 0;
  for (let s = 1; s <= N; s++) {
    const m = new Match(team, OPP, s * 5 + 1, {
      homeTactics: bal(), awayTactics: bal(), homeFormation: formation,
      awayFormation: "4-3-3", neutral: true,
    });
    m.simulate();
    gd += m.score[0] - m.score[1];
  }
  return gd / N;
}

console.log(`=== TEAM × FORMATION grid: avg GD vs ${OPP.short} (balanced 4-3-3), neutral, ${N} seeds ===`);
const header = "team".padEnd(6) + FORMATION_NAMES.map((f) => f.padStart(10)).join("");
console.log(header);
const colVals = FORMATION_NAMES.map(() => []);
for (const team of TEAMS) {
  const vals = [];
  let line = team.short.padEnd(6);
  FORMATION_NAMES.forEach((f, i) => {
    const v = cell(team, f);
    vals.push(v); colVals[i].push(v);
    line += (v >= 0 ? "+" : "") + v.toFixed(1).padStart(v >= 0 ? 9 : 10);
  });
  line += `   | spread ${std(vals).toFixed(2)}`;
  console.log(line);
}
console.log("\nFormation spread across teams (how much squad quality changes each shape):");
FORMATION_NAMES.forEach((f, i) => {
  console.log(`  ${f.padEnd(10)} mean ${(colVals[i].reduce((a, b) => a + b, 0) / colVals[i].length).toFixed(2)}  std ${std(colVals[i]).toFixed(2)}`);
});
