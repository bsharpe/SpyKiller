// Pure, seeded game simulation. Phaser only draws this state, so the bot, batch runs and tests drive it headless.
// World: x is 0..540 across the road, d is distance travelled (grows forward / up the screen), in px.
import { mulberry32 } from './rng.js';
import { createTrack, stripAt, laneX, laneOffsets } from './track.js';
import { T } from './tuning.js';

export const SIZE = {
  car: [26, 50], boat: [30, 56],
  civ: [26, 48], moto: [12, 30], switchblade: [26, 50], roadlord: [34, 60], enforcer: [28, 70],
  van: [42, 124], torpedo: [30, 58], barreler: [34, 64], heli: [64, 64],
};
export const POINTS = { switchblade: 150, roadlord: 150, enforcer: 150, torpedo: 150, barreler: 150, heli: 500 };
const HOSTILE = new Set(['switchblade', 'roadlord', 'enforcer', 'torpedo', 'barreler', 'heli']);
const MASS = { car: 1, boat: 1, civ: 0.8, moto: 0.4, switchblade: 1, roadlord: 3, enforcer: 1.6, van: 8, torpedo: 1.2, barreler: 1.5 };
const WATER = new Set(['torpedo', 'barreler']);
const LOAD = { oil: 10, smoke: 8, missile: 6 };
const MAX_HP = { switchblade: 1, enforcer: 3, torpedo: 2, barreler: 2, civ: 1, moto: 1 };

export function createSim({ seed = 1, enemies = true } = {}) {
  const s = {
    seed, enemies, rng: mulberry32(seed), track: createTrack(seed),
    t: 0, camD: 0, camSpeed: 0,
    player: null, ents: [], shots: [], hazards: [], events: [],
    score: 0, timer: T.timerStart, spares: 0, nextSpare: T.spareEvery, noScore: 0,
    weapons: { oil: 0, smoke: 0, missile: 0 }, wpnCycle: 0,
    over: false, nextId: 1, spawnD: 300, hostileT: 4, nextVanD: 7000, respawnT: 0,
    deaths: 0, kills: 0, causes: {},
  };
  s.player = newPlayer(s, 0);
  return s;
}

function newPlayer(s, d) {
  const sl = s.track.at(d);
  const st = sl.strips.find(x => x.surf === 'road') ?? sl.strips[0];
  return { x: st.c, d, speed: 0, vx: 0, kind: 'car', alive: true, inv: 2, fireCd: 0, wpnCd: 0, docked: 0, strip: 0 };
}

export function spawn(s, type, props = {}) {
  const sl = s.track.at(props.d ?? s.player.d);
  const e = { id: s.nextId++, type, x: sl.strips[0].c, d: s.player.d, speed: 0, vx: 0, hp: MAX_HP[type] ?? 1,
    think: true, dead: false, t: 0, hitT: -99, cd: 1, strip: 0, ...props };
  const st = sl.strips[stripAt(sl, e.x, 0)] ?? sl.strips[0];
  e.cruise ??= e.speed;
  if (e.laneIdx == null) { // nearest painted lane
    let best = Infinity;
    for (let i = 0; i < 4; i++) { const dx = Math.abs(laneX(st, i) - e.x); if (dx < best) { best = dx; e.laneIdx = i; } }
  }
  e.side ??= e.x >= s.player.x ? 1 : -1;
  s.ents.push(e);
  return e;
}

const ev = (s, type, o = {}) => s.events.push({ type, ...o });

function addScore(s, pts) {
  if (s.noScore > 0) return;
  s.score += pts;
  while (s.score >= s.nextSpare) { s.spares++; s.nextSpare += T.spareEvery; ev(s, 'spare'); }
}

function killPlayer(s, cause, force = false) {
  const p = s.player;
  if (!p.alive || (p.inv > 0 && !force) || p.docked > 0) return;
  p.alive = false;
  s.deaths++;
  s.causes[cause] = (s.causes[cause] ?? 0) + 1;
  ev(s, 'boom', { x: p.x, d: p.d, big: true, who: p.kind, cause, water: cause === 'splash' || p.kind === 'boat' });
  s.camSpeed = p.speed;
  if (s.timer <= 0) { if (s.spares > 0) s.spares--; else s.over = true; }
  s.respawnT = 1.2;
  if (s.over) ev(s, 'gameover');
}

