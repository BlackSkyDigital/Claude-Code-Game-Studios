// Player-instruction diagnostics: apply an individual instruction to a group of
// players on the home side and measure how the match stats move vs the same side
// with no instruction. Same team both ends, neutral venue, so the delta is the
// instruction. Proves per-player instructions affect play in the right direction.
import { Match } from "../dist/engine/match.js";
import { TEAMS } from "../dist/engine/data.js";
import { tacticsForStyle } from "../dist/engine/tactics.js";

const N = Number(process.argv[2]) || 30;
const BASE = TEAMS[0];

// build a team variant: apply `instr` to every player whose role passes `match`
function variant(instr, match) {
  return {
    ...BASE,
    players: BASE.players.map((p) =>
      match(p.role)
        ? { ...p, instructions: { ...(p.instructions ?? {}), ...instr } }
        : p,
    ),
  };
}

function sim(homeTeam) {
  const acc = { gf: 0, ga: 0, sf: 0, sa: 0, cmp: 0, oppCmp: 0, fouls: 0, yel: 0,
    takeOns: 0, crosses: 0, dist: 0 };
  for (let s = 1; s <= N; s++) {
    const m = new Match(homeTeam, BASE, s * 7 + 3, {
      homeTactics: tacticsForStyle("balanced"), awayTactics: tacticsForStyle("balanced"), neutral: true,
    });
    m.simulate();
    acc.gf += m.score[0]; acc.ga += m.score[1];
    acc.sf += m.shots[0]; acc.sa += m.shots[1];
    acc.cmp += (m.passesComp[0] / (m.passesAtt[0] || 1)) * 100;
    acc.oppCmp += (m.passesComp[1] / (m.passesAtt[1] || 1)) * 100;
    acc.fouls += m.foulCount; acc.yel += m.yellowCards;
    acc.takeOns += m.takeOnAtt; acc.crosses += m.crossCount;
    acc.dist += m.shotDist.reduce((a, b) => a + b, 0) / (m.shotDist.length || 1);
  }
  for (const k of Object.keys(acc)) acc[k] /= N;
  return acc;
}

const fwd = (r) => r === "ST" || r === "AM" || r === "MR" || r === "ML";
const wide = (r) => r === "MR" || r === "ML" || r === "DL" || r === "DR";
const mid = (r) => r === "MC" || r === "DM";
const def = (r) => r === "DC" || r === "DL" || r === "DR";
const all = () => true;

function row(label, a) {
  return `${label.padEnd(14)} GF ${a.gf.toFixed(2)} GA ${a.ga.toFixed(2)} | shots ${a.sf.toFixed(0)}-${a.sa.toFixed(0)} | cmp ${a.cmp.toFixed(0)}% oppCmp ${a.oppCmp.toFixed(0)}% | fouls ${a.fouls.toFixed(1)} | takeOn ${a.takeOns.toFixed(0)} cross ${a.crosses.toFixed(0)} shotDist ${a.dist.toFixed(1)}`;
}

const tests = [
  ["shoot=more (fwd)",      variant({ shoot: "more" }, fwd),        "shots UP, shotDist UP"],
  ["dribble=more (wide)",   variant({ dribble: "more" }, wide),     "takeOns UP"],
  ["cross=more (wide)",     variant({ cross: "more" }, wide),       "crosses UP"],
  ["tackleHarder (def+mid)",variant({ tackleHarder: true }, (r) => def(r) || mid(r)), "fouls UP"],
  ["closeDown=more (fwd)",  variant({ closeDown: "more" }, fwd),    "oppCmp DOWN"],
  ["getForward (def)",      variant({ getForward: true }, def),     "shots UP, GA UP (gung-ho)"],
  ["holdPosition (mid)",    variant({ holdPosition: true }, mid),   "GA DOWN (disciplined)"],
  ["passDirect (all)",      variant({ passDirectness: "direct" }, all), "shotDist/shots shift"],
];

console.log(`=== PLAYER INSTRUCTION SWEEP (MCI v MCI, neutral, ${N} seeds) ===`);
console.log(row("baseline", sim(BASE)));
for (const [label, team, expect] of tests) {
  console.log(`\n# ${label}  (expect: ${expect})`);
  console.log(row("  applied", sim(team)));
}
