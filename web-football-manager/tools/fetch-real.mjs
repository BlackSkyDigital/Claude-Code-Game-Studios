// Pull REAL Premier League data from API-Football (v3) to ground the simulation
// calibration in actual results: final standings and top scorers for the last 5
// seasons, plus (optionally) current squads.
//
// SECURITY: the API key is read from the environment, never hard-coded/committed:
//   APIFOOTBALL_KEY=xxxxx node tools/fetch-real.mjs
//
// NOTE: requires the host `v3.football.api-sports.io` to be on this environment's
// network egress allowlist (otherwise every request returns "Host not in
// allowlist"). The PL league id is 39; `season` is the season's start year.
const KEY = process.env.APIFOOTBALL_KEY;
if (!KEY) { console.error("Set APIFOOTBALL_KEY in the environment first."); process.exit(1); }
const BASE = "https://v3.football.api-sports.io";
const PL = 39;
const SEASONS = [2021, 2022, 2023, 2024, 2025];

async function api(path) {
  const r = await fetch(`${BASE}${path}`, { headers: { "x-apisports-key": KEY } });
  const j = await r.json();
  if (j.errors && Object.keys(j.errors).length) console.error("API errors:", j.errors);
  return j.response;
}

const land = { 1: [], 4: [], 7: [], 10: [], 17: [], 20: [] };
const boots = [];
for (const season of SEASONS) {
  const st = await api(`/standings?league=${PL}&season=${season}`);
  const rows = st?.[0]?.league?.standings?.[0];
  if (!rows) { console.log(`season ${season}: no standings (yet?)`); continue; }
  for (const p of Object.keys(land)) if (rows[p - 1]) land[p].push(rows[p - 1].points);
  const champ = rows[0];
  console.log(`${season}: champ ${champ.team.name} ${champ.points} · 4th ${rows[3]?.points} · 17th ${rows[16]?.points} · 20th ${rows[19]?.points}`);
  const top = await api(`/players/topscorers?league=${PL}&season=${season}`);
  const t0 = top?.[0];
  if (t0) { const g = t0.statistics[0].goals.total; boots.push(g); console.log(`   golden boot: ${t0.player.name} (${t0.statistics[0].team.name}) ${g}`); }
}
const avg = (a) => a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(0) : "n/a";
console.log("\n=== REAL LANDMARK AVERAGES (use as calibration targets) ===");
for (const p of [1, 4, 7, 10, 17, 20]) console.log(`  ${p}th: ${avg(land[p])} pts  (${land[p].join(", ")})`);
console.log(`  golden boot: ${avg(boots)}  (${boots.join(", ")})`);