function destroy(s, e, why, byPlayer = false) {
  if (e.dead) return;
  e.dead = true;
  const credited = byPlayer || s.t - e.hitT < 1.5;
  ev(s, 'boom', { x: e.x, d: e.d, ent: e.type, why, big: e.type === 'heli' || e.type === 'roadlord',
    water: WATER.has(e.type) || why === 'splash', air: e.type === 'heli' });
  if (!credited) return;
  if (e.type === 'civ' || e.type === 'moto') { s.civKills = (s.civKills ?? 0) + 1; s.noScore = T.noScoreTime; ev(s, 'noscore'); return; }
  if (POINTS[e.type]) {
    s.kills++;
    const was = s.score;
    addScore(s, POINTS[e.type]);
    if (s.score > was) ev(s, 'points', { x: e.x, d: e.d, pts: POINTS[e.type] });
  }
}

// ---------------------------------------------------------------- step

export function step(s, inp, dt) {
  s.t += dt;
  if (s.over) return;
  if (s.timer > 0) { s.timer = Math.max(0, s.timer - T.timerRate * dt); if (s.timer === 0) ev(s, 'timerOut'); }
  s.noScore = Math.max(0, s.noScore - dt);
  updatePlayer(s, inp, dt);
  const p = s.player;
  if (p.alive) { s.camD = p.d; s.camSpeed = p.speed; }
  else { s.camSpeed = Math.max(0, s.camSpeed - 400 * dt); s.camD += s.camSpeed * dt; }
  if (s.enemies) director(s, dt);
  for (const e of s.ents) if (!e.dead) updateEnt(s, e, dt);
  collide(s);
  updateShots(s, dt);
  updateHazards(s, dt);
  s.ents = s.ents.filter(e => !e.dead && e.d > s.camD - 600 && e.d < s.camD + 1900);
}

function updatePlayer(s, inp, dt) {
  const p = s.player;
  if (!p.alive) {
    s.respawnT -= dt;
    if (s.respawnT <= 0 && !s.over && !s.ents.some(e => e.deliver && !e.dead)) callTruck(s);
    return;
  }
  p.inv = Math.max(0, p.inv - dt);
  p.fireCd -= dt; p.wpnCd -= dt;
  if (p.docked > 0) { // the van carries the car; see updateVan
    if (s.ents.some(e => e.type === 'van' && (e.state === 'load' || e.state === 'unload') && !e.deliver && !e.dead)) return;
    p.docked = 0;
  }

  const max = inp.hi ? T.hiMax : T.loMax;
  const acc = inp.hi ? (p.speed < T.loMax * 0.6 ? T.hiAccel * 0.5 : T.hiAccel) : T.loAccel;
  if (inp.up) p.speed = p.speed <= max ? Math.min(max, p.speed + acc * dt) : Math.max(max, p.speed - T.drag * 3 * dt);
  else if (inp.down) p.speed = Math.max(0, p.speed - T.brake * dt);
  else p.speed = Math.max(0, p.speed - T.drag * dt);

  const sl = s.track.at(p.d);
  const steer = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
  const grip = sl.theme === 'winter' && p.kind === 'car' ? T.iceGrip : T.grip;
  const want = steer * T.steer * Math.min(1, p.speed / 120);
  p.vx += (want - p.vx) * Math.min(1, grip * dt);
  p.x += p.vx * dt;
  p.d += p.speed * dt;

  const now = s.track.at(p.d);
  const inside = stripAt(now, p.x, 0, p.strip);
  if (inside >= 0) {
    p.strip = inside;
    p.off = 0;
    const surf = now.strips[inside].surf;
    if (surf === 'water' && p.kind === 'car') { p.kind = 'boat'; ev(s, 'toBoat', { x: p.x, d: p.d }); }
    if (surf === 'road' && p.kind === 'boat') { p.kind = 'car'; ev(s, 'toCar', { x: p.x, d: p.d }); }
  } else {
    const near = offSurface(now, p.x, p.kind === 'car' ? 'road' : 'water');
    if (near.off > offLimit(now, p.kind === 'boat')) return killPlayer(s, now.bridge ? 'splash' : p.kind === 'boat' ? 'beached' : 'offroad', true);
    p.strip = near.i;
    p.off = near.off;
  }
  p.zone = p.off <= 0 ? 'road' : p.off <= T.shoulder ? 'shoulder' : 'grass';
  if (p.zone !== 'road') { // gravel and grass cap the speed
    const cap = T.hiMax * (p.zone === 'shoulder' ? T.shoulderMax : T.grassMax);
    if (p.speed > cap) p.speed = Math.max(cap, p.speed - (p.zone === 'shoulder' ? 500 : 900) * dt);
  }

  addScore(s, p.speed * dt * T.pointsPerPx);

  if (inp.fire && p.fireCd <= 0) {
    p.fireCd = T.fireRate;
    for (const ox of [-7, 7]) s.shots.push({ id: s.nextId++, type: 'bullet', x: p.x + ox, d: p.d + 26, vd: p.speed + T.bulletSpeed, vx: 0, life: T.bulletLife });
    ev(s, 'shot', { x: p.x, d: p.d + 26 });
  }
  if (p.wpnCd <= 0) {
    const w = s.weapons;
    if (inp.oil && w.oil > 0) { w.oil--; p.wpnCd = 0.2; s.hazards.push({ id: s.nextId++, type: 'oil', x: p.x, d: p.d - 36, r: 24, life: 9 }); ev(s, 'oil'); }
    else if (inp.smoke && w.smoke > 0) { w.smoke--; p.wpnCd = 0.35; s.hazards.push({ id: s.nextId++, type: 'smoke', x: p.x, d: p.d - 46, r: 50, life: 3.5 }); ev(s, 'smoke', { x: p.x, d: p.d - 46 }); }
    else if (inp.missile && w.missile > 0) {
      w.missile--; p.wpnCd = 0.4;
      const heli = s.ents.find(e => e.type === 'heli' && !e.dead);
      s.shots.push({ id: s.nextId++, type: 'missile', x: p.x, d: p.d + 20, vd: p.speed + 420, vx: 0, life: 2.5, target: heli?.id });
      ev(s, 'missile');
    }
  }
}

