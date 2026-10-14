import { createSim, step } from '../logic/sim.js';
import { botInput } from '../logic/bot.js';
import { T } from '../logic/tuning.js';
import { mulberry32 } from '../logic/rng.js';
import { laneOffsets } from '../logic/track.js';
import { sfx, engine, toggleMusic, unlock } from '../audio.js';
import { opts, FONT, loadHi, saveHi } from '../opts.js';

const W = 540, H = 960, PY = 720, DT = 1 / 60;
const AHEAD = PY + 80, BEHIND = H - PY + 80;
const ROW = 12;
const THEMES = ['summer', 'autumn', 'winter'];
const ROAD = 0x46494e;
const WATER = 0x1f6fa8, DEEP = 0x165684, BANK = 0xb59a6a;
const WEAPON_NAMES = { oil: 'OIL SLICK', smoke: 'SMOKE SCREEN', missile: 'MISSILES' };
const SILENT = new Proxy({}, { get: () => () => {} });
// side panels in index.html, visible only on wide screens
const sideBest = document.getElementById('side-best'), sideDist = document.getElementById('side-dist');
sideBest.textContent = loadHi();
const setText = (el, v) => { if (el.textContent !== v) el.textContent = v; };

export class Run extends Phaser.Scene {
  constructor() { super('Run'); }

  init(data) {
    this.attract = !!data.attract;
    this.seed = data.seed ?? opts.seed ?? ((Math.random() * 1e9) | 0); // picking a seed is the only Math.random use
    this.useBot = this.attract || opts.bot;
    this.snd = this.attract ? SILENT : sfx;
  }

  create() {
    const s = (this.sim = createSim({ seed: this.seed }));
    this.cameras.main.setZoom(2).centerOn(W / 2, H / 2);
    this.acc = 0; this.hi = false; this.paused = false; this.queued = {}; this.clock = 0; this.overShown = false; this.lastInput = null;
    this.fxRng = mulberry32(this.seed ^ 0x5eed);

    this.theme = s.track.at(0).theme;
    this.ground = Object.fromEntries(THEMES.map(t => [t,
      this.add.tileSprite(0, 0, W, H, 'ground_' + t).setOrigin(0).setTileScale(0.5).setAlpha(t === this.theme ? 1 : 0).setDepth(0)]));

    this.world = this.add.container(0, 0).setDepth(1);
    const layer = () => this.add.container();
    this.gTerrain = this.add.graphics(); this.gRoad = this.add.graphics(); this.lDecal = layer(); this.gMarks = this.add.graphics();
    this.lGround = layer(); this.gShots = this.add.graphics(); this.lProps = layer(); this.lFx = layer(); this.lAir = layer();
    this.world.add([this.gTerrain, this.gRoad, this.lDecal, this.gMarks, this.lGround, this.gShots, this.lProps, this.lFx, this.lAir]);

    this.makeEmitters();
    this.views = new Map(); this.shotViews = new Map(); this.hazViews = new Map();
    this.props = new Map(); this.feats = new Map(); this.decals = []; this.marks = [];
    this.player = this.makeView({ type: 'car' }, this.lGround);

    if (!this.attract) { this.makeHud(); this.bindKeys(); this.best = loadHi(); }
    this.events.once('shutdown', () => engine(0, false));
  }

  bindKeys() {
    const kb = this.input.keyboard;
    this.keys = kb.addKeys('UP,DOWN,LEFT,RIGHT,W,A,S,D,SPACE,Z,X,C,V,SHIFT,P,M,ENTER,ESC');
    kb.on('keydown', () => unlock());
    kb.on('keydown-SHIFT', () => { this.hi = !this.hi; });
    kb.on('keydown-X', () => { this.queued.oil = true; });
    kb.on('keydown-C', () => { this.queued.smoke = true; });
    kb.on('keydown-V', () => { this.queued.missile = true; });
    kb.on('keydown-P', () => { if (!this.sim.over) { this.paused = !this.paused; this.pauseText.setVisible(this.paused); } });
    kb.on('keydown-M', () => this.banner(toggleMusic() ? 'MUSIC ON' : 'MUSIC OFF', '#9fe8ff', 900));
    kb.on('keydown-ENTER', () => { if (this.sim.over) this.scene.restart({ seed: undefined }); });
    kb.on('keydown-ESC', () => { if (this.sim.over || this.paused) this.scene.start('Title'); });
    this.input.on('pointerdown', () => unlock());
  }

  readInput() {
    const s = this.sim;
    if (this.useBot) return botInput(s);
    const k = this.keys;
    const inp = {
      up: k.UP.isDown || k.W.isDown, down: k.DOWN.isDown || k.S.isDown,
      left: k.LEFT.isDown || k.A.isDown, right: k.RIGHT.isDown || k.D.isDown,
      fire: k.SPACE.isDown || k.Z.isDown, hi: this.hi, ...this.queued,
    };
    this.queued = {};
    return inp;
  }

  update(_, delta) {
    const s = this.sim;
    const dt = Math.min(delta, 100) / 1000;
    if (!this.paused) {
      this.acc += dt;
      while (this.acc >= DT) { this.lastInput = this.readInput(); step(s, this.lastInput, DT); this.acc -= DT; }
      this.clock += dt;
    }
    if (this.attract && (s.over || s.t > 150)) return this.scene.restart({ attract: true });
    this.drainEvents();
    if (s.over && !this.overShown) { this.overShown = true; this.gameOver(); }
    this.draw(this.paused ? 0 : dt);
  }

