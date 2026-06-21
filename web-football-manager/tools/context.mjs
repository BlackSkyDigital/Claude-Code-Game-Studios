// Context probe: shows the universal "laws" scale the match coherently — the
// SAME engine produces a scrappier derby, a tenser cup final, and form/momentum
// swings, just from context inputs (no special-case code).
import { Match } from "../dist/engine/match.js";
import { TEAMS } from "../dist/engine/data.js";
import { tacticsForStyle } from "../dist/engine/tactics.js";
const MCI = TEAMS[0], LIV = TEAMS[1];
const N = 40;
function run(ctx) {
  let gf = 0, ga = 0, fouls = 0, yel = 0, red = 0;
  for (let s = 1; s <= N; s++) {
    const m = new Match(MCI, LIV, s * 9 + 1, { homeTactics: tacticsForStyle("balanced"), awayTactics: tacticsForStyle("balanced"), context: ctx });
    m.simulate();
    gf += m.score[0]; ga += m.score[1]; fouls += m.foulCount; yel += m.yellowCards; red += m.redCards;
  }
  return `GF ${(gf / N).toFixed(2)} GA ${(ga / N).toFixed(2)} | fouls ${(fouls / N).toFixed(1)} | yellows ${(yel / N).toFixed(2)} | reds ${(red / N).toFixed(2)}`;
}
console.log(`=== MATCH CONTEXT LAWS (MCI v LIV, ${N} seeds) ===`);
console.log("normal league :", run(undefined));
console.log("fierce DERBY  :", run({ rivalry: 1 }), "  (expect: fouls & cards UP)");
console.log("cup FINAL     :", run({ importance: 1 }), "  (expect: fouls UP, home crowd edge UP)");
console.log("home FLYING   :", run({ homeMorale: 0.9, awayMorale: -0.9 }), "  (expect: home GD UP)");
console.log("home in CRISIS:", run({ homeMorale: -0.9, awayMorale: 0.9 }), "  (expect: home GD DOWN)");

// momentum: after the FIRST goal, does the scoring side take the next goal more
// often than 50%? (a real "on top" effect, emergent from momentum)
let sameNext = 0, totalPairs = 0;
for (let s = 1; s <= 120; s++) {
  const m = new Match(MCI, LIV, s * 5 + 3, { homeTactics: tacticsForStyle("balanced"), awayTactics: tacticsForStyle("balanced") });
  const order = [];
  const realScore = m.scoreGoal.bind(m);
  // track goal order via events after simulate
  m.simulate();
  let prev = null;
  for (const e of m.events) {
    if (e.type !== "goal") continue;
    const t = e.team;
    if (prev !== null) { totalPairs++; if (t === prev) sameNext++; }
    prev = t;
  }
}
console.log(`\nmomentum: after a goal, the SAME side scores next ${(100 * sameNext / totalPairs).toFixed(0)}% of the time (random would be ~50%)`);