// How far x is past the nearest strip with this surface (<= 0 means on it).
function offSurface(slice, x, surf) {
  let off = Infinity, i = -1;
  slice.strips.forEach((st, k) => {
    if (st.surf !== surf) return;
    const o = Math.max(st.l - x, x - st.r);
    if (o < off) { off = o; i = k; }
  });
  return { off, i };
}
// Bridges have rails and rivers have banks; only a road has a shoulder and grass to run onto.
const offLimit = (slice, water) => (slice.bridge || water ? 10 : T.shoulder + T.grassDepth);

// The replacement car comes in a truck from behind; it pulls over ahead of the camera and unloads (see updateVan).
function callTruck(s) {
  const target = s.camD + 95, sl = s.track.at(target);
  const si = Math.max(0, sl.strips.findIndex(st => st.surf === 'road'));
  const st = s.track.at(s.camD - 330).strips[si];
  spawn(s, 'van', { x: st.c + st.hw * 0.4, d: s.camD - 330, speed: 420, state: 'deliver', deliver: true, target, strip: si });
}

// ---------------------------------------------------------------- spawning

function director(s, dt) {
  const p = s.player;
  if (!p.alive || p.docked > 0) return;
  const D = p.d, diff = Math.min(1, D / 60000), rng = s.rng;
  if (p.kind === 'car') {
    while (s.spawnD < D) { s.spawnD += T.trafficGap * rng.range(0.6, 1.4); spawnCiv(s); }
  } else s.spawnD = D + 600;

  s.hostileT -= dt;
  const hostiles = s.ents.filter(e => HOSTILE.has(e.type) && !e.dead).length;
  if (s.hostileT <= 0 && hostiles < 1 + Math.floor(diff * 2.5)) {
    s.hostileT = (1 / T.hostileRate) * rng.range(0.6, 1.4) * (1 - diff * 0.5);
    spawnHostile(s, D);
  }
  if (p.kind === 'car' && D > s.nextVanD && !s.ents.some(e => e.type === 'van')) {
    spawn(s, 'van', { x: s.track.at(D - 400).strips[p.strip].c, d: D - 420, speed: p.speed + 220, state: 'arrive' });
    s.nextVanD = D + rng.range(9000, 13000);
    ev(s, 'vanCall');
  }
}