  // ------------------------------------------------------------ drawing

  draw(dt) {
    const s = this.sim, cam = s.camD;
    this.world.y = PY + cam;
    const theme = s.track.at(cam).theme;
    if (theme !== this.theme) {
      this.tweens.add({ targets: this.ground[theme], alpha: 1, duration: 1800 });
      this.tweens.add({ targets: this.ground[this.theme], alpha: 0, duration: 1800 });
      this.theme = theme;
    }
    for (const g of Object.values(this.ground)) g.tilePositionY = -cam * 2;
    this.drawRoad();
    this.syncProps();
    this.syncFeatures();
    this.syncEnts(dt);
    this.syncPlayer(dt);
    this.syncShots();
    this.syncHazards(dt);
    this.drawMarks();
    if (!this.attract) this.updateHud();
    if (!this.attract) engine(s.player.alive ? s.player.speed : 0, s.player.alive && !this.paused && !s.over);
  }

  drawRoad() {
    const s = this.sim, cam = s.camD, g = this.gRoad, gt = this.gTerrain, t = this.clock;
    g.clear(); gt.clear();
    const rows = [];
    for (let d = Math.floor((cam - BEHIND) / ROW) * ROW; d <= cam + AHEAD + ROW; d += ROW) rows.push({ d, sl: s.track.at(d) });

    // bridges: open water across the whole width
    for (const [a, b] of runs(rows, r => r.sl.bridge)) {
      const top = -rows[b].d - ROW, h = rows[b].d - rows[a].d + ROW * 2;
      gt.fillStyle(WATER, 1).fillRect(0, top, W, h);
      gt.fillStyle(DEEP, 0.5).fillRect(0, top + 20, W, Math.max(0, h - 40));
      gt.fillStyle(BANK, 1).fillRect(0, top - 8, W, 10).fillRect(0, top + h - 2, W, 10);
      this.ripples(gt, rows, a, b, () => 0, () => W, t);
    }

    // which rows actually show strip 1 as its own road
    const distinct = r => { const [x, y] = r.sl.strips; return Math.abs(x.c - y.c) > 0.5 || Math.abs(x.hw - y.hw) > 0.5 || x.surf !== y.surf; };
    const pieces = [];
    for (const k of [0, 1]) {
      for (const [a, b] of runs(rows, r => k === 0 || distinct(r))) {
        let i = a;
        while (i <= b) { // split again where the surface or bridge changes
          const surf = rows[i].sl.strips[k].surf, bridge = rows[i].sl.bridge;
          let j = i;
          while (j + 1 <= b && rows[j + 1].sl.strips[k].surf === surf && rows[j + 1].sl.bridge === bridge) j++;
          pieces.push({ k, a: i, b: Math.min(b, j + 1), surf, bridge });
          i = j + 1;
        }
      }
    }
    const edge = (p, off, side) => {
      const pts = [];
      for (let i = p.a; i <= p.b; i++) { const st = rows[i].sl.strips[p.k]; pts.push({ x: side < 0 ? st.l - off : st.r + off, y: -rows[i].d }); }
      return pts;
    };
    const poly = (p, off) => [...edge(p, off, -1), ...edge(p, off, 1).reverse()];

    for (const p of pieces) { // pass 1: rough grass (the crash line is its outer edge), gravel shoulders, decks, banks
      if (p.surf === 'water') g.fillStyle(BANK, 1).fillPoints(poly(p, 9), true);
      else if (p.bridge) g.fillStyle(0x5d636b, 1).fillPoints(poly(p, 10), true);
      else g.fillStyle(0x3b2f1c, 0.22).fillPoints(poly(p, T.shoulder + T.grassDepth), true);
    }
    for (const p of pieces) if (p.surf === 'road' && !p.bridge) g.fillStyle(0x8a8070, 1).fillPoints(poly(p, T.shoulder), true);
    for (const p of pieces) { // pass 2: asphalt and water
      if (p.surf === 'water') {
        g.fillStyle(WATER, 1).fillPoints(poly(p, 0), true);
        g.fillStyle(DEEP, 0.55).fillPoints(poly(p, -18), true);
        this.ripples(g, rows, p.a, p.b, i => rows[i].sl.strips[p.k].l, i => rows[i].sl.strips[p.k].r, t);
      } else {
        g.fillStyle(ROAD, 1).fillPoints(poly(p, 0), true);
      }
    }
    // where the two branches still overlap, markings of one must not be painted across the other's asphalt
    const hidden = (i, k, x) => { const o = rows[i].sl.strips[1 - k]; return distinct(rows[i]) && o.surf === 'road' && x > o.l + 1 && x < o.r - 1; };
    const seg = (i, k, f, col, w) => { // f maps a strip to an x; draws row i -> i+1 unless hidden
      const s0 = rows[i].sl.strips[k], s1 = rows[i + 1].sl.strips[k], x0 = f(s0), x1 = f(s1);
      if (hidden(i, k, x0) || hidden(i + 1, k, x1)) return;
      g.lineStyle(w, col, 0.9).lineBetween(x0, -rows[i].d, x1, -rows[i + 1].d);
    };
    for (const p of pieces) { // pass 3: rumble, markings and rails
      if (p.surf === 'water') continue;
      for (let i = p.a; i < p.b; i++) {
        if (Math.floor(rows[i].d / (ROW * 2)) % 2 === 0) { seg(i, p.k, st => st.l - 4, 0xd23a3a, 6); seg(i, p.k, st => st.r + 4, 0xd23a3a, 6); }
        seg(i, p.k, st => st.l + 5, 0xf2f2f2, 2); seg(i, p.k, st => st.r - 5, 0xf2f2f2, 2);
      }
      const lanes = laneOffsets(rows[p.a].sl.strips[p.k].hw), dividers = lanes.slice(1).map((f, i) => (f + lanes[i]) / 2);
      for (const f of dividers) {
        const yellow = f === 0 && dividers.length > 1;
        for (let i = p.a; i < p.b; i++) if (Math.floor(rows[i].d / 30) % 2 === 0) seg(i, p.k, st => st.c + f * st.hw, yellow ? 0xf5c518 : 0xf2f2f2, yellow ? 3 : 2);
      }
      for (const [a, b] of runs(rows, r => r.sl.bridge)) {
        if (b < p.a || a > p.b) continue;
        const q = { ...p, a: Math.max(a, p.a), b: Math.min(b + 1, p.b) };
        g.lineStyle(4, 0xb8bec5, 1); g.strokePoints(edge(q, 12, -1)); g.strokePoints(edge(q, 12, 1));
        g.fillStyle(0x6d737a, 1);
        for (let i = q.a; i <= q.b; i += 2) { const st2 = rows[i].sl.strips[p.k]; g.fillRect(st2.l - 15, -rows[i].d - 2, 6, 4).fillRect(st2.r + 9, -rows[i].d - 2, 6, 4); }
      }
    }
  }

