// Autoplay: drives, dodges, shoots hostiles, spares civilians, docks with the weapons van.
// route picks the fork branch (1 = the boat side). Used by ?bot=1, the batch runner and the tests.
import { SIZE } from './sim.js';
import { T } from './tuning.js';

const HOSTILE = new Set(['switchblade', 'roadlord', 'enforcer', 'torpedo', 'barreler']);

export function botInput(s, { route = 1 } = {}) {
  const p = s.player;
  const inp = { up: true, hi: p.speed > T.loMax - 30 };
  if (!p.alive || p.docked > 0) return inp;

  const look = s.track.at(p.d + Math.max(70, p.speed * 0.3));
  const here = s.track.at(p.d);
  // stay on the strip we're on once the fork has split; choose the route while the strips still overlap
  const split = here.strips[0].r < here.strips[1].l;
  const st = look.strips[split ? p.strip : route];
  const lo = st.l + 18, hi = st.r - 18;

  const van = s.ents.find(e => e.type === 'van' && e.state === 'wait');
  const threats = [];
  for (const e of s.ents) if (!e.dead && e.type !== 'heli' && !(van && e === van)) threats.push({ x: e.x, d: e.d, speed: e.speed, w: SIZE[e.type][0] });
  for (const h of s.hazards) {
    if (h.type === 'barrel' || h.type === 'oil' || h.type === 'smoke') threats.push({ x: h.x, d: h.d, speed: 0, w: h.r * 2 });
    if (h.type === 'bomb') threats.push({ x: h.x, d: h.d, speed: 0, w: 76 });
  }
  for (const sh of s.shots) if (sh.hostile) threats.push({ x: sh.x, d: sh.d, speed: sh.vd, w: 20 });

  const near = s.ents.filter(e => HOSTILE.has(e.type) && !e.dead && Math.abs(e.d - p.d) < 100);
  // score candidate lines across the strip; cost = danger ahead + distance from where we are
  let best = Math.max(lo, Math.min(hi, st.c)), bestCost = Infinity;
  const target = van && Math.abs(van.d - p.d) < 600 && p.kind === 'car' ? van.x : null;
  for (let i = 0; i <= 8; i++) {
    const x = lo + (hi - lo) * (i / 8);
    let cost = Math.abs(x - p.x) * 0.02 + (target != null ? Math.abs(x - target) * 0.2 : Math.abs(x - st.c) * 0.004);
    for (const t of threats) {
      const ahead = t.d - p.d, closing = Math.max(40, p.speed - t.speed);
      if (ahead < -40 || ahead / closing > 1.4) continue;
      const clear = Math.abs(x - t.x) - (t.w + 26) / 2 - 8;
      if (clear < 0) cost += 30 / (1 + Math.max(0, ahead) / 120);
    }
    for (const e of near) cost += Math.max(0, 70 - Math.abs(x - e.x)) * 0.5; // get away from cars riding alongside
    if (cost < bestCost) { bestCost = cost; best = x; }
  }

  const want = Math.max(-T.steer, Math.min(T.steer, (best - p.x) * 5));
  inp.right = want - p.vx > 40;
  inp.left = want - p.vx < -40;

  // brake for anything we're about to rear-end in our own line
  for (const t of threats) {
    const ahead = t.d - p.d;
    if (ahead > 0 && ahead < 110 && Math.abs(t.x - p.x) < (t.w + 26) / 2 && t.speed < p.speed) { inp.up = false; inp.down = ahead < 80; }
  }
  // a hostile riding alongside: brake to drop behind it and shoot
  for (const e of s.ents) {
    if (!HOSTILE.has(e.type) || e.dead) continue;
    if ((Math.abs(e.d - p.d) < 70 && Math.abs(e.x - p.x) < 80) || e.aim > 0) { inp.up = p.speed < 120; inp.down = p.speed >= 120; }
  }

  const civInLine = s.ents.some(e => (e.type === 'civ' || e.type === 'moto') && e.d > p.d - 20 && e.d - p.d < 700 && Math.abs(e.x + (e.vx - p.vx) * 0.3 - p.x) < 32);
  const lined = s.ents.some(e => HOSTILE.has(e.type) && !e.dead && e.d > p.d && e.d - p.d < 450 && Math.abs(e.x - p.x) < 30);
  inp.fire = lined && !civInLine;
  const behind = s.ents.find(e => HOSTILE.has(e.type) && !e.dead && e.d < p.d && p.d - e.d < 180 && Math.abs(e.x - p.x) < 40);
  inp.oil = !!behind;
  inp.smoke = !!behind;
  inp.missile = s.ents.some(e => e.type === 'heli' && !e.dead && e.d > p.d);
  return inp;
}
