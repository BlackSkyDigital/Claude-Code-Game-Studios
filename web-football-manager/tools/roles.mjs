// Role-distribution probe: run N matches and report what SHARE of shots and
// goals each role band takes, vs real Premier League norms. Fast signal for
// tuning where goals come from (the golden-boot / midfield-scoring problem).
//
// Real PL goal split (rough): ST ~33%, wide ~27%, midfield ~22%, defenders ~14%
// (incl. set pieces), own/other ~4%. NB "wide" = wingers (MR/ML) only; the
// central attacking midfielder (AM) is a MIDFIELD scorer, not a wide one.
import { Match } from "../dist/engine/match.js";
import { TEAMS } from "../dist/engine/data.js";
import { tacticsForStyle } from "../dist/engine/tactics.js";

const N = Number(process.argv[2]) || 40;
const band = (r) => (r === "GK" ? "gk" : r === "ST" ? "st" : r === "MR" || r === "ML" ? "wide" : r === "MC" || r === "DM" || r === "AM" ? "mid" : "def");
const shots = { st: 0, wide: 0, mid: 0, def: 0, gk: 0 };
const goals = { st: 0, wide: 0, mid: 0, def: 0, gk: 0 };
let g = 0;
for (let s = 1; s <= N; s++) {
  // mix a few squads so it isn't only MCI/LIV shaping the distribution
  const h = TEAMS[s % TEAMS.length], a = TEAMS[(s * 3 + 1) % TEAMS.length];
  if (h === a) continue;
  const m = new Match(h, a, s * 11 + 5, { homeTactics: tacticsForStyle(h.style ?? "balanced"), awayTactics: tacticsForStyle(a.style ?? "balanced"), homeFormation: h.formation, awayFormation: a.formation });
  m.simulate();
  for (const p of m.snapshot().players) {
    shots[band(p.role)] += p.shots;
    goals[band(p.role)] += p.goals;
    g += p.goals;
  }
}
const tot = (o) => o.st + o.wide + o.mid + o.def + o.gk || 1;
const pct = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, ((100 * v) / tot(o)).toFixed(0) + "%"]));
console.log(`=== ROLE DISTRIBUTION over ${N} matches (${(g / N).toFixed(2)} goals/match) ===`);
console.log("shots:", pct(shots));
console.log("goals:", pct(goals), "  real ~ st 33 / wide 27 / mid 22 / def 14");