  ripples(g, rows, a, b, left, right, t) {
    for (let i = a; i <= b; i++) {
      const d = rows[i].d;
      if ((d / ROW) % 3) continue;
      const l = left(i), r = right(i), h = frac(Math.sin(d * 12.9898) * 43758.5453);
      const x = l + 8 + h * Math.max(0, r - l - 30) + Math.sin(t * 1.7 + d) * 4;
      g.lineStyle(1.5, 0xbfe6ff, 0.35 + 0.2 * Math.sin(t * 3 + d));
      g.lineBetween(x, -d + Math.sin(t + d) * 3, x + 12 + h * 10, -d + Math.sin(t + d) * 3);
    }
  }

  syncProps() {
    const s = this.sim, cam = s.camD, CH = 140;
    const k0 = Math.floor((cam - BEHIND - 60) / CH), k1 = Math.floor((cam + AHEAD + 60) / CH);
    for (let k = k0; k <= k1; k++) {
      if (this.props.has(k)) continue;
      const rng = mulberry32((this.seed * 31 + k * 7919) >>> 0), list = [];
      const n = 2 + rng.int(4);
      for (let i = 0; i < n; i++) {
        const x = rng() * W, d = k * CH + rng() * CH, roll = rng(), sl = s.track.at(d);
        const kind = roll < 0.05 ? 'house' : roll < 0.68 ? 'tree' : roll < 0.9 ? 'bush' : 'rock';
        const clear = T.shoulder + T.grassDepth + (kind === 'house' ? 30 : kind === 'tree' ? 16 : 10); // scenery sits past the crash line
        if (sl.bridge || sl.strips.some(st => x > st.l - clear && x < st.r + clear)) continue;
        const key = kind === 'tree' ? `tree_${sl.theme}${rng.int(3)}` : kind === 'bush' && sl.theme === 'winter' ? `tree_winter${rng.int(3)}` : kind;
        const sc = 0.5 * rng.range(0.8, 1.25), rot = kind === 'house' ? rng.pick([0, Math.PI / 2]) : rng() * Math.PI * 2;
        const shadow = this.add.image(x + 5, -d + 7, key).setScale(sc).setRotation(rot).setTint(0).setAlpha(0.3);
        const img = this.add.image(x, -d, key).setScale(sc).setRotation(rot);
        this.lProps.add([shadow, img]);
        list.push(shadow, img);
      }
      this.props.set(k, list);
    }
    for (const [k, list] of this.props) if (k < k0 || k > k1) { list.forEach(o => o.destroy()); this.props.delete(k); }
  }

  syncFeatures() {
    const s = this.sim, cam = s.camD;
    for (const f of s.track.featuresIn(cam - BEHIND - 200, cam + AHEAD + 200)) {
      const id = f.type + f.d;
      if (this.feats.has(id)) continue;
      let o = null;
      if (f.type === 'boathouse') { o = this.add.image(f.x, -f.d + 12, 'boathouse').setOrigin(0.5, 1).setScale(0.5).setAlpha(0.95); this.lProps.add(o); }
      else if (f.type === 'dock') { o = this.add.image(f.x, -f.d, 'dock').setScale(0.5); this.lDecal.add(o); }
      else if (f.type === 'boatSign') { o = this.add.image(f.x + 110, -f.d, 'sign').setScale(0.5); this.lProps.add(o); }
      if (o) this.feats.set(id, { o, d: f.d });
    }
    for (const [id, f] of this.feats) if (f.d < cam - BEHIND - 300) { f.o.destroy(); this.feats.delete(id); }
  }

