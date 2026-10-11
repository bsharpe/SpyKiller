import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim, step, spawn } from '../src/logic/sim.js';
import { botInput } from '../src/logic/bot.js';
import { T } from '../src/logic/tuning.js';
import { laneOffsets, laneX } from '../src/logic/track.js';

const DT = 1 / 60;
const run = (s, secs, input) => {
  for (let i = 0; i < secs * 60; i++) step(s, typeof input === 'function' ? input(s) : input, DT);
};
const bot = s => botInput(s);
const alive = s => s.ents.filter(e => !e.dead);

test('driving earns points for distance covered', () => {
  const s = createSim({ seed: 1, enemies: false });
  run(s, 5, bot);
  assert.ok(s.player.d > 1000);
  assert.ok(Math.abs(s.score - s.player.d * T.pointsPerPx) < 1);
});

test('shooting a civilian stops the score from counting for a while', () => {
  const s = createSim({ seed: 1, enemies: false });
  const civ = spawn(s, 'civ', { x: s.player.x, d: 160, speed: 60 });
  run(s, 0.6, { fire: true });
  assert.ok(civ.dead, 'civilian should be shot');
  assert.ok(s.noScore > 0);
  const before = s.score;
  run(s, 2, { up: true });
  assert.ok(s.player.d > 300);
  assert.equal(s.score, before);
});

test('the shoulder is drivable and slows you down; only going deep into the grass crashes', () => {
  const s = createSim({ seed: 1, enemies: false });
  const edge = s.track.at(0).strips[0].r;
  s.player.speed = T.hiMax; s.player.inv = 0;
  s.player.x = edge + T.shoulder - 4;
  run(s, 0.5, { up: true, hi: true });
  assert.equal(s.player.alive, true, 'shoulder must not kill');
  assert.ok(s.player.speed < T.hiMax * 0.9, 'shoulder should slow the car');
  s.player.x = edge + T.shoulder + T.grassDepth - 4;
  step(s, { up: true, hi: true }, DT);
  assert.equal(s.player.alive, true, 'a little way into the grass is survivable');
  s.player.x = edge + T.shoulder + T.grassDepth + 6;
  step(s, {}, DT);
  assert.equal(s.player.alive, false, 'too far into the grass crashes');
  assert.equal(s.causes.offroad, 1);
});

test('crashing while the timer runs costs no car', () => {
  const s = createSim({ seed: 1, enemies: false });
  s.player.x = -100;
  step(s, {}, DT);
  assert.equal(s.player.alive, false);
  assert.equal(s.over, false);
  run(s, 8, {});
  assert.equal(s.player.alive, true, 'a new car arrives');
  assert.equal(s.spares, 0);
});

test('after the timer runs out, crashing spends spare cars and the last one ends the game', () => {
  const s = createSim({ seed: 1, enemies: false });
  s.timer = 0; s.spares = 1;
  s.player.x = -100; step(s, {}, DT);
  assert.equal(s.spares, 0);
  assert.equal(s.over, false);
  run(s, 8, {});
  s.player.x = -100; step(s, {}, DT);
  assert.equal(s.over, true);
});

test('an extra car is banked every 10,000 points', () => {
  const s = createSim({ seed: 1, enemies: false });
  s.score = 9990;
  run(s, 2, bot);
  assert.equal(s.spares, 1);
});

test('bullets bounce off the Road Lord, but forcing it off the road destroys it for points', () => {
  const s = createSim({ seed: 1, enemies: false });
  const rl = spawn(s, 'roadlord', { x: s.player.x, d: 150, speed: 0 });
  rl.think = false;
  run(s, 0.5, { fire: true });
  assert.equal(rl.dead, false);
  const before = s.score;
  rl.hitT = s.t; rl.x = -200;
  step(s, {}, DT);
  assert.equal(rl.dead, true);
  assert.equal(s.score - before, 150);
});

test('only missiles bring down the Mad Bomber', () => {
  const s = createSim({ seed: 1, enemies: false });
  const heli = spawn(s, 'heli', { x: s.player.x, d: 200, speed: 0 });
  heli.think = false;
  run(s, 0.5, { fire: true });
  assert.equal(heli.dead, false, 'guns cannot reach it');
  s.weapons.missile = 1;
  step(s, { missile: true }, DT);
  run(s, 2, {});
  assert.equal(heli.dead, true);
  assert.equal(s.weapons.missile, 0);
});