function spawnCiv(s) {
  const p = s.player, rng = s.rng;
  const ahead = p.speed > 200 || rng() < 0.5;
  const d = ahead ? p.d + 1050 : p.d - 320;
  const sl = s.track.at(d);
  const roads = sl.strips.map((st, i) => (st.surf === 'road' ? i : -1)).filter(i => i >= 0);
  if (!roads.length) return;
  const si = rng.pick(roads), st = sl.strips[si];
  const laneIdx = rng.int(4), x = laneX(st, laneIdx);
  if (s.ents.some(e => Math.abs(e.d - d) < 110 && Math.abs(e.x - x) < 40)) return;
  const moto = rng() < 0.18;
  const speed = ahead ? rng.range(170, 360) : Math.max(p.speed + 140, 300);
  spawn(s, moto ? 'moto' : 'civ', { x, d, laneIdx, speed, cruise: speed, strip: si, color: rng.int(6) });
}

function spawnHostile(s, D) {
  const p = s.player, rng = s.rng;
  const heli = s.ents.some(e => e.type === 'heli');
  const pool = p.kind === 'boat'
    ? ['torpedo', 'torpedo', 'barreler', 'barreler', ...(heli ? [] : ['heli'])]
    : ['switchblade', 'switchblade', ...(D > 4000 ? ['enforcer', 'enforcer'] : []), ...(D > 8000 ? ['roadlord', 'roadlord'] : []),
       ...(D > 16000 && !heli ? ['heli'] : [])];
  const type = rng.pick(pool);
  const st = s.track.at(p.d).strips[p.strip];
  if (type === 'heli') return spawn(s, 'heli', { x: p.x, d: p.d - 350, speed: p.speed + 260, life: 24 });
  if (WATER.has(type)) return spawn(s, type, { x: st.c + rng.range(-0.4, 0.4) * st.hw, d: p.d + 900, speed: rng.range(150, 230), strip: p.strip });
  const behind = rng() < 0.7;
  const x = st.c + rng.range(-0.5, 0.5) * st.hw, d = behind ? p.d - 300 : p.d + 950;
  if (s.ents.some(e => Math.abs(e.d - d) < 90 && Math.abs(e.x - x) < 40)) return;
  spawn(s, type, { x, d, speed: behind ? p.speed + 160 : Math.max(120, p.speed - 150), strip: p.strip, side: x > p.x ? 1 : -1 });
}

// ---------------------------------------------------------------- behaviour

function steerTo(e, tx, dt, maxV = 220) {
  const want = Math.max(-maxV, Math.min(maxV, (tx - e.x) * 4));
  e.vx += (want - e.vx) * Math.min(1, 6 * dt);
}
const approach = (v, target, rate, dt) => v + Math.max(-rate * dt, Math.min(rate * dt, target - v));