  makeView(e, parent) {
    const key = e.type === 'civ' ? 'civ' + e.color : e.type;
    const air = e.type === 'heli';
    const root = this.add.container(e.x ?? 0, -(e.d ?? 0));
    const shadow = this.add.image(air ? 34 : 3, air ? 64 : 5, key).setScale(air ? 0.4 : 0.5).setTint(0).setAlpha(air ? 0.22 : 0.35);
    const body = this.add.image(0, 0, key).setScale(0.5);
    const v = { root, body, shadow, rot: 0 };
    root.add(shadow);
    if (e.type === 'van') { v.ramp = this.add.image(0, 61, 'ramp').setOrigin(0.5, 0).setScale(0.5, 0); root.add(v.ramp); }
    if (e.type === 'switchblade') {
      v.blades = [];
      for (const sx of [-1, 1]) for (const y of [-14, 13]) v.blades.push(this.add.image(sx * 13, y, 'blade').setScale(0));
      root.add(v.blades);
    }
    root.add(body);
    if (e.type === 'enforcer') { v.gun = this.add.image(0, -8, 'gunman').setScale(0.5).setVisible(false); root.add(v.gun); }
    if (air) { v.rotor = this.add.image(0, 2, 'rotor').setScale(0.5); root.add(v.rotor); }
    if (e.type === 'civ' || e.type === 'moto') { // turn signals, front and rear on the side they're moving to
      v.blink = [0, 1].map(() => this.add.image(0, 0, 'dot').setScale(0.35).setTint(0xffa000).setBlendMode('ADD').setVisible(false));
      root.add(v.blink);
    }
    (parent ?? (air ? this.lAir : this.lGround)).add(root);
    return v;
  }

  syncEnts(dt) {
    const s = this.sim, seen = new Set();
    for (const e of s.ents) {
      seen.add(e.id);
      let v = this.views.get(e.id);
      if (!v) this.views.set(e.id, (v = this.makeView(e)));
      v.root.setPosition(e.x, -e.d);
      if (e.spin > 0) {
        v.rot += dt * 13 * (e.vx >= 0 ? 1 : -1);
        if (this.fxRng() < 0.5) this.fx.tire.emitParticleAt(e.x, -e.d + 10);
      } else v.rot = clamp(e.vx / Math.max(e.speed, 160), -0.4, 0.4) * 0.8;
      v.body.rotation = v.rot; v.shadow.rotation = v.rot;
      if (v.rotor) {
        v.rotor.rotation += dt * 30;
        v.body.rotation = v.shadow.rotation = clamp(e.vx / 300, -0.3, 0.3);
        v.root.setScale(1 + Math.sin(this.clock * 3) * 0.02);
      }
      if (v.blades) {
        const want = e.blades ? 0.5 : 0;
        v.blades.forEach(b => { b.scale += (want - b.scale) * Math.min(1, dt * 12); b.rotation += dt * 40; });
        if (e.blades && this.fxRng() < 0.3) this.fx.spark.emitParticleAt(e.x + (this.fxRng() < 0.5 ? -16 : 16), -e.d + 13);
      }
      if (v.gun) {
        v.gun.setVisible(e.aim > 0).setFlipX(e.side > 0).setX(e.side > 0 ? -12 : 12);
        v.gun.setTint(e.aim > 0 && e.aim < 0.3 && Math.floor(this.clock * 20) % 2 ? 0xff4444 : 0xffffff);
      }
      if (v.blink) {
        const side = Math.sign(e.signal || (e.changing ? e.vx : 0)), on = side !== 0 && Math.floor(this.clock * 3) % 2 === 0;
        const hx = e.type === 'moto' ? 5 : 11, hy = e.type === 'moto' ? 13 : 22;
        v.blink.forEach((b, i) => b.setVisible(on).setPosition(side * hx, i ? hy : -hy));
      }
      if (v.ramp) {
        const want = e.state === 'wait' || e.state === 'unload' ? 0.5 : 0;
        v.ramp.scaleY += (want - v.ramp.scaleY) * Math.min(1, dt * 6);
      }
      if (e.type === 'torpedo' || e.type === 'barreler') this.wake(e.x, -e.d + 28, 1);
    }
    for (const [id, v] of this.views) if (!seen.has(id)) { v.root.destroy(); this.views.delete(id); }
  }

