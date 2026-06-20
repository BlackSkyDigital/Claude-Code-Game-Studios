import { Match } from "../dist/engine/match.js";
import { TEAMS } from "../dist/engine/data.js";
const m = new Match(TEAMS[0], TEAMS[1], 7);
const COLS=53, ROWS=21;
function frame(s){
  const g=Array.from({length:ROWS},()=>Array(COLS).fill('.'));
  const L=(role)=>({GK:'K',DC:'D',DL:'D',DR:'D',DM:'M',MC:'M',ML:'W',MR:'W',AM:'A',ST:'S'}[role]||'?');
  for(const p of s.players){
    const c=Math.max(0,Math.min(COLS-1,Math.round(p.x/105*(COLS-1))));
    const r=Math.max(0,Math.min(ROWS-1,Math.round(p.y/68*(ROWS-1))));
    g[r][c]= p.team===0? L(p.role) : L(p.role).toLowerCase();
  }
  const bc=Math.max(0,Math.min(COLS-1,Math.round(s.ball.x/105*(COLS-1))));
  const br=Math.max(0,Math.min(ROWS-1,Math.round(s.ball.y/68*(ROWS-1))));
  g[br][bc]='@';
  return g.map(row=>row.join('')).join('\n');
}
// find first sustained attacking passage after 5' that ends in a shot
let frames=[]; let capturing=false; let lastShot=-99;
let step=0;
while(!m.finished && step<54000){
  m.step(); step++;
  const s=m.snapshot();
  const t=s.time;
  if(t>300 && t<900){
    // capture every ~0.7s
    if(step%7===0) frames.push({t, s, owner:s.players.find(p=>p.hasBall), mode:s.ballMode});
  }
  if(frames.length>=10 && t>300) break;
}
for(const f of frames){
  const o=f.owner;
  console.log(`\n=== ${Math.floor(f.t/60)}:${String(Math.floor(f.t%60)).padStart(2,'0')}  ball=${f.mode}  owner=${o?o.name+'('+o.role+')':'loose'} ===`);
  console.log(frame(f.s));
}
console.log("\nLegend: UPPER=home(MCI) lower=away(LIV)  K=GK D=def M=mid W=wide A=AM S=ST  @=ball  left→right = MCI attacking →");