function updateEnt(s, e, dt) {
  e.t += dt;
  e.cd -= dt;
  const p = s.player;
  const sl = s.track.at(e.d);
  if (e.type !== 'heli') {
    const want = p.alive && HOSTILE.has(e.type) ? p.strip : e.strip;
    const si = stripAt(sl, e.x, 0, want);
    if (si >= 0) e.strip = si;
  }
  const st = sl.strips[e.strip];
  const inLane = x => Math.max(st.l + 18, Math.min(st.r - 18, x));
  // no room on the chosen side: come alongside from the other side instead of shoving the player into the verge
  if (HOSTILE.has(e.type) && e.side && (p.x + e.side * 40 < st.l + 18 || p.x + e.side * 40 > st.r - 18)) e.side = -e.side;

  if (e.spin > 0) {
    e.spin -= dt;
    e.speed = approach(e.speed, 0, 500, dt);
    if (e.spin <= 0) destroy(s, e, 'spin');
  } else if (e.think) {
    const chase = p.alive && p.docked <= 0;
    switch (e.type) {
      case 'civ': case 'moto': {
        // now and then: signal for a moment, then move over if that lane is clear (including of the player)
        e.laneT = (e.laneT ?? s.rng.range(3, 9)) - dt;
        if (e.signal) {
          e.signalT -= dt;
          if (e.signalT <= 0) {
            const to = e.laneIdx + e.signal, tx = laneX(st, to);
            const near = o => o.d - e.d > -70 && o.d - e.d < 110 && Math.abs(o.x - tx) < 22;
            if (!s.ents.some(o => o !== e && !o.dead && o.type !== 'heli' && near(o)) && !(p.alive && near(p))) { e.laneIdx = to; e.changing = true; }
            e.signal = 0;
          }
        } else if (e.laneT <= 0) {
          e.laneT = s.rng.range(4, 10);
          const opts = laneOffsets(st.hw).length === 4 ? [e.laneIdx - 1, e.laneIdx + 1].filter(i => i >= 0 && i <= 3) : [e.laneIdx < 2 ? 2 : 1];
          e.signal = s.rng.pick(opts) - e.laneIdx; e.signalT = 0.9;
        }
        const lx = laneX(st, e.laneIdx);
        if (e.changing && Math.abs(e.x - lx) < 4) e.changing = false;
        const ahead = s.track.at(e.d + e.speed * 0.25).strips[e.strip]; // aim where the lane is going, so curves don't drag us across it
        steerTo(e, laneX(ahead, e.laneIdx), dt, 160);
        let want = e.cruise; // queue behind a slower car in the same lane instead of rear-ending it
        for (const o of s.ents) if (o !== e && !o.dead && o.d > e.d && o.d - e.d < 110 && Math.abs(o.x - lx) < 20) want = Math.min(want, o.speed);
        e.speed = approach(e.speed, want, 200, dt);
        break;
      }
      case 'switchblade': {
        const dd = p.d - e.d;
        if (chase) {
          steerTo(e, inLane(p.x + e.side * 32), dt);
          e.speed = approach(e.speed, p.speed + Math.max(-150, Math.min(220, dd * 2)), 320, dt);
          const beside = Math.abs(dd) < 34 && Math.abs(e.x - p.x) < 44;
          e.bladeT = beside ? (e.bladeT ?? 0) + dt : Math.max(0, (e.bladeT ?? 0) - dt);
          if (e.bladeT > 0.5) { killPlayer(s, 'slashed'); e.bladeT = 0; }
        } else e.speed = approach(e.speed, 420, 200, dt);
        e.blades = chase && Math.abs(dd) < 90 && Math.abs(e.x - p.x) < 70;
        break;
      }
      case 'roadlord': {
        const dd = p.d - e.d;
        if (chase) {
          const beside = Math.abs(dd) < 45 && Math.abs(e.x - p.x) < 70;
          if (beside && e.cd <= 0) { e.ram = 0.35; e.cd = 1.4; e.side = Math.sign(e.x - p.x) || 1; }
          if (e.ram > 0) { e.ram -= dt; e.vx = -e.side * 230; }
          else steerTo(e, inLane(p.x + e.side * 44), dt, 160);
          e.speed = approach(e.speed, p.speed + Math.max(-150, Math.min(200, dd * 2)), 260, dt);
        } else e.speed = approach(e.speed, 420, 200, dt);
        break;
      }
      case 'enforcer': {
        const dd = p.d - e.d;
        if (chase) {
          steerTo(e, inLane(p.x + e.side * 46), dt, 180);
          e.speed = approach(e.speed, p.speed + Math.max(-150, Math.min(200, (dd + 10) * 2)), 280, dt);
          const inRange = Math.abs(dd) < 90 && Math.abs(e.x - p.x) < 110;
          if (e.aim > 0) {
            e.aim -= dt;
            if (e.aim <= 0) {
              ev(s, 'shotgun', { x: e.x, d: e.d, tx: p.x, td: p.d });
              if (Math.abs(p.d - e.d) < 55 && Math.abs(e.x - p.x) < 85) killPlayer(s, 'shotgun');
              e.cd = 2.4;
            }
          } else if (inRange && e.cd <= 0) { e.aim = 0.75; e.side = Math.sign(e.x - p.x) || 1; }
        } else { e.aim = 0; e.speed = approach(e.speed, 420, 200, dt); }
        break;
      }
      case 'torpedo': case 'barreler': {
        const ahead = e.d - p.d;
        steerTo(e, inLane(e.type === 'torpedo' ? p.x : p.x + Math.sin(e.t) * 40), dt, 120);
        e.speed = approach(e.speed, chase ? p.speed + Math.max(-120, Math.min(120, (ahead - 380) * -1)) : 200, 160, dt);
        if (chase && e.cd <= 0 && ahead > 150 && ahead < 600) {
          if (e.type === 'torpedo' && Math.abs(e.x - p.x) < 70) {
            e.cd = 1.8;
            s.shots.push({ id: s.nextId++, type: 'torp', x: e.x, d: e.d - 30, vd: e.speed - 300, vx: 0, life: 4, hostile: true });
            ev(s, 'torp');
          } else if (e.type === 'barreler') {
            e.cd = 1.3;
            s.hazards.push({ id: s.nextId++, type: 'barrel', x: e.x, d: e.d - 36, r: 11, life: 20 });
          }
        }
        break;
      }
      case 'heli': {
        e.life -= dt;
        const leaving = e.life <= 0 || !chase;
        e.speed = approach(e.speed, leaving ? p.speed + 400 : p.speed + (p.d + 380 + Math.sin(e.t * 0.7) * 60 - e.d) * 1.5, 380, dt);
        steerTo(e, leaving ? e.x : Math.max(40, Math.min(500, p.x + Math.sin(e.t * 1.3) * 50)), dt, 140);
        if (!leaving && e.cd <= 0 && e.d - p.d > 200) {
          e.cd = 1.5;
          const fall = 1.0;
          s.hazards.push({ id: s.nextId++, type: 'bomb', x: p.x + p.vx * fall * 0.8, d: p.d + p.speed * fall, r: 32,
            fall, fall0: fall, fromX: e.x, fromD: e.d, life: 99 });
          ev(s, 'bombDrop');
        }
        if (leaving && e.d > s.camD + 1100) e.dead = true;
        break;
      }
      case 'van': updateVan(s, e, dt, st, sl); break;
    }
    if (HOSTILE.has(e.type) && e.type !== 'heli') e.speed = Math.max(80, e.speed); // cars never reverse; stopping lets them roll past
  }
  e.x += e.vx * dt;
  e.d += e.speed * dt;
  if (e.type === 'heli' || e.dead) return;
  const now = s.track.at(e.d);
  const i = stripAt(now, e.x, offLimit(now, WATER.has(e.type)), e.strip);
  if (e.type === 'van') { // the van is on rails: it stays on its road and parks under the boathouse roof
    const st2 = now.strips[i < 0 ? e.strip : i];
    e.x = Math.max(st2.l + 21, Math.min(st2.r - 21 + (now.bridge ? 0 : T.shoulder), e.x)); // may park on the shoulder
    if (st2.surf === 'water') removeQuietly(s, e);
    return;
  }
  if (i < 0) return destroy(s, e, now.bridge ? 'splash' : 'offroad');
  const wet = now.strips[i].surf === 'water';
  if (wet && !WATER.has(e.type)) removeQuietly(s, e); // land traffic drives into the boathouse and is gone
  else if (!wet && WATER.has(e.type)) destroy(s, e, 'beached');
}