test('a Switchblade riding alongside slashes the player', () => {
  const s = createSim({ seed: 1, enemies: false });
  s.player.inv = 0; s.player.speed = 250;
  spawn(s, 'switchblade', { x: s.player.x + 32, d: s.player.d, speed: 250 });
  run(s, 1, { up: true });
  assert.equal(s.player.alive, false);
  assert.equal(s.causes.slashed, 1);
});

test('driving into the weapons van loads a weapon; the van pulls over and you leave it from a standstill', () => {
  const s = createSim({ seed: 1, enemies: false });
  const van = spawn(s, 'van', { x: s.player.x, d: 260, speed: 120, state: 'wait' });
  let release = null;
  for (let i = 0; i < 10 * 60 && !release; i++) {
    step(s, { ...bot(s), up: true }, DT);
    if (s.events.some(e => e.type === 'weapon')) release = { speed: s.player.speed, vanSpeed: van.speed, vanX: van.x, c: s.track.at(van.d).strips[0].c };
    s.events.length = 0;
  }
  assert.ok(release, 'never got a weapon');
  const w = s.weapons;
  assert.ok(w.oil + w.smoke + w.missile > 0);
  assert.equal(release.speed, 0, 'car rolls out from a standstill');
  assert.ok(release.vanSpeed < 1, 'van is stopped while unloading');
  assert.ok(release.vanX > release.c + 60, 'van pulled over to the side of the road');
});

test('a replacement car is unloaded from a truck stopped at the roadside, from a standstill', () => {
  const s = createSim({ seed: 1, enemies: false });
  run(s, 3, bot);
  s.player.x = -100; step(s, {}, DT);
  let van = null, i = 0;
  while (!s.player.alive && i++ < 10 * 60) { step(s, {}, DT); van ??= s.ents.find(e => e.type === 'van'); }
  assert.ok(s.player.alive, 'no replacement car');
  assert.ok(van, 'the car must come from a truck');
  assert.equal(s.player.speed, 0);
  assert.ok(van.speed < 1, 'truck stopped to unload');
  assert.ok(van.x > s.track.at(van.d).strips[0].c + 60, 'truck pulled over to the side');
  assert.ok(van.d > s.player.d, 'car rolls out of the back of the truck');
});

test('the same seed and inputs replay identically', () => {
  const a = createSim({ seed: 7 }), b = createSim({ seed: 7 });
  run(a, 60, bot); run(b, 60, bot);
  assert.equal(a.score, b.score);
  assert.equal(a.deaths, b.deaths);
  assert.equal(a.player.d, b.player.d);
});

test('the whole road is drivable: the bot never crashes with no traffic, by road or by boat', () => {
  for (const seed of [1, 2, 3, 4, 5]) for (const route of [0, 1]) {
    const s = createSim({ seed, enemies: false });
    run(s, 150, s => botInput(s, { route }));
    assert.equal(s.deaths, 0, `seed ${seed} route ${route}: crashed (${JSON.stringify(s.causes)}) at d ${s.player.d | 0}`);
    assert.ok(s.player.d > 60000, `seed ${seed}: only reached ${s.player.d | 0}`);
  }
});

test('the boat route really turns the car into a boat and back', () => {
  const s = createSim({ seed: 1, enemies: false });
  const kinds = new Set();
  for (let i = 0; i < 150 * 60; i++) { step(s, botInput(s, { route: 1 }), DT); kinds.add(s.player.kind); }
  assert.deepEqual([...kinds].sort(), ['boat', 'car']);
  assert.equal(s.player.kind, 'car');
});

test('with full traffic the game is survivable but not free', () => {
  let deaths = 0, kills = 0;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const s = createSim({ seed });
    run(s, 120, bot);
    deaths += s.deaths; kills += s.kills;
  }
  assert.ok(deaths / 6 < 4, `bot dies ${deaths / 6} times per 2 min`);
  assert.ok(kills > 0, 'enemies show up and can be killed');
});

test('enemies never stand still in the middle of the screen forever (sim cleans up)', () => {
  const s = createSim({ seed: 3 });
  run(s, 120, bot);
  assert.ok(alive(s).length < 20);
});

