import { Match } from "../dist/engine/match.js";
import { TEAMS } from "../dist/engine/data.js";
let owned=0,loose=0,inflight=0,ticks=0; let possChanges=0,lastTeam=null,possLen=[],cur=0;
const m=new Match(TEAMS[0],TEAMS[1],7);
while(!m.finished){ m.step(); const s=m.snapshot(); ticks++;
  const o=s.players.find(p=>p.hasBall);
  if(o){owned++; const tm=o.team; if(tm!==lastTeam){if(cur>0)possLen.push(cur);cur=0;possChanges++;lastTeam=tm;} cur++; }
  else { if(s.ballMode==='loose') loose++; else inflight++; }
}
console.log(`ball OWNED ${Math.round(owned/ticks*100)}%  in-flight(pass/shot) ${Math.round(inflight/ticks*100)}%  LOOSE ${Math.round(loose/ticks*100)}%`);
console.log(`possessions: ${possChanges}, avg length ${(possLen.reduce((a,b)=>a+b,0)/possLen.length*0.1).toFixed(1)}s`);
