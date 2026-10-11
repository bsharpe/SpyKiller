// Every texture is painted with canvas 2D at 2x and shown at scale 0.5, so it stays sharp under camera zoom 2.
import { mulberry32 } from './logic/rng.js';

export const CIV_COLORS = [['#7cb36b', '#3d6634'], ['#e3c75a', '#8a7426'], ['#d98b4f', '#7d4a22'], ['#a77fc7', '#5a3f73'], ['#c96b6b', '#6e2f2f'], ['#b9bec4', '#5d6268']];

function tex(scene, key, w, h, draw) {
  const t = scene.textures.createCanvas(key, w * 2, h * 2);
  const ctx = t.getContext();
  ctx.scale(2, 2);
  draw(ctx, w, h);
  t.refresh();
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function shade(ctx, w, dark, mid, light) {
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, dark); g.addColorStop(0.25, mid); g.addColorStop(0.5, light); g.addColorStop(0.75, mid); g.addColorStop(1, dark);
  return g;
}

// top-down car facing up (front at y = 0)
function car(ctx, w, h, { body, dark, light = body, glass = '#1b2430', stripe, roofLen = 0.3, long = false }) {
  ctx.fillStyle = '#0c0c0c';
  for (const [x, y] of [[0, 0.13], [w - 5, 0.13], [0, 0.7], [w - 5, 0.7]]) { rr(ctx, x, h * y, 5, 11, 2); ctx.fill(); }
  ctx.fillStyle = shade(ctx, w, dark, body, light);
  rr(ctx, 2, 1, w - 4, h - 2, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.stroke();
  if (stripe) { ctx.fillStyle = stripe; ctx.fillRect(w / 2 - 4, 2, 2.5, h - 4); ctx.fillRect(w / 2 + 1.5, 2, 2.5, h - 4); }
  // windshield, roof, rear window
  const ws = h * 0.27, roofY = h * 0.4, roofH = h * roofLen;
  const gl = ctx.createLinearGradient(0, ws, 0, roofY);
  gl.addColorStop(0, '#6f8aa3'); gl.addColorStop(1, glass);
  ctx.fillStyle = gl;
  ctx.beginPath(); ctx.moveTo(5, roofY); ctx.lineTo(7, ws); ctx.lineTo(w - 7, ws); ctx.lineTo(w - 5, roofY); ctx.fill();
  ctx.fillStyle = shade(ctx, w, dark, body, light);
  rr(ctx, 5, roofY, w - 10, roofH, 3); ctx.fill();
  if (long) { ctx.fillStyle = glass; ctx.fillRect(5, roofY + roofH * 0.35, w - 10, 3); }
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(w / 2 - 3, roofY + 2, 6, roofH - 4);
  ctx.fillStyle = glass;
  ctx.beginPath(); ctx.moveTo(5, roofY + roofH); ctx.lineTo(w - 5, roofY + roofH); ctx.lineTo(w - 7, roofY + roofH + h * 0.09); ctx.lineTo(7, roofY + roofH + h * 0.09); ctx.fill();
  ctx.fillStyle = '#fff6c8'; rr(ctx, 4, 1.5, 5, 3, 1.5); ctx.fill(); rr(ctx, w - 9, 1.5, 5, 3, 1.5); ctx.fill();
  ctx.fillStyle = '#ff2b2b'; ctx.fillRect(4, h - 3.5, 5, 2); ctx.fillRect(w - 9, h - 3.5, 5, 2);
}

function boat(ctx, w, h, { hull, dark, deck, stripe }) {
  ctx.fillStyle = shade(ctx, w, dark, hull, '#ffffff');
  ctx.beginPath();
  ctx.moveTo(w / 2, 0);
  ctx.bezierCurveTo(w, h * 0.25, w, h * 0.5, w - 2, h);
  ctx.lineTo(2, h);
  ctx.bezierCurveTo(0, h * 0.5, 0, h * 0.25, w / 2, 0);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.stroke();
  ctx.fillStyle = deck; rr(ctx, 6, h * 0.45, w - 12, h * 0.45, 4); ctx.fill();
  if (stripe) { ctx.fillStyle = stripe; ctx.fillRect(w / 2 - 1.5, 4, 3, h * 0.4); }
  ctx.fillStyle = '#1b2430'; rr(ctx, 8, h * 0.38, w - 16, 6, 2); ctx.fill();
}

function radial(ctx, w, h, stops) {
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.min(w, h) / 2);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}