function removeQuietly(s, e) {
  e.dead = true;
  if (e.type === 'van' && !e.deliver && (e.state === 'load' || e.state === 'unload')) s.player.docked = 0;
}

function updateVan(s, e, dt, st, sl) {
  const follow = Math.max(80, e.speed * 0.5);
  const pullX = sl.bridge ? st.r - 23 : st.r - 23 + T.shoulder; // parked mostly on the right shoulder
  const p = s.player;
  if (e.state === 'arrive') {
    steerTo(e, st.c, dt, follow);
    if (e.d > p.d + 220) e.state = 'wait';
  } else if (e.state === 'wait') {
    e.wait = (e.wait ?? 0) + dt;
    steerTo(e, st.c, dt, follow);
    e.speed = approach(e.speed, Math.min(300, Math.max(160, p.speed)), 200, dt);
    const rear = e.d - SIZE.van[1] / 2;
    if (p.alive && p.kind === 'car' && Math.abs(p.x - e.x) < 15 && p.d + 25 >= rear - 6 && p.d < e.d) {
      e.state = 'load'; p.docked = 1; p.inv = 9; ev(s, 'dock');
    } else if (e.wait > 22 || p.d > e.d + 60 || !p.alive) { e.state = 'drop'; }
  } else if (e.state === 'load' || e.state === 'deliver') { // pull over onto the shoulder and stop
    steerTo(e, pullX, dt, 170);
    if (e.state === 'load') {
      e.speed = approach(e.speed, 0, 260, dt);
      p.x = e.x; p.d = e.d - 95; p.speed = e.speed; p.vx = 0; // camera tracks where the car will roll out
    } else e.speed = Math.min(e.speed, Math.sqrt(2 * 320 * Math.max(0, e.target - e.d)));
    if (e.speed < 1) { e.speed = 0; e.vx = 0; e.state = 'unload'; e.load = 0.7; }
  } else if (e.state === 'unload') { // ramp down, car rolls out of the back at a standstill
    e.speed = 0; e.vx = 0; e.load -= dt;
    if (e.load <= 0) {
      const x = e.x, d = e.d - 95;
      if (e.deliver) {
        for (const o of s.ents) if (o !== e && o.type !== 'heli' && Math.abs(o.d - d) < 120 && Math.abs(o.x - x) < 50) removeQuietly(s, o);
        s.player = { ...newPlayer(s, d), x, strip: e.strip, inv: 3 };
        ev(s, 'respawn', { x, d });
      } else {
        const heli = s.ents.some(o => o.type === 'heli' && !o.dead);
        const kind = heli ? 'missile' : ['oil', 'smoke', 'missile'][s.wpnCycle++ % 3];
        s.weapons[kind] += LOAD[kind];
        Object.assign(p, { docked: 0, inv: 1, x, d, speed: 0, vx: 0 });
        ev(s, 'weapon', { kind, n: LOAD[kind] });
      }
      e.state = 'leave'; e.deliver = false;
    }
  } else if (e.state === 'leave') {
    steerTo(e, st.c, dt, follow);
    e.speed = approach(e.speed, 720, 260, dt);
  } else if (e.state === 'drop') {
    steerTo(e, st.c, dt, follow);
    e.speed = approach(e.speed, 0, 200, dt);
  }
}

