// Current Ability (CA) readout — FM-style 1–200, derived from the existing
// attributes (no new authored data). Lists each squad's players by CA and a
// team-average, so squad strength can be sanity-checked against real life.
// Usage: node tools/ca.mjs            → team-average table (all 20 teams)
//        node tools/ca.mjs MCI        → full player list for one team
import { TEAMS } from "../dist/engine/data.js";
import { currentAbility } from "../dist/engine/attributes.js";

const arg = process.argv[2];
const caOf = (p) => currentAbility(p.role, p.attrs);
const teamAvg = (t, n = 11) =>
  Math.round(t.players.map(caOf).sort((a, b) => b - a).slice(0, n).reduce((a, b) => a + b, 0) / n);

if (arg) {
  const t = TEAMS.find((x) => x.short === arg.toUpperCase() || x.name.toLowerCase().includes(arg.toLowerCase()));
  if (!t) { console.log(`No team matching "${arg}". Codes: ${TEAMS.map((x) => x.short).join(", ")}`); process.exit(0); }
  console.log(`=== ${t.name} — Current Ability (1–200) ===`);
  const all = [...t.players.map((p) => ({ p, b: true })), ...(t.bench ?? []).map((p) => ({ p, b: false }))];
  all.map(({ p, b }) => ({ p, b, ca: caOf(p) })).sort((a, b) => b.ca - a.ca)
    .forEach(({ p, b, ca }) => console.log(`  ${String(ca).padStart(3)}  ${p.role.padEnd(3)} ${p.name}${b ? "" : "  (sub)"}`));
  console.log(`  XI average: ${teamAvg(t)}`);
} else {
  console.log("=== TEAM CURRENT ABILITY (XI average, 1–200) ===");
  TEAMS.map((t) => ({ t, ca: teamAvg(t) })).sort((a, b) => b.ca - a.ca)
    .forEach(({ t, ca }, i) => console.log(`  ${String(i + 1).padStart(2)}  ${t.short}  ${ca}  ${t.name}`));
}