  syncPlayer(dt) {
    const s = this.sim, p = s.player, v = this.player;
    v.root.setVisible(p.alive && !(p.docked > 0));
    if (!p.alive) return;
    if (v.body.texture.key !== p.kind) { v.body.setTexture(p.kind); v.shadow.setTexture(p.kind); }
    v.root.setPosition(p.x, -p.d);
    v.body.rotation = v.shadow.rotation = clamp(p.vx / Math.max(p.speed, 160), -0.45, 0.45) * 0.8;
    v.root.alpha = p.inv > 0 && Math.floor(this.clock * 12) % 2 ? 0.35 : 1;
    if (p.docked > 0) return;
    const r = this.fxRng, inp = this.lastInput ?? {};
    if (p.kind === 'boat') { this.wake(p.x, -p.d + 28, 2); return; }
    if (r() < 0.3 + p.speed / 900) this.fx.exhaust.emitParticleAt(p.x + (r() < 0.5 ? -5 : 5), -p.d + 26);
    const skid = (Math.abs(p.vx) > 170 && p.speed > 220) || (inp.down && p.speed > 160);
    if (skid) {
      for (const ox of [-10, 10]) this.marks.push({ x: p.x + ox, d: p.d - 18 });
      if (r() < 0.5) this.fx.tire.emitParticleAt(p.x + (r() < 0.5 ? -10 : 10), -p.d + 20);
    }
    if (p.zone !== 'road' && p.speed > 60) {
      const grass = p.zone === 'grass';
      if (r() < 0.8) this.fx[grass ? 'dirt' : 'gravel'].emitParticleAt(p.x + (r() < 0.5 ? -10 : 10), -p.d + 20);
      if (!this.attract) this.cameras.main.shake(60, (grass ? 0.004 : 0.0018) * T.shake);
    }
  }

  wake(x, y, n) {
    for (let i = 0; i < n; i++) if (this.fxRng() < 0.7) this.fx.wake.emitParticleAt(x + (this.fxRng() - 0.5) * 14, y);
  }

  syncShots() {
    const s = this.sim, g = this.gShots, seen = new Set();
    g.clear();
    for (const sh of s.shots) {
      if (sh.type === 'bullet') {
        g.lineStyle(5, 0xffb300, 0.25).lineBetween(sh.x, -sh.d, sh.x, -sh.d + 16);
        g.lineStyle(2, 0xfff3b0, 1).lineBetween(sh.x, -sh.d, sh.x, -sh.d + 12);
        continue;
      }
      seen.add(sh.id);
      let o = this.shotViews.get(sh.id);
      if (!o) { o = this.add.image(sh.x, -sh.d, sh.type).setScale(0.5); this.lAir.add(o); this.shotViews.set(sh.id, o); }
      o.setPosition(sh.x, -sh.d).setRotation(Math.atan2(sh.vx, Math.abs(sh.vd)) * (sh.vd < 0 ? -1 : 1)).setFlipY(sh.vd < 0);
      if (sh.type === 'missile') this.fx.trail.emitParticleAt(sh.x, -sh.d + 10);
      else this.wake(sh.x, -sh.d - (sh.vd < 0 ? -12 : 12), 1);
    }
    for (const [id, o] of this.shotViews) if (!seen.has(id)) { o.destroy(); this.shotViews.delete(id); }
  }

  syncHazards(dt) {
    const s = this.sim, seen = new Set();
    for (const hz of s.hazards) {
      seen.add(hz.id);
      let v = this.hazViews.get(hz.id);
      if (hz.type === 'smoke') { if (this.fxRng() < 0.35) this.fx.screen.emitParticleAt(hz.x + (this.fxRng() - 0.5) * 60, -hz.d + (this.fxRng() - 0.5) * 60); continue; }
      if (!v) {
        if (hz.type === 'oil') { v = { o: this.add.image(hz.x, -hz.d, 'oil').setScale(0.1).setRotation(this.fxRng() * 6) }; this.lDecal.add(v.o); this.tweens.add({ targets: v.o, scale: 0.55, duration: 250, ease: 'Back.Out' }); }
        if (hz.type === 'barrel') { v = { o: this.add.image(hz.x, -hz.d, 'barrel').setScale(0.5) }; this.lGround.add(v.o); }
        if (hz.type === 'bomb') {
          v = { o: this.add.image(hz.fromX, -hz.fromD, 'bomb').setScale(0.9), mark: this.add.image(hz.x, -hz.d, 'ring').setScale(1).setAlpha(0).setTint(0xff3030) };
          this.lAir.add(v.o); this.lDecal.add(v.mark);
        }
        this.hazViews.set(hz.id, v);
      }
      if (hz.type === 'oil') v.o.alpha = Math.min(1, hz.life);
      if (hz.type === 'barrel') v.o.rotation = Math.sin(this.clock * 2 + hz.id) * 0.4;
      if (hz.type === 'bomb') {
        const k = 1 - hz.fall / hz.fall0;
        v.o.setPosition(hz.fromX + (hz.x - hz.fromX) * k, -(hz.fromD + (hz.d - hz.fromD) * k)).setScale(0.9 - 0.45 * k);
        v.mark.setScale(1.1 - 0.55 * k).setAlpha((0.4 + 0.6 * k) * (Math.floor(this.clock * 12) % 2 ? 1 : 0.5));
      }
    }
    for (const [id, v] of this.hazViews) if (!seen.has(id)) { v.o.destroy(); v.mark?.destroy(); this.hazViews.delete(id); }
  }

  drawMarks() {
    const cam = this.sim.camD, g = this.gMarks;
    this.marks = this.marks.filter(m => m.d > cam - BEHIND).slice(-700);
    g.clear().fillStyle(0x111111, 0.45);
    for (const m of this.marks) g.fillRect(m.x - 1.5, -m.d - 3, 3, 6);
    this.decals = this.decals.filter(o => { if (-o.y < cam - BEHIND - 80) { o.destroy(); return false; } return true; });
  }

  // ------------------------------------------------------------ effects

