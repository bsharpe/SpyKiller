// Post-deploy check: node smoke.mjs https://your.domain
// Edit EXPECTED for the project: the game's real files must be 200, everything that must stay private must be 404.
const base = process.argv[2];
if (!base) { console.error('usage: node smoke.mjs <base-url>'); process.exit(2); }
const EXPECTED = {
  '/': 200, '/src/main.js': 200, '/src/logic/sim.js': 200, '/src/scenes/Run.js': 200, '/og.jpg': 200,
  '/.git/HEAD': 404, '/docs/': 404, '/test/': 404, '/package.json': 404, '/wrangler.jsonc': 404, '/README.md': 404, '/scripts/dev.mjs': 404, '/.assetsignore': 404,
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

let failed = 0;
for (const [path, want] of Object.entries(EXPECTED)) {
  let got;
  for (let attempt = 0; attempt < 3; attempt++) { // the edge can answer 500 for a few seconds right after a deploy
    got = (await fetch(base + path, { method: 'HEAD', redirect: 'manual' })).status;
    if (got === want) break;
    await sleep(2000);
  }
  if (got !== want) failed++;
  console.log(`${got === want ? 'ok  ' : 'FAIL'} ${got} ${path} (want ${want})`);
}
process.exit(failed ? 1 : 0);
