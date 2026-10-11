// Headless balance check: node scripts/batch.mjs [seeds=10] [seconds=120] [route=1]
import { createSim, step } from '../src/logic/sim.js';
import { botInput } from '../src/logic/bot.js';

const [seeds = 10, secs = 120, route = 1] = process.argv.slice(2).map(Number);
const total = { deaths: 0, kills: 0, causes: {} };
for (let seed = 1; seed <= seeds; seed++) {
  const s = createSim({ seed });
  for (let i = 0; i < secs * 60 && !s.over; i++) step(s, botInput(s, { route }), 1 / 60);
  console.log(`seed ${seed}: d ${s.player.d | 0} score ${s.score | 0} deaths ${s.deaths} kills ${s.kills} civ ${s.civKills ?? 0} ${JSON.stringify(s.causes)}`);
  total.deaths += s.deaths; total.kills += s.kills;
  for (const [k, v] of Object.entries(s.causes)) total.causes[k] = (total.causes[k] ?? 0) + v;
}
console.log(`avg deaths ${(total.deaths / seeds).toFixed(1)}, avg kills ${(total.kills / seeds).toFixed(1)}`, total.causes);
