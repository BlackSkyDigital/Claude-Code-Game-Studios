import { Match } from "../dist/engine/match.js";
import { TEAMS } from "../dist/engine/data.js";
const N = 24;
let g=0,sh=0,sot=0,pa=0,pc=0,fo=0,ye=0,re=0,pe=0,co=0,off=0,subs=0;
let owned=0,inflight=0,ticks=0,turn=0;
const gr={};
for(let seed=1;seed<=N;seed++){
  const m=new Match(TEAMS[0],TEAMS[1],seed); let last=null;
  while(!m.finished){m.step();const s=m.snapshot();ticks++;const o=s.players.find(p=>p.hasBall);
    if(o){owned++;if(o.team!==last){turn++;last=o.team;}}else if(!s.ballMode.includes('loose'))inflight++;}
  g+=m.score[0]+m.score[1];sh+=m.shots[0]+m.shots[1];sot+=m.shotsOnTarget[0]+m.shotsOnTarget[1];
  pa+=m.passesAtt[0]+m.passesAtt[1];pc+=m.passesComp[0]+m.passesComp[1];
  fo+=m.foulCount;ye+=m.yellowCards;re+=m.redCards;pe+=m.penaltyCount;co+=m.cornerCount;off+=m.offsideCount;subs+=m.subsMade;
  for(const p of m.snapshot().players){gr[p.role]=(gr[p.role]||0)+p.goals;}
}
const f=(x)=>x.toFixed(1);
const chk=(v,lo,hi)=> v>=lo&&v<=hi ? "OK " : (v<lo?"LOW":"HI ");
const row=(name,v,lo,hi,unit="")=>`  ${chk(v,lo,hi)}  ${name.padEnd(16)} ${f(v)}${unit}  (real ${lo}-${hi}${unit})`;
console.log(`=== DASHBOARD (${N} matches, MCI v LIV) ===`);
console.log(row("goals/match",g/N,2.5,3.1));
console.log(row("shots/match",sh/N,23,30));
console.log(row("on-target %",sot/sh*100,30,38,"%"));
console.log(row("pass cmp %",pc/pa*100,79,87,"%"));
console.log(row("ball in-flight %",inflight/ticks*100,24,32,"%"));
console.log(row("fouls/match",fo/N,18,26));
console.log(row("yellows/match",ye/N,2.5,4.5));
console.log(row("reds/match",re/N,0.1,0.35));
console.log(row("penalties/match",pe/N,0.2,0.45));
console.log(row("corners/match",co/N,8,12));
console.log(row("offsides/match",off/N,2,5));
console.log(row("subs/match",subs/N,3,6));
const tot=Object.values(gr).reduce((a,b)=>a+b,0);
console.log(`  --   goals by role: ST ${Math.round((gr.ST||0)/tot*100)}% wide ${Math.round(((gr.MR||0)+(gr.ML||0))/tot*100)}% mid ${Math.round(((gr.MC||0)+(gr.AM||0)+(gr.DM||0))/tot*100)}% def ${Math.round(((gr.DC||0)+(gr.DL||0)+(gr.DR||0))/tot*100)}%`);
console.log(`  --   turnovers/match ~${Math.round(turn/N)} (real ~150-250)`);
