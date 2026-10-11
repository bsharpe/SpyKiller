// Call from main.js when the URL has ?debug=1: installDebugHooks(game).
// A hidden automation tab pauses requestAnimationFrame, so Phaser never advances on its own: loading stalls, scenes
// never start, sound 'complete' never fires. These step the loop by hand on synthetic 60 fps timestamps, then wait for
// real time to pass the last one, because a screenshot that resumes rAF with an older timestamp breaks physics.
export function installDebugHooks(game) {
  window.__game = game;
  let t = 0;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  game.stepFrames = async n => {
    t = Math.max(t, performance.now());
    for (let i = 0; i < n; i++) game.loop.step(t += 1000 / 60);
    await sleep(t - performance.now());
  };
  game.stepUntil = async (key, timeoutMs = 30000) => { // loading needs real time too, so step in small bursts
    const end = performance.now() + timeoutMs;
    while (!game.scene.isActive(key)) {
      if (performance.now() > end) throw new Error(`scene ${key} not active after ${timeoutMs} ms`);
      await game.stepFrames(10);
      await sleep(100);
    }
  };
}
