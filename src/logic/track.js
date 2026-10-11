import { mulberry32 } from './rng.js';

export const W = 540;
const THEMES = ['summer', 'autumn', 'winter'];
const THEME_LEN = 25000;
const SLOPE = 0.2; // average sideways px per forward px; smoothstep peaks at 1.5x this

// The road is always two strips. On a plain road both are identical; at a fork they pull apart, and on a boat
// route strip 1 turns to water between a boathouse and a dock. Keyframe flags (surf, bridge) hold until the next one.
export function createTrack(seed) {
  const rng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  const keys = [];
  const feats = [];
  let d = 0, c = W / 2, hw = 110;

  const single = (surf = 'road') => [{ c, hw, surf }, { c, hw, surf }];
  const key = (strips, bridge = false) => keys.push({ d, strips, bridge });
  const go = (len, nc, nhw, bridge = false) => { d += len; c = nc; hw = nhw; key(single(), bridge); };
  const len = (dc, min) => Math.max(min, Math.abs(dc) / SLOPE);

  function curve() {
    const nc = Math.round(Math.min(W - hw - 30, Math.max(hw + 30, c + rng.range(-140, 140))));
    go(len(nc - c, 600) + rng.range(0, 500), nc, hw);
    go(rng.range(300, 900), c, hw);
  }
  function narrow() {
    go(450, c, 72); go(rng.range(700, 1300), c, 72); go(450, c, 110);
  }
  function center() { if (c !== W / 2) go(len(W / 2 - c, 400), W / 2, hw); }
  function bridge() {
    center(); go(450, c, 85);
    keys.at(-1).bridge = true;
    feats.push({ type: 'bridge', d });
    go(rng.range(1100, 1600), c, 85, false);
    feats.push({ type: 'bridgeEnd', d });
    go(450, c, 110);
  }
  function fork(boat) {
    center();
    if (boat) feats.push({ type: 'boatSign', d: d - 300, x: W / 2 + 140 });
    const L = (surf = 'road') => ({ c: W / 2 - 125, hw: 70, surf });
    const R = (surf = 'road') => ({ c: W / 2 + 125, hw: boat ? 80 : 70, surf });
    d += 750; key([L(), R()]);
    if (boat) {
      d += 250; key([L(), R('water')]); feats.push({ type: 'boathouse', d, strip: 1, x: W / 2 + 125 });
      d += rng.range(4500, 6500); key([L(), R()]); feats.push({ type: 'dock', d, strip: 1, x: W / 2 + 125 });
      d += 250; key([L(), R()]);
    } else {
      d += rng.range(1200, 2000); key([L(), R()]);
    }
    d += 750; key(single());
    go(300, c, hw);
  }

  key(single());
  go(1400, c, hw);
  let sinceRiver = 0;
  function extend() {
    const r = rng();
    if (d > 14000 && sinceRiver > 22000) { fork(true); sinceRiver = 0; return; }
    const start = d;
    if (d < 4000 || r < 0.5) curve();
    else if (r < 0.65) narrow();
    else if (r < 0.82) fork(false);
    else bridge();
    sinceRiver += d - start;
  }
  const ensure = to => { while (keys.at(-1).d < to + 4000) extend(); };

  let hint = 0; // last looked-up key; lookups are mostly near the previous one
  function at(q) {
    ensure(q);
    let i = Math.min(hint, keys.length - 2);
    while (i > 0 && keys[i].d > q) i--;
    while (keys[i + 1].d <= q) i++;
    hint = i;
    const a = keys[i], b = keys[i + 1];
    const t0 = Math.max(0, Math.min(1, (q - a.d) / (b.d - a.d)));
    const t = t0 * t0 * (3 - 2 * t0);
    const strips = a.strips.map((sa, k) => {
      const sb = b.strips[k];
      const cc = sa.c + (sb.c - sa.c) * t, h = sa.hw + (sb.hw - sa.hw) * t;
      return { c: cc, hw: h, l: cc - h, r: cc + h, surf: sa.surf };
    });
    return { strips, bridge: a.bridge, theme: THEMES[Math.floor(q / THEME_LEN) % THEMES.length] };
  }

  return {
    at,
    featuresIn(d0, d1) { ensure(d1); return feats.filter(f => f.d >= d0 && f.d < d1); },
  };
}

// Lane centres as fractions of a strip's half-width: four lanes on a wide road, two when it narrows.
export const laneOffsets = hw => (hw > 95 ? [-0.75, -0.25, 0.25, 0.75] : [-0.5, 0.5]);
// x of lane i (numbered 0..3 on the four-lane road); on two lanes, 0-1 merge left and 2-3 merge right.
export function laneX(st, i) {
  const offs = laneOffsets(st.hw);
  return st.c + offs[offs.length === 4 ? i : i < 2 ? 0 : 1] * st.hw;
}

// Index of the strip containing x (prefer one if it qualifies), or -1 when x is off every strip.
export function stripAt(slice, x, margin = 0, prefer = -1) {
  const s = slice.strips;
  if (prefer >= 0 && x >= s[prefer].l - margin && x <= s[prefer].r + margin) return prefer;
  for (let i = 0; i < s.length; i++) if (x >= s[i].l - margin && x <= s[i].r + margin) return i;
  return -1;
}