// ---------------------------------------------------------------- contacts

function overlap(a, b) {
  const [aw, ah] = SIZE[a.kind ?? a.type], [bw, bh] = SIZE[b.type];
  return [(aw + bw) / 2 - Math.abs(a.x - b.x), (ah + bh) / 2 - Math.abs(a.d - b.d)];
}

function collide(s) {
  const p = s.player;
  const ground = s.ents.filter(e => !e.dead && e.type !== 'heli' && !(e.type === 'van' && (e.state === 'load' || e.state === 'arrive' || e.state === 'deliver')));
  const bodies = p.alive && p.docked <= 0 ? [p, ...ground] : ground;
  for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
    const a = bodies[i], b = bodies[j];
    const [ox, od] = overlap(a, b);
    if (ox <= 0 || od <= 0) continue;
    const ma = MASS[a.kind ?? a.type], mb = MASS[b.type];
    if (a === p) b.hitT = s.t;
    a.bumpT = b.bumpT = s.t;
    if (ox < od) { // side swipe: shove apart and trade sideways velocity
      const dir = Math.sign(a.x - b.x) || 1, share = mb / (ma + mb);
      a.x += dir * ox * share; b.x -= dir * ox * (1 - share);
      const rel = a.vx - b.vx, kick = Math.max(Math.abs(rel) * 1.6, 120);
      a.vx += dir * kick * share; b.vx -= dir * kick * (1 - share);
      if (a === p || b === p) ev(s, 'bump', { x: (a.x + b.x) / 2, d: (a.d + b.d) / 2 });
    } else { // nose to tail: the car behind loses speed
      const [back, front] = a.d < b.d ? [a, b] : [b, a];
      back.d -= od; back.speed = Math.min(back.speed, front.speed) * 0.85;
      front.speed += 30 * (back === p ? 1 : 0);
      if (a === p || b === p) ev(s, 'bump', { x: (a.x + b.x) / 2, d: (a.d + b.d) / 2 });
    }
  }
}

