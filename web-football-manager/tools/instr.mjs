// Team-instruction diagnostics: sweep each NEW team knob low vs high (holding
// everything else neutral) and report how the match stats move. Same team both
// sides on a NEUTRAL venue, so deltas are caused purely by the knob — not squad
// quality or home advantage. This proves each instruction affects play, and in
// the realistic direction.
import { Match } from "../dist/engine/match.js";
import { TEAMS } from "../dist/engine/data.js";
import { tacticsForStyle } from "../dist/engine/tactics.js";

const N = Number(process.argv[3]) || 30;
const T = TEAMS[0]; // same side both ends to isolate the knob

function sim(homeKnob) {
  const acc = { gf: 0, ga: 0, sf: 0, sa: 0, poss: 0, cmp: 0, oppCmp: 0, fouls: 0, yel: 0,
    corners: 0, offs: 0, takeOns: 0, crosses: 0, dist: 0, side: 0, nshots: 0 };
  for (let s = 1; s <= N; s++) {
    const home = tacticsForStyle("balanced");
    Object.assign(home, homeKnob);
    const m = new Match(T, T, s * 7 + 3, {
      homeTactics: home, awayTactics: tacticsForStyle("balanced"), neutral: true,
    });
    m.simulate();
    const pt = m.possessionTicks[0] + m.possessionTicks[1] || 1;
    acc.gf += m.score[0]; acc.ga += m.score[1];
    acc.sf += m.shots[0]; acc.sa += m.shots[1];
    acc.poss += (m.possessionTicks[0] / pt) * 100;
    acc.cmp += (m.passesComp[0] / (m.passesAtt[0] || 1)) * 100;
    acc.oppCmp += (m.passesComp[1] / (m.passesAtt[1] || 1)) * 100;
    acc.fouls += m.foulCount; acc.yel += m.yellowCards;
    acc.corners += m.cornerCount; acc.offs += m.offsideCount;
    acc.takeOns += m.takeOnAtt; acc.crosses += m.crossCount;
    const sd = m.shotSideByTeam[0];
    acc.side += sd.reduce((a, b) => a + b, 0) / (sd.length || 1);
    acc.dist += m.shotDist.reduce((a, b) => a + b, 0) / (m.shotDist.length || 1);
  }
  for (const k of Object.keys(acc)) acc[k] /= N;
  return acc;
}

function row(label, a) {
  return `${label.padEnd(10)} GF ${a.gf.toFixed(2)} GA ${a.ga.toFixed(2)} | shots ${a.sf.toFixed(0)}-${a.sa.toFixed(0)} | poss ${a.poss.toFixed(0)}% | cmp ${a.cmp.toFixed(0)}% oppCmp ${a.oppCmp.toFixed(0)}% | fouls ${a.fouls.toFixed(1)} yel ${a.yel.toFixed(1)} | corn ${a.corners.toFixed(1)} off ${a.offs.toFixed(1)} | takeOn ${a.takeOns.toFixed(0)} cross ${a.crosses.toFixed(0)} | shotDist ${a.dist.toFixed(1)} sideY ${a.side.toFixed(1)}`;
}

const knobs = {
  tackling:        [{ tackling: 0.1 }, { tackling: 0.95 }, "fouls/yellows UP"],
  shootOnSight:    [{ shootOnSight: 0.1 }, { shootOnSight: 0.95 }, "shots UP, shotDist UP"],
  creativeFreedom: [{ creativeFreedom: 0.1 }, { creativeFreedom: 0.95 }, "takeOns UP"],
  counterPress:    [{ counterPress: 0.05 }, { counterPress: 1.0 }, "oppCmp DOWN, shots UP"],
  counterAttack:   [{ counterAttack: 0.05 }, { counterAttack: 1.0 }, "shots/GF UP"],
  offsideTrap:     [{ offsideTrap: 0.0 }, { offsideTrap: 1.0 }, "offsides UP"],
  focusPlay:       [{ focusPlay: -1 }, { focusPlay: 1 }, "sideY -> + (L to R)"],
};

const only = process.argv[2];
console.log(`=== TEAM INSTRUCTION SWEEP (MCI v MCI, neutral, ${N} seeds; only HOME knob varies) ===`);
for (const [name, [lo, hi, expect]] of Object.entries(knobs)) {
  if (only && only !== name) continue;
  console.log(`\n# ${name}  (expect: ${expect})`);
  console.log(row("  low", sim(lo)));
  console.log(row("  high", sim(hi)));
}
