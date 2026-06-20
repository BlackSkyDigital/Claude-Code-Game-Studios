import { Match } from "../dist/engine/match.js";
import { TEAMS } from "../dist/engine/data.js";
import { FORMATIONS } from "../dist/engine/formations.js";
const N = 12;
const poss=(m)=>{const t=m.possessionTicks[0]+m.possessionTicks[1]||1;return m.possessionTicks[0]/t*100;};
console.log(`=== MCI in each FORMATION vs LIV (4-3-3), ${N} seeds, balanced tactics ===`);
console.log("formation   poss%  shots(f-a)  goals(f-a)  W-D-L");
for(const f of Object.keys(FORMATIONS)){
  const home={...TEAMS[0], formation:f};
  let p=0,sf=0,sa=0,gf=0,ga=0,w=0,d=0,l=0;
  for(let seed=1;seed<=N;seed++){
    const m=new Match(home,TEAMS[1],seed); m.simulate();
    p+=poss(m);sf+=m.shots[0];sa+=m.shots[1];gf+=m.score[0];ga+=m.score[1];
    if(m.score[0]>m.score[1])w++;else if(m.score[0]<m.score[1])l++;else d++;
  }
  console.log(f.padEnd(11),`${Math.round(p/N)}`.padStart(4),
    `  ${(sf/N).toFixed(0)}-${(sa/N).toFixed(0)}`.padStart(9),
    `  ${(gf/N).toFixed(1)}-${(ga/N).toFixed(1)}`.padStart(10),
    `  ${w}-${d}-${l}`);
}