test('a civilian stopped by a bump gets back up to cruising speed instead of blocking the road forever', () => {
  const s = createSim({ seed: 1, enemies: false });
  const civ = spawn(s, 'civ', { x: s.player.x + 60, d: 300, speed: 250 });
  civ.speed = 0;
  run(s, 3, {});
  assert.ok(civ.speed > 200, `still crawling at ${civ.speed}`);
});

test('traffic and the weapons van never crash on their own or drive onto the river', () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const s = createSim({ seed });
    for (let i = 0; i < 120 * 60; i++) {
      step(s, botInput(s, { route: 1 }), DT);
      for (const e of s.events) {
        if (e.type !== 'boom' || !['van', 'civ', 'moto'].includes(e.ent)) continue;
        // civilians may be shot, spun out, bombed or shoved off the road; the van is never destroyed and nobody drowns
        const shovedOffBridge = e.why === 'splash' && s.track.at(e.d).bridge;
        const ok = e.ent !== 'van' && (['shot', 'spin', 'bomb', 'offroad'].includes(e.why) || shovedOffBridge);
        assert.ok(ok, `seed ${seed}: ${e.ent} died by ${e.why}`);
      }
      s.events.length = 0;
      for (const e of s.ents) {
        if (e.type === 'heli' || e.type === 'torpedo' || e.type === 'barreler') continue;
        const sl = s.track.at(e.d), si = sl.strips.findIndex(st => e.x >= st.l && e.x <= st.r);
        assert.ok(si < 0 || sl.strips[si].surf === 'road', `seed ${seed}: ${e.type} on the water`);
      }
    }
  }
});

test('civilians drive in the painted lanes and traffic stays sparse', () => {
  let samples = 0, onScreen = 0;
  for (const seed of [1, 2, 3]) {
    const s = createSim({ seed });
    for (let i = 0; i < 90 * 60; i++) {
      step(s, bot(s), DT);
      if (i % 30) continue;
      samples++;
      for (const e of s.ents) {
        if (e.type !== 'civ' && e.type !== 'moto') continue;
        if (Math.abs(e.d - s.camD) < 600) onScreen++;
        if (e.t < 2 || s.t - (e.bumpT ?? -99) < 3 || e.spin > 0 || e.changing) continue; // shoved or lane-changing cars are between lanes
        if (laneOffsets(s.track.at(e.d - 200).strips[e.strip].hw).length !== laneOffsets(s.track.at(e.d).strips[e.strip].hw).length) continue; // merging as lanes end
        const st = s.track.at(e.d).strips[e.strip];
        const off = Math.min(...laneOffsets(st.hw).map(f => Math.abs(e.x - (st.c + f * st.hw))));
        assert.ok(off < 12, `seed ${seed}: ${e.type} ${off.toFixed(0)}px out of lane`);
      }
    }
  }
  assert.ok(onScreen / samples <= 3, `${(onScreen / samples).toFixed(1)} civilians on screen on average`);
});

test('civilians signal, then occasionally change into a clear lane', () => {
  let changes = 0;
  for (const seed of [1, 2, 3]) {
    const s = createSim({ seed });
    const lane = new Map();
    const signalSince = new Map();
    for (let i = 0; i < 90 * 60; i++) {
      step(s, bot(s), DT);
      for (const e of s.ents) {
        if (e.type !== 'civ' && e.type !== 'moto') continue;
        if (e.signal && !signalSince.has(e.id)) signalSince.set(e.id, s.t);
        const was = lane.get(e.id);
        if (was != null && was !== e.laneIdx) {
          changes++;
          assert.ok(s.t - (signalSince.get(e.id) ?? s.t) >= 0.5, `seed ${seed}: changed lanes without signalling first`);
          signalSince.delete(e.id);
          const st = s.track.at(e.d).strips[e.strip], tx = laneX(st, e.laneIdx);
          const near = o => o.d - e.d > -70 && o.d - e.d < 110 && Math.abs(o.x - tx) < 22;
          assert.ok(!s.ents.some(o => o !== e && !o.dead && o.type !== 'heli' && near(o)) && !(s.player.alive && near(s.player)), `seed ${seed}: changed into an occupied lane`);
        }
        if (!e.signal && lane.get(e.id) === e.laneIdx) signalSince.delete(e.id);
        lane.set(e.id, e.laneIdx);
      }
    }
  }
  assert.ok(changes >= 5, `only ${changes} lane changes in 4.5 minutes of traffic`);
});