function updateShots(s, dt) {
  const p = s.player;
  for (const sh of s.shots) {
    sh.life -= dt;
    if (sh.type === 'missile') {
      const tgt = s.ents.find(e => e.id === sh.target && !e.dead);
      if (tgt) {
        sh.vx += Math.max(-900, Math.min(900, (tgt.x - sh.x) * 8 - sh.vx * 2)) * dt;
        sh.vd = Math.max(sh.vd, tgt.speed + 300);
        if (Math.abs(tgt.x - sh.x) < 30 && Math.abs(tgt.d - sh.d) < 34) { sh.life = 0; destroy(s, tgt, 'missile', true); }
      }
    }
    sh.x += sh.vx * dt; sh.d += sh.vd * dt;
    if (sh.life <= 0) continue;
    if (sh.hostile) {
      if (p.alive && Math.abs(sh.x - p.x) < 16 && Math.abs(sh.d - p.d) < 32) { sh.life = 0; killPlayer(s, 'torpedoed'); }
      continue;
    }
    if (sh.type !== 'bullet') continue;
    for (const e of s.ents) {
      if (e.dead || e.type === 'heli') continue;
      const [w, h] = SIZE[e.type];
      if (Math.abs(sh.x - e.x) > w / 2 || Math.abs(sh.d - e.d) > h / 2) continue;
      sh.life = 0;
      if (e.type === 'roadlord' || e.type === 'van') { ev(s, 'ricochet', { x: sh.x, d: sh.d }); break; }
      e.hitT = s.t;
      if (--e.hp <= 0) destroy(s, e, 'shot', true); else ev(s, 'hit', { x: sh.x, d: sh.d });
      break;
    }
    if (sh.life <= 0) continue;
    for (const o of s.shots) { // shoot down torpedoes
      if (o.hostile && o.life > 0 && Math.abs(o.x - sh.x) < 8 && Math.abs(o.d - sh.d) < 18) { o.life = 0; sh.life = 0; ev(s, 'boom', { x: o.x, d: o.d, water: true }); }
    }
    for (const hz of s.hazards) {
      if (hz.type === 'barrel' && hz.life > 0 && Math.abs(hz.x - sh.x) < 12 && Math.abs(hz.d - sh.d) < 14) { hz.life = 0; sh.life = 0; ev(s, 'boom', { x: hz.x, d: hz.d, water: true }); }
    }
  }
  s.shots = s.shots.filter(sh => sh.life > 0);
}

function updateHazards(s, dt) {
  const p = s.player;
  for (const hz of s.hazards) {
    hz.life -= dt;
    if (hz.type === 'bomb') {
      hz.fall -= dt;
      if (hz.fall > 0) continue;
      hz.life = 0;
      ev(s, 'boom', { x: hz.x, d: hz.d, crater: !s.track.at(hz.d).bridge, water: s.track.at(hz.d).strips.some(st => st.surf === 'water' && hz.x > st.l && hz.x < st.r) });
      if (p.alive && Math.hypot(p.x - hz.x, p.d - hz.d) < hz.r) killPlayer(s, 'bombed');
      for (const e of s.ents) if (!e.dead && e.type !== 'heli' && e.type !== 'van' && Math.hypot(e.x - hz.x, e.d - hz.d) < hz.r) destroy(s, e, 'bomb');
      continue;
    }
    if (hz.type === 'barrel') {
      if (p.alive && Math.abs(p.x - hz.x) < 20 && Math.abs(p.d - hz.d) < 34) { hz.life = 0; ev(s, 'boom', { x: hz.x, d: hz.d, water: true }); killPlayer(s, 'barrel'); }
      continue;
    }
    // oil and smoke: anything that drives through spins out, and the player gets the credit
    for (const e of s.ents) {
      if (e.dead || e.spin > 0 || e.type === 'heli' || e.type === 'van') continue;
      if (Math.abs(e.x - hz.x) < hz.r && Math.abs(e.d - hz.d) < hz.r) {
        e.spin = 0.9; e.hitT = s.t; e.vx = (e.x >= hz.x ? 1 : -1) * 170;
        ev(s, 'spin', { id: e.id });
      }
    }
  }
  s.hazards = s.hazards.filter(hz => hz.life > 0 && hz.d > s.camD - 700);
}