  makeEmitters() {
    const P = (key, cfg) => { const e = this.add.particles(0, 0, key, { emitting: false, ...cfg }); this.lFx.add(e); return e; };
    this.fx = {
      fire: P('flame', { lifespan: { min: 300, max: 800 }, speed: { min: 30, max: 210 }, scale: { start: 0.8, end: 0 }, alpha: { start: 1, end: 0 }, blendMode: 'ADD' }),
      smoke: P('puff', { lifespan: { min: 900, max: 1900 }, speed: { min: 10, max: 70 }, scale: { start: 0.25, end: 0.95 }, alpha: { start: 0.55, end: 0 }, tint: [0x3a3a3a, 0x555555, 0x2a2a2a] }),
      spark: P('dot', { lifespan: { min: 150, max: 400 }, speed: { min: 120, max: 380 }, scale: { start: 0.35, end: 0 }, blendMode: 'ADD', tint: 0xffd54f }),
      debris: P('debris', { lifespan: { min: 500, max: 1100 }, speed: { min: 80, max: 300 }, scale: { start: 0.7, end: 0.3 }, rotate: { min: 0, max: 360 }, alpha: { start: 1, end: 0 }, tint: [0x333333, 0x888888, 0xaa3322] }),
      splash: P('dot', { lifespan: { min: 400, max: 900 }, speed: { min: 40, max: 220 }, scale: { start: 0.6, end: 0.1 }, alpha: { start: 0.9, end: 0 }, tint: [0xffffff, 0xbfe6ff, 0x8fd0ff] }),
      exhaust: P('puff', { lifespan: 450, speed: { min: 5, max: 25 }, angle: { min: 80, max: 100 }, scale: { start: 0.05, end: 0.2 }, alpha: { start: 0.3, end: 0 }, tint: 0x9a9a9a }),
      gravel: P('puff', { lifespan: 650, speed: { min: 10, max: 45 }, angle: { min: 60, max: 120 }, scale: { start: 0.12, end: 0.5 }, alpha: { start: 0.55, end: 0 }, tint: 0xb8ad98 }),
      dirt: P('puff', { lifespan: 750, speed: { min: 10, max: 55 }, angle: { min: 60, max: 120 }, scale: { start: 0.15, end: 0.6 }, alpha: { start: 0.6, end: 0 }, tint: 0x6b5a32 }),
      tire: P('puff', { lifespan: 700, speed: { min: 5, max: 30 }, scale: { start: 0.1, end: 0.45 }, alpha: { start: 0.4, end: 0 }, tint: 0xcccccc }),
      wake: P('dot', { lifespan: 1000, speed: { min: 15, max: 55 }, angle: { min: 50, max: 130 }, scale: { start: 0.3, end: 1.1 }, alpha: { start: 0.65, end: 0 } }),
      screen: P('puff', { lifespan: { min: 2200, max: 3600 }, speed: { min: 10, max: 50 }, scale: { start: 0.5, end: 2.0 }, alpha: { start: 0.85, end: 0 }, tint: [0xffffff, 0xe8e8e8, 0xd0d0d0] }),
      muzzle: P('flame', { lifespan: 70, speed: { min: 0, max: 30 }, scale: { start: 0.35, end: 0.1 }, blendMode: 'ADD' }),
      trail: P('flame', { lifespan: 260, speed: { min: 0, max: 20 }, scale: { start: 0.3, end: 0 }, alpha: { start: 0.9, end: 0 }, blendMode: 'ADD' }),
    };
  }

  explode(ev) {
    const x = ev.x, y = -ev.d, big = !!ev.big, fx = this.fx, cam = this.sim.camD;
    if (ev.d < cam - BEHIND || ev.d > cam + AHEAD) return; // off screen: no flash, sound or shake
    const flash = (key, to, ms, tint) => {
      const o = this.add.image(x, y, key).setScale(0.3).setBlendMode('ADD');
      if (tint) o.setTint(tint);
      this.lFx.add(o);
      this.tweens.add({ targets: o, scale: to, alpha: 0, duration: ms, ease: 'Cubic.Out', onComplete: () => o.destroy() });
    };
    if (ev.water) {
      fx.splash.explode(big ? 60 : 35, x, y);
      flash('ring', big ? 2 : 1.4, 600, 0xbfe6ff);
      if (!ev.cause || ev.ent) fx.fire.explode(10, x, y);
      this.snd.splash();
      if (ev.ent) this.snd.boom(false);
    } else {
      fx.fire.explode(big ? 42 : 26, x, y);
      fx.smoke.explode(big ? 20 : 12, x, y);
      fx.debris.explode(big ? 26 : 14, x, y);
      fx.spark.explode(16, x, y);
      flash('flame', big ? 3.4 : 2.3, 380);
      flash('ring', big ? 2.6 : 1.8, 450);
      if (!ev.air) {
        const sc = this.add.image(x, y, 'scorch').setScale(big ? 0.9 : 0.6).setRotation(this.fxRng() * 6).setAlpha(0.85);
        this.lDecal.add(sc); this.decals.push(sc);
        let n = 0;
        this.time.addEvent({ delay: 90, repeat: 14, callback: () => { n++; fx.fire.explode(2, x + (this.fxRng() - 0.5) * 10, y); if (n % 3 === 0) fx.smoke.explode(1, x, y); } });
      }
      this.snd.boom(big);
    }
    const p = this.sim.player, near = Math.max(0.25, 1 - Math.hypot(p.x - x, p.d - ev.d) / 600);
    if (!this.attract || big) this.cameras.main.shake(big ? 380 : 200, (big ? 0.012 : 0.005) * near * T.shake * (this.attract ? 0.3 : 1));
  }

