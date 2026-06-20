import { Match } from "../dist/engine/match.js";
import { TEAMS } from "../dist/engine/data.js";
import { makeAttrs } from "../dist/engine/attributes.js";
const MCI = TEAMS[0], LIV = TEAMS[1];
const N = 16;
const poss=(m)=>{const t=m.possessionTicks[0]+m.possessionTicks[1]||1;return m.possessionTicks[0]/t*100;};
// a generic, mediocre replacement in a given role
const weak = (name, num, role, ov=9) => ({ name, number: num, role, attrs: makeAttrs(role, ov), traits: [] });
function run(label, players){
  let gf=0,ga=0,sf=0,sa=0,p=0,w=0,d=0,l=0;
  const home={...MCI, players};
  for(let s=1;s<=N;s++){const m=new Match(home,LIV,s);m.simulate();
    gf+=m.score[0];ga+=m.score[1];sf+=m.shots[0];sa+=m.shots[1];p+=poss(m);
    if(m.score[0]>m.score[1])w++;else if(m.score[0]<m.score[1])l++;else d++;}
  console.log(label.padEnd(26),`goals ${(gf/N).toFixed(2)}-${(ga/N).toFixed(2)}  shots ${(sf/N).toFixed(0)}-${(sa/N).toFixed(0)}  poss ${Math.round(p/N)}%  ${w}-${d}-${l}`);
}
const base = MCI.players;
const swap=(i,pl)=>{const a=[...base];a[i]=pl;return a;};
console.log(`=== PLAYER IMPACT: MCI (variants) vs LIV, ${N} seeds ===`);
run("Full XI (baseline)", base);
run("- Haaland (weak ST)", swap(9, weak("Reserve-ST",99,"ST")));
run("- De Bruyne (weak MC)", swap(6, weak("Reserve-MC",98,"MC")));
run("- Rodri (weak DM)", swap(5, weak("Reserve-DM",97,"DM")));
run("- Dias+VVD... (weak DCs)", swap(2, weak("Res-DC1",96,"DC")).map((x,i)=>i===3?weak("Res-DC2",95,"DC"):x));
run("Weak XI (all ovr 10)", base.map((pd,i)=> i===0?weak("RGK",90,"GK",10):weak("R"+i,80+i,pd.role,10)));
run("Star XI (all ovr 19)", base.map((pd,i)=> ({...pd, attrs: makeAttrs(pd.role,19)})));
