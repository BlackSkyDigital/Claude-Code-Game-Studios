/**
 * Headless verification: simulate many matches and report the score
 * distribution. This proves the engine produces plausible football (sane
 * scorelines, shot counts) without needing a browser.
 *
 * Run with: npm run simtest
 */
import { Match } from "./match.js";
import { TEAMS } from "./data.js";

const N = 200;
const home = TEAMS[0]!; // Manchester City
const away = TEAMS[1]!; // Liverpool

let homeGoals = 0;
let awayGoals = 0;
let homeWins = 0;
let draws = 0;
let awayWins = 0;
let totalShots = 0;
const scoreline = new Map<string, number>();

for (let seed = 1; seed <= N; seed++) {
  const m = new Match(home, away, seed);
  m.simulate();
  const [h, a] = m.score;
  homeGoals += h;
  awayGoals += a;
  totalShots += m.shots[0] + m.shots[1];
  if (h > a) homeWins++;
  else if (h < a) awayWins++;
  else draws++;
  const key = `${h}-${a}`;
  scoreline.set(key, (scoreline.get(key) ?? 0) + 1);
}

console.log(`Simulated ${N} matches: ${home.short} (home) vs ${away.short} (away)\n`);
console.log(`Avg goals/match : ${((homeGoals + awayGoals) / N).toFixed(2)}`);
console.log(`Avg ${home.short} : ${(homeGoals / N).toFixed(2)}`);
console.log(`Avg ${away.short} : ${(awayGoals / N).toFixed(2)}`);
console.log(`Avg shots/match : ${(totalShots / N).toFixed(1)}`);
console.log(
  `Results         : ${home.short} ${homeWins} / Draw ${draws} / ${away.short} ${awayWins}`,
);

const top = [...scoreline.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
console.log(`\nMost common scorelines (home-away):`);
for (const [k, v] of top) {
  console.log(`  ${k}  ×${v}`);
}

// sample one match's goals as a sanity check on commentary
const sample = new Match(home, away, 7);
sample.simulate();
console.log(`\nSample match (seed 7) — ${home.short} ${sample.score[0]}-${sample.score[1]} ${away.short}`);
for (const e of sample.events.filter((e) => e.type === "goal")) {
  console.log(`  ${e.minute}'  ${e.text}`);
}
