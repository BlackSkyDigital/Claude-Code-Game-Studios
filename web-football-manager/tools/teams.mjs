import { Match } from "../dist/engine/match.js";
import { TEAMS } from "../dist/engine/data.js";
const N = 8; // seeds per fixture (home & away)
const pts={},gf={},ga={},pl={};
for(const t of TEAMS){pts[t.short]=0;gf[t.short]=0;ga[t.short]=0;pl[t.short]=0;}
for(let i=0;i<TEAMS.length;i++)for(let j=0;j<TEAMS.length;j++){
  if(i===j)continue;
  for(let s=1;s<=N;s++){
    const m=new Match(TEAMS[i],TEAMS[j],s*7+1); m.simulate();
    const [h,a]=m.score;
    gf[TEAMS[i].short]+=h; ga[TEAMS[i].short]+=a; gf[TEAMS[j].short]+=a; ga[TEAMS[j].short]+=h;
    pl[TEAMS[i].short]++; pl[TEAMS[j].short]++;
    if(h>a){pts[TEAMS[i].short]+=3;} else if(h<a){pts[TEAMS[j].short]+=3;} else {pts[TEAMS[i].short]++;pts[TEAMS[j].short]++;}
  }
}
console.log(`=== ROUND ROBIN (${N} seeds each way, balanced tactics) ===`);
console.log("team   P   Pts   GF   GA   GD   ppg");
for(const [s,p] of Object.entries(pts).sort((a,b)=>b[1]-a[1])){
  console.log(`${s}   ${pl[s]}   ${String(p).padStart(3)}   ${gf[s]}   ${ga[s]}   ${gf[s]-ga[s]>=0?'+':''}${gf[s]-ga[s]}   ${(p/pl[s]).toFixed(2)}`);
}