  drainEvents() {
    const s = this.sim, fx = this.fx;
    for (const ev of s.events) {
      switch (ev.type) {
        case 'boom': this.explode(ev); break;
        case 'shot': fx.muzzle.explode(2, ev.x - 7, -ev.d - 2); fx.muzzle.explode(2, ev.x + 7, -ev.d - 2); this.snd.shot(); break;
        case 'hit': fx.spark.explode(6, ev.x, -ev.d); this.snd.hit(); break;
        case 'ricochet': fx.spark.explode(10, ev.x, -ev.d); this.snd.ricochet(); break;
        case 'bump': fx.spark.explode(5, ev.x, -ev.d); this.snd.bump(); break;
        case 'oil': this.snd.drop(); break;
        case 'smoke': fx.screen.explode(24, ev.x, -ev.d); this.snd.smoke(); break;
        case 'missile': this.snd.missile(); break;
        case 'torp': this.snd.drop(); break;
        case 'bombDrop': this.snd.bombDrop(); break;
        case 'shotgun': {
          const dir = Math.sign(ev.tx - ev.x);
          fx.fire.explode(8, ev.x + dir * 18, -ev.d + 8); fx.spark.explode(14, ev.x + dir * 30, -ev.d + 8); this.snd.shotgun(); break;
        }
        case 'toBoat': case 'toCar':
          fx.splash.explode(40, ev.x, -ev.d); this.snd.transform();
          this.banner(ev.type === 'toBoat' ? 'BOAT MODE' : 'BACK ON THE ROAD', '#9fe8ff', 1200); break;
        case 'noscore': this.snd.alarm(); this.banner('CIVILIAN HIT · NO SCORE', '#ff5a5a', 1600); break;
        case 'points': this.floater(ev.x, -ev.d, '+' + ev.pts); break;
        case 'spare': this.snd.spare(); this.banner('EXTRA CAR!', '#7dff9a', 1500); break;
        case 'weapon': this.snd.pickup(); this.banner(`${WEAPON_NAMES[ev.kind]}  +${ev.n}`, '#ffd54f', 1600); break;
        case 'dock': this.banner('LOADING…', '#ffd54f', 1200); break;
        case 'vanCall': this.banner('WEAPONS VAN APPROACHING', '#ff8a65', 1600); break;
        case 'timerOut': this.banner('TIMER EXPIRED\nSPARE CARS ONLY', '#ffb74d', 2400); break;
        case 'respawn': this.banner('NEW CAR', '#ffffff', 900); break;
      }
    }
    s.events.length = 0;
  }

  // ------------------------------------------------------------ HUD

  txt(x, y, str, size, color = '#ffffff', extra = {}) {
    return this.add.text(x, y, str, { fontFamily: FONT, fontSize: size + 'px', color, ...extra }).setResolution(2).setDepth(100);
  }

