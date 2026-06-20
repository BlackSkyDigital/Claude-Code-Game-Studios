import { Match } from "../dist/engine/match.js";
import { TEAMS } from "../dist/engine/data.js";
import { tacticsForStyle } from "../dist/engine/tactics.js";
const styles = ["balanced","tiki-taka","gegenpress","control-possession","counter","route-one","catenaccio"];
const N = Number(process.argv[2]) || 8;
const abbr = {"balanced":"bal","tiki-taka":"tiki","gegenpress":"gegen","control-possession":"ctrl","counter":"cntr","route-one":"r-one","catenaccio":"cat"};
console.log(`=== TACTICS HEAD-TO-HEAD: avg goal diff (home row vs away col), ${N} seeds, MCI v LIV ===`);
console.log("home\\away".padEnd(10)+styles.map(s=>abbr[s].padStart(6)).join(""));
for(const h of styles){
  let row=abbr[h].padEnd(10);
  for(const a of styles){
    let gd=0;
    for(let s=1;s<=N;s++){const m=new Match(TEAMS[0],TEAMS[1],s*5+1,{homeTactics:tacticsForStyle(h),awayTactics:tacticsForStyle(a)});m.simulate();gd+=m.score[0]-m.score[1];}
    const v=(gd/N);
    row += (v>=0?"+":"")+v.toFixed(1).padStart(v>=0?5:6);
  }
  console.log(row);
}
