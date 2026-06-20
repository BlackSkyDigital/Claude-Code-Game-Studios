import { Match } from "../dist/engine/match.js";
import { TEAMS } from "../dist/engine/data.js";
import { tacticsForStyle, TACTICAL_STYLES } from "../dist/engine/tactics.js";
const N = 12;
const poss=(m)=>{const t=m.possessionTicks[0]+m.possessionTicks[1]||1;return m.possessionTicks[0]/t*100;};
console.log(`=== EACH STYLE (home) vs BALANCED (away), ${N} seeds, MCI v LIV ===`);
console.log("style".padEnd(20),"poss%  shots(f-a)  goals(f-a)  pass%");
for(const s of TACTICAL_STYLES){
  let p=0,sf=0,sa=0,gf=0,ga=0,pa=0,pc=0;
  for(let seed=1;seed<=N;seed++){
    const m=new Match(TEAMS[0],TEAMS[1],seed,{homeTactics:tacticsForStyle(s),awayTactics:tacticsForStyle("balanced")});
    m.simulate();
    p+=poss(m);sf+=m.shots[0];sa+=m.shots[1];gf+=m.score[0];ga+=m.score[1];pa+=m.passesAtt[0];pc+=m.passesComp[0];
  }
  console.log(s.padEnd(20),
    `${Math.round(p/N)}`.padStart(4),
    ` ${(sf/N).toFixed(0)}-${(sa/N).toFixed(0)}`.padStart(9),
    `  ${(gf/N).toFixed(1)}-${(ga/N).toFixed(1)}`.padStart(10),
    `  ${Math.round(pc/pa*100)}%`.padStart(6));
}