function canopy(ctx, w, h, rng, colors) {
  ctx.fillStyle = 'rgba(0,0,0,0)';
  for (let i = 0; i < 7; i++) {
    const a = rng() * Math.PI * 2, r = i === 0 ? 0 : w * 0.18;
    const cx = w / 2 + Math.cos(a) * r, cy = h / 2 + Math.sin(a) * r, rad = w * (i === 0 ? 0.36 : 0.24);
    const g = ctx.createRadialGradient(cx - rad * 0.3, cy - rad * 0.3, 1, cx, cy, rad);
    g.addColorStop(0, colors[2]); g.addColorStop(0.6, colors[1]); g.addColorStop(1, colors[0]);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fill();
  }
}

export function makeTextures(scene) {
  const rng = mulberry32(1234);

  tex(scene, 'car', 26, 50, (c, w, h) => {
    car(c, w, h, { body: '#e9eef4', dark: '#7f8b99', light: '#ffffff', stripe: '#27c9ff' });
    c.fillStyle = '#222'; c.fillRect(6, 0, 2, 5); c.fillRect(w - 8, 0, 2, 5);
  });
  tex(scene, 'boat', 30, 56, (c, w, h) => boat(c, w, h, { hull: '#e9eef4', dark: '#7f8b99', deck: '#c9d3dd', stripe: '#27c9ff' }));
  CIV_COLORS.forEach(([b, d], i) => tex(scene, 'civ' + i, 26, 48, (c, w, h) => car(c, w, h, { body: b, dark: d })));
  tex(scene, 'moto', 12, 30, (c, w, h) => {
    c.fillStyle = '#111'; rr(c, 4, 0, 4, 9, 2); c.fill(); rr(c, 4, h - 9, 4, 9, 2); c.fill();
    c.fillStyle = '#c0392b'; rr(c, 2, 7, 8, 14, 3); c.fill();
    c.fillStyle = '#333'; c.fillRect(0, 7, w, 2);
    c.fillStyle = '#f1c40f'; c.beginPath(); c.arc(w / 2, 16, 4, 0, Math.PI * 2); c.fill();
  });
  tex(scene, 'switchblade', 26, 50, (c, w, h) => car(c, w, h, { body: '#2f5bd8', dark: '#0f1f5c', light: '#6f95ff' }));
  tex(scene, 'blade', 14, 14, (c, w, h) => {
    c.translate(w / 2, h / 2);
    c.fillStyle = '#d8dde3';
    c.beginPath();
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, r = i % 2 ? 4 : 7; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    c.fill();
    c.fillStyle = '#555'; c.beginPath(); c.arc(0, 0, 2, 0, Math.PI * 2); c.fill();
  });
  tex(scene, 'roadlord', 34, 60, (c, w, h) => {
    car(c, w, h, { body: '#7a6440', dark: '#2e2516', light: '#b29660', glass: '#14100a', roofLen: 0.34 });
    c.fillStyle = '#3a3a3a';
    for (let y = 6; y < h - 6; y += 9) { c.fillRect(0, y, 3, 5); c.fillRect(w - 3, y, 3, 5); }
    c.fillStyle = '#9aa0a6'; c.fillRect(3, 0, w - 6, 3);
  });
  tex(scene, 'enforcer', 28, 70, (c, w, h) => car(c, w, h, { body: '#2a2d33', dark: '#07080a', light: '#545a64', roofLen: 0.42, long: true }));
  tex(scene, 'gunman', 26, 10, (c, w, h) => {
    c.fillStyle = '#e0b48a'; c.beginPath(); c.arc(5, 5, 4, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#111'; c.fillRect(7, 3.5, w - 7, 3);
  });
  tex(scene, 'van', 42, 124, (c, w, h) => {
    c.fillStyle = '#0c0c0c';
    for (const y of [8, 40, 90, 104]) { c.fillRect(0, y, 4, 12); c.fillRect(w - 4, y, 4, 12); }
    c.fillStyle = shade(c, w, '#5e0d0d', '#c62828', '#ff6b5b'); rr(c, 3, 0, w - 6, 30, 6); c.fill();
    c.fillStyle = '#1b2430'; rr(c, 6, 6, w - 12, 8, 2); c.fill();
    c.fillStyle = '#fff6c8'; c.fillRect(6, 1, 6, 3); c.fillRect(w - 12, 1, 6, 3);
    c.fillStyle = '#333'; c.fillRect(8, 30, w - 16, 4);
    c.fillStyle = shade(c, w, '#5e0d0d', '#b71c1c', '#ef5350'); rr(c, 2, 34, w - 4, h - 35, 3); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.5)'; c.stroke();
    c.fillStyle = '#fafafa'; c.fillRect(w / 2 - 5, 38, 10, h - 44);
    c.fillStyle = '#b71c1c'; c.font = 'bold 9px sans-serif'; c.textAlign = 'center';
    c.save(); c.translate(w / 2, 80); c.rotate(-Math.PI / 2); c.fillText('WEAPONS', 0, 3); c.restore();
  });
  tex(scene, 'ramp', 30, 32, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#6b7178'); g.addColorStop(1, '#a9b0b8');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(0,0,0,0.35)';
    for (let y = 3; y < h; y += 5) { c.beginPath(); c.moveTo(2, y); c.lineTo(w - 2, y); c.stroke(); }
  });
  tex(scene, 'heli', 64, 64, (c, w, h) => {
    c.fillStyle = '#1e2a22'; c.fillRect(w / 2 - 2.5, 30, 5, 30);
    c.fillRect(w / 2 - 9, 56, 18, 3);
    const g = c.createRadialGradient(w / 2 - 4, 20, 2, w / 2, 24, 18);
    g.addColorStop(0, '#5b7a63'); g.addColorStop(1, '#16201a');
    c.fillStyle = g; c.beginPath(); c.ellipse(w / 2, 24, 12, 19, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#7fb4d6'; c.beginPath(); c.ellipse(w / 2, 12, 8, 7, 0, Math.PI, Math.PI * 2); c.fill();
    c.fillStyle = '#222'; c.fillRect(w / 2 - 15, 18, 3, 16); c.fillRect(w / 2 + 12, 18, 3, 16);
  });
  tex(scene, 'rotor', 80, 80, (c, w, h) => {
    c.translate(w / 2, h / 2);
    for (let i = 0; i < 2; i++) {
      c.rotate(Math.PI / 2);
      const g = c.createLinearGradient(-40, 0, 40, 0);
      g.addColorStop(0, 'rgba(20,20,20,0.15)'); g.addColorStop(0.5, 'rgba(20,20,20,0.9)'); g.addColorStop(1, 'rgba(20,20,20,0.15)');
      c.fillStyle = g; c.fillRect(-40, -2, 80, 4);
    }
    c.fillStyle = '#444'; c.beginPath(); c.arc(0, 0, 3, 0, Math.PI * 2); c.fill();
  });
  tex(scene, 'torpedo', 30, 58, (c, w, h) => {
    boat(c, w, h, { hull: '#5d6b5a', dark: '#232a22', deck: '#3b4639' });
    c.fillStyle = '#111'; c.fillRect(7, h - 14, 4, 12); c.fillRect(w - 11, h - 14, 4, 12);
  });
  tex(scene, 'barreler', 34, 64, (c, w, h) => {
    boat(c, w, h, { hull: '#8a5a2b', dark: '#3b250f', deck: '#5e3d1d' });
    for (const [x, y] of [[11, 40], [23, 40], [11, 51], [23, 51]]) {
      c.fillStyle = '#d35400'; c.beginPath(); c.arc(x, y, 4.5, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#6e2c00'; c.stroke();
    }
  });
  tex(scene, 'missile', 6, 20, (c, w, h) => {
    c.fillStyle = '#eee'; rr(c, 1, 2, 4, h - 4, 2); c.fill();
    c.fillStyle = '#e53935'; c.beginPath(); c.moveTo(1, 4); c.lineTo(3, 0); c.lineTo(5, 4); c.fill();
    c.fillStyle = '#777'; c.fillRect(0, h - 6, 6, 3);
  });
  tex(scene, 'torp', 6, 24, (c, w, h) => {
    c.fillStyle = '#2b2b2b'; rr(c, 1, 0, 4, h, 2); c.fill();
    c.fillStyle = '#e53935'; c.fillRect(1, h - 4, 4, 4);
  });
  tex(scene, 'bomb', 12, 12, (c, w, h) => radial(c, w, h, [[0, '#666'], [0.6, '#151515'], [1, 'rgba(0,0,0,0)']]));
  tex(scene, 'barrel', 18, 18, (c, w, h) => {
    c.fillStyle = '#d35400'; c.beginPath(); c.arc(9, 9, 8, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#6e2c00'; c.lineWidth = 1.5; c.beginPath(); c.arc(9, 9, 5, 0, Math.PI * 2); c.stroke();
    c.fillStyle = '#f1c40f'; c.fillRect(7, 3, 4, 2);
  });
  tex(scene, 'oil', 56, 56, (c, w, h) => {
    const r = mulberry32(7);
    for (let i = 0; i < 9; i++) {
      const x = w / 2 + r.range(-12, 12), y = h / 2 + r.range(-12, 12), rad = r.range(9, 16);
      const g = c.createRadialGradient(x - 3, y - 3, 1, x, y, rad);
      g.addColorStop(0, '#3d3a52'); g.addColorStop(0.5, '#141220'); g.addColorStop(1, 'rgba(10,8,16,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2); c.fill();
    }
  });
  tex(scene, 'puff', 64, 64, (c, w, h) => radial(c, w, h, [[0, 'rgba(255,255,255,0.95)'], [0.5, 'rgba(235,235,235,0.5)'], [1, 'rgba(220,220,220,0)']]));
  tex(scene, 'dot', 16, 16, (c, w, h) => radial(c, w, h, [[0, 'rgba(255,255,255,1)'], [0.4, 'rgba(255,255,255,0.8)'], [1, 'rgba(255,255,255,0)']]));
  tex(scene, 'flame', 32, 32, (c, w, h) => radial(c, w, h, [[0, '#fffbe0'], [0.25, '#ffd54f'], [0.55, 'rgba(255,111,0,0.7)'], [1, 'rgba(180,30,0,0)']]));
  tex(scene, 'scorch', 64, 64, (c, w, h) => radial(c, w, h, [[0, 'rgba(10,8,6,0.85)'], [0.6, 'rgba(25,20,15,0.5)'], [1, 'rgba(0,0,0,0)']]));
  tex(scene, 'debris', 6, 4, (c, w, h) => { c.fillStyle = '#ddd'; c.fillRect(0, 0, w, h); });
  tex(scene, 'ring', 64, 64, (c, w, h) => {
    c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 3; c.beginPath(); c.arc(32, 32, 29, 0, Math.PI * 2); c.stroke();
  });

  const trees = { summer: ['#1f4a1c', '#2f7a2a', '#5fb34c'], autumn: ['#7a2e0e', '#c8571b', '#f2a33a'], autumn2: ['#6b4a0c', '#c99a1a', '#f4d35e'] };
  for (let v = 0; v < 3; v++) {
    tex(scene, `tree_summer${v}`, 40, 40, (c, w, h) => canopy(c, w, h, rng, trees.summer));
    tex(scene, `tree_autumn${v}`, 40, 40, (c, w, h) => canopy(c, w, h, rng, v === 1 ? trees.autumn2 : trees.autumn));
    tex(scene, `tree_winter${v}`, 40, 40, (c, w, h) => {
      c.translate(w / 2, h / 2);
      for (const [r, col] of [[19, '#1d3b2a'], [13, '#2d5a3f'], [7, '#f4f8fb']]) {
        c.fillStyle = col; c.beginPath();
        for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2 + v, rr2 = i % 2 ? r * 0.6 : r; c.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2); }
        c.fill();
      }
    });
  }
  tex(scene, 'bush', 22, 22, (c, w, h) => canopy(c, w, h, rng, ['#244d1f', '#3c7a30', '#6aa84f']));
  tex(scene, 'rock', 20, 16, (c, w, h) => {
    const g = c.createRadialGradient(7, 5, 1, 10, 8, 11); g.addColorStop(0, '#c8c8c8'); g.addColorStop(1, '#5a5a5a');
    c.fillStyle = g; c.beginPath(); c.ellipse(10, 8, 9.5, 7.5, 0.3, 0, Math.PI * 2); c.fill();
  });
  tex(scene, 'house', 56, 46, (c, w, h) => {
    c.fillStyle = '#8d2e1f'; c.fillRect(0, 0, w, h);
    const g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#5a1a10'); g.addColorStop(0.5, '#b2452f'); g.addColorStop(0.5, '#7a2a1b'); g.addColorStop(1, '#4a140c');
    c.fillStyle = g; c.fillRect(1, 1, w - 2, h - 2);
    c.strokeStyle = 'rgba(0,0,0,0.25)'; for (let y = 4; y < h; y += 5) { c.beginPath(); c.moveTo(1, y); c.lineTo(w - 1, y); c.stroke(); }
    c.fillStyle = '#555'; c.fillRect(w - 16, 8, 7, 7);
  });
  tex(scene, 'boathouse', 200, 90, (c, w, h) => {
    c.fillStyle = '#3b2a1a'; c.fillRect(0, 10, w, h - 10);
    const g = c.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#4e3420'); g.addColorStop(0.5, '#9b6b3f'); g.addColorStop(0.5, '#6f4a2a'); g.addColorStop(1, '#3f2918');
    c.fillStyle = g; c.fillRect(2, 0, w - 4, h - 6);
    c.strokeStyle = 'rgba(0,0,0,0.3)'; for (let x = 6; x < w; x += 8) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h - 6); c.stroke(); }
    c.fillStyle = '#f4f1e8'; c.font = 'bold 15px sans-serif'; c.textAlign = 'center'; c.fillText('BOAT HOUSE', w / 2, h / 2 + 3);
  });
  tex(scene, 'dock', 200, 34, (c, w, h) => {
    c.fillStyle = '#7a5532'; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(0,0,0,0.35)'; for (let y = 0; y < h; y += 5) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    c.fillStyle = '#3b2a1a'; for (let x = 0; x < w; x += 24) c.fillRect(x, 0, 4, h);
  });
  tex(scene, 'sign', 58, 30, (c, w, h) => {
    c.fillStyle = '#555'; c.fillRect(w / 2 - 2, 20, 4, 10);
    c.fillStyle = '#1565c0'; rr(c, 1, 1, w - 2, 21, 3); c.fill();
    c.strokeStyle = '#fff'; c.lineWidth = 1.2; rr(c, 2.5, 2.5, w - 5, 18, 2); c.stroke();
    c.fillStyle = '#fff'; c.font = 'bold 11px sans-serif'; c.textAlign = 'center'; c.fillText('BOAT ▶', w / 2, 16);
  });

  const grass = { summer: ['#3d7a33', '#336a2b', '#4f8f3f'], autumn: ['#7c6b2c', '#6a5a22', '#8f7c37'], winter: ['#e9eff4', '#d3dde6', '#ffffff'] };
  for (const [k, [base, dark, light]] of Object.entries(grass)) {
    tex(scene, 'ground_' + k, 128, 128, (c, w, h) => {
      c.fillStyle = base; c.fillRect(0, 0, w, h);
      const r = mulberry32(k.length * 99);
      for (let i = 0; i < 260; i++) {
        c.fillStyle = r() < 0.5 ? dark : light;
        c.globalAlpha = r.range(0.3, 0.8);
        c.fillRect(r() * w, r() * h, r.range(1, 2.5), r.range(1, 3.5));
      }
      c.globalAlpha = 1;
    });
  }
}