  makeHud() {
    const g = this.add.graphics().setDepth(99);
    g.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.75, 0.75, 0, 0).fillRect(0, 0, W, 70);
    g.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0, 0.8, 0.8).fillRect(0, H - 86, W, 86);
    this.txt(16, 8, 'SCORE', 11, '#8fa3b8');
    this.scoreText = this.txt(16, 20, '0', 26);
    this.txt(W / 2, 8, 'TIMER', 11, '#8fa3b8').setOrigin(0.5, 0);
    this.timerText = this.txt(W / 2, 20, '', 26, '#ffb74d').setOrigin(0.5, 0);
    this.txt(W - 16, 8, 'CARS', 11, '#8fa3b8').setOrigin(1, 0);
    this.carsText = this.txt(W - 16, 20, '', 26, '#27c9ff').setOrigin(1, 0);
    this.noScoreText = this.txt(W / 2, 80, '', 16, '#ff5a5a', { stroke: '#000', strokeThickness: 4 }).setOrigin(0.5, 0);
    this.gauge = this.add.graphics().setDepth(100);
    this.gearText = this.txt(120, H - 50, 'LO', 24, '#27c9ff').setOrigin(0.5);
    this.txt(120, H - 26, 'SHIFT', 9, '#8fa3b8').setOrigin(0.5);
    this.speedText = this.txt(58, H - 30, '0', 13).setOrigin(0.5);
    this.slots = ['oil', 'smoke', 'missile'].map((k, i) => {
      const x = 300 + i * 82;
      const icon = this.add.image(x, H - 48, k === 'smoke' ? 'puff' : k).setScale(k === 'missile' ? 0.9 : k === 'oil' ? 0.45 : 0.35).setDepth(100);
      const n = this.txt(x + 18, H - 58, '0', 18).setOrigin(0, 0);
      this.txt(x, H - 24, `${'XCV'[i]} · ${WEAPON_NAMES[k].split(' ')[0]}`, 9, '#8fa3b8').setOrigin(0.5);
      return { k, icon, n };
    });
    this.pauseText = this.txt(W / 2, H / 2, 'PAUSED\n\nP resume · ESC quit', 30, '#ffffff', { align: 'center', stroke: '#000', strokeThickness: 6 }).setOrigin(0.5).setVisible(false);
    this.bannerText = this.txt(W / 2, 260, '', 26, '#fff', { align: 'center', stroke: '#000', strokeThickness: 6 }).setOrigin(0.5).setAlpha(0);
    if (opts.debug) this.debugText = this.txt(8, H - 98, '', 10, '#9fe8ff');
  }

  updateHud() {
    const s = this.sim, p = s.player;
    this.scoreText.setText(String(Math.floor(s.score)).padStart(6, '0'));
    this.timerText.setText(s.timer > 0 ? String(Math.ceil(s.timer)) : '—').setColor(s.timer > 0 ? '#ffb74d' : '#55606b');
    this.carsText.setText(s.timer > 0 ? `∞ +${s.spares}` : `× ${s.spares}`);
    this.noScoreText.setText(s.noScore > 0 ? `NO SCORE  ${Math.ceil(s.noScore)}` : '').setAlpha(Math.floor(this.clock * 4) % 2 ? 1 : 0.5);
    const hi = this.useBot ? p.speed > T.loMax - 30 : this.hi;
    this.gearText.setText(hi ? 'HI' : 'LO').setColor(hi ? '#ffb74d' : '#27c9ff');
    const g = this.gauge.clear(), cx = 58, cy = H - 30, sp = p.alive ? p.speed : 0;
    g.lineStyle(6, 0x2a3440, 1).beginPath().arc(cx, cy, 34, Math.PI, 0).strokePath();
    g.lineStyle(6, sp > T.loMax ? 0xffb74d : 0x27c9ff, 1).beginPath().arc(cx, cy, 34, Math.PI, Math.PI + Math.PI * Math.min(1, sp / T.hiMax)).strokePath();
    const a = Math.PI + Math.PI * Math.min(1, sp / T.hiMax);
    g.lineStyle(2, 0xffffff, 1).lineBetween(cx, cy, cx + Math.cos(a) * 28, cy + Math.sin(a) * 28);
    this.speedText.setText(String(Math.round(sp * 0.25)));
    for (const sl of this.slots) { const n = s.weapons[sl.k]; sl.n.setText(String(n)); sl.icon.setAlpha(n > 0 ? 1 : 0.25); sl.n.setAlpha(n > 0 ? 1 : 0.35); }
    setText(sideBest, String(Math.max(this.best, Math.floor(s.score))));
    setText(sideDist, `${(p.d / 1000).toFixed(1)} km`);
    if (this.debugText) this.debugText.setText(`seed ${this.seed}  d ${p.d | 0}  ents ${s.ents.length}  fps ${this.game.loop.actualFps | 0}`);
  }

  banner(msg, color, ms) {
    if (this.attract || !this.bannerText) return;
    const b = this.bannerText;
    this.tweens.killTweensOf(b);
    b.setText(msg).setColor(color).setAlpha(1).setScale(0.6);
    this.tweens.add({ targets: b, scale: 1, duration: 260, ease: 'Back.Out' });
    this.tweens.add({ targets: b, alpha: 0, delay: ms, duration: 400 });
  }

  floater(x, y, str) {
    if (this.attract) return;
    const t = this.add.text(x, y - 20, str, { fontFamily: FONT, fontSize: '16px', color: '#ffd54f', stroke: '#000', strokeThickness: 4 }).setResolution(2).setOrigin(0.5);
    this.lAir.add(t);
    this.tweens.add({ targets: t, y: y - 80, alpha: 0, duration: 1100, ease: 'Cubic.Out', onComplete: () => t.destroy() });
  }

  gameOver() {
    if (this.attract) return;
    const s = this.sim, best = Math.max(loadHi(), Math.floor(s.score));
    saveHi(best);
    const g = this.add.graphics().setDepth(150);
    g.fillStyle(0x000000, 0.65).fillRect(0, 0, W, H);
    const title = this.txt(W / 2, 360, 'GAME OVER', 54, '#ff5a5a', { stroke: '#000', strokeThickness: 8 }).setOrigin(0.5).setDepth(151).setScale(0.3);
    this.tweens.add({ targets: title, scale: 1, duration: 500, ease: 'Back.Out' });
    this.txt(W / 2, 450, `SCORE  ${Math.floor(s.score)}\nBEST   ${best}\nDISTANCE  ${(s.player.d / 1000).toFixed(1)} km`, 20, '#ffffff', { align: 'center', lineSpacing: 8 }).setOrigin(0.5, 0).setDepth(151);
    this.txt(W / 2, 600, 'ENTER  play again\nESC  title', 16, '#9fe8ff', { align: 'center', lineSpacing: 6 }).setOrigin(0.5, 0).setDepth(151);
  }
}

function* runs(rows, pred) {
  let a = -1;
  for (let i = 0; i < rows.length; i++) {
    if (pred(rows[i])) { if (a < 0) a = i; } else if (a >= 0) { yield [a, i - 1]; a = -1; }
  }
  if (a >= 0) yield [a, rows.length - 1];
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const frac = v => v - Math.floor(v);
