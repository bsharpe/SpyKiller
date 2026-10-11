// WebAudio synth: sound effects, engine drone and an original spy riff. Nothing plays until a real user gesture.
let ctx = null, master, sfxBus, musicBus, noiseBuf, engineOsc, engineGain, engineFilter;
let musicOn = false, musicTimer = null, nextNote = 0, stepIdx = 0;
let muted = false;
const last = {};

try { musicOn = localStorage.getItem('spykiller.music') === '1'; } catch { /* storage blocked */ }

export function unlock() {
  if (ctx) { if (ctx.state !== 'running') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0.6; master.connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.connect(master);
  musicBus = ctx.createGain(); musicBus.gain.value = 0.35; musicBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1; // cosmetic only, not gameplay
  engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth';
  engineFilter = ctx.createBiquadFilter(); engineFilter.type = 'lowpass'; engineFilter.frequency.value = 300;
  engineGain = ctx.createGain(); engineGain.gain.value = 0;
  engineOsc.connect(engineFilter).connect(engineGain).connect(sfxBus);
  engineOsc.start();
  if (musicOn) startMusic();
}

export const audioState = () => ctx?.state ?? 'none';
export const isMusicOn = () => musicOn;

export function toggleMusic() {
  musicOn = !musicOn;
  try { localStorage.setItem('spykiller.music', musicOn ? '1' : '0'); } catch { /* storage blocked */ }
  if (musicOn) startMusic(); else stopMusic();
  return musicOn;
}

export function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.6; }

function throttle(name, ms) {
  const now = performance.now();
  if (now - (last[name] ?? 0) < ms) return false;
  last[name] = now;
  return true;
}

function env(node, t, peak, attack, decay) {
  node.gain.setValueAtTime(0.0001, t);
  node.gain.exponentialRampToValueAtTime(peak, t + attack);
  node.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function tone(type, f0, f1, dur, vol, bus = sfxBus, at = ctx.currentTime) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), at + dur);
  env(g, at, vol, 0.005, dur);
  o.connect(g).connect(bus); o.start(at); o.stop(at + dur + 0.05);
}

function noise(dur, vol, filter, f0, f1 = f0, bus = sfxBus, at = ctx.currentTime) {
  const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const f = ctx.createBiquadFilter(); f.type = filter; f.frequency.setValueAtTime(f0, at); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), at + dur);
  const g = ctx.createGain(); env(g, at, vol, 0.005, dur);
  src.connect(f).connect(g).connect(bus); src.start(at, Math.random()); src.stop(at + dur + 0.05);
}

export const sfx = {
  shot() { if (ctx && throttle('shot', 70)) { tone('square', 1400, 300, 0.05, 0.05); noise(0.04, 0.05, 'highpass', 3000); } },
  boom(big) { if (!ctx) return; noise(big ? 1.2 : 0.7, big ? 0.9 : 0.6, 'lowpass', big ? 1600 : 2200, 60); tone('sine', big ? 120 : 160, 30, big ? 0.8 : 0.5, 0.5); },
  splash() { if (ctx) noise(0.6, 0.4, 'bandpass', 1800, 400); },
  hit() { if (ctx && throttle('hit', 60)) tone('square', 500, 200, 0.06, 0.06); },
  ricochet() { if (ctx && throttle('ric', 80)) tone('sine', 2600, 900, 0.12, 0.08); },
  bump() { if (ctx && throttle('bump', 150)) { noise(0.12, 0.3, 'lowpass', 400, 100); } },
  shotgun() { if (ctx) { noise(0.25, 0.6, 'lowpass', 3000, 300); } },
  missile() { if (ctx) noise(0.6, 0.3, 'bandpass', 600, 3000); },
  drop() { if (ctx) tone('triangle', 300, 120, 0.15, 0.2); },
  smoke() { if (ctx) noise(0.8, 0.25, 'lowpass', 900, 200); },
  bombDrop() { if (ctx) tone('sine', 1800, 500, 1.0, 0.08); },
  pickup() { if (!ctx) return; [523, 659, 784, 1046].forEach((f, i) => tone('square', f, f, 0.09, 0.07, sfxBus, ctx.currentTime + i * 0.07)); },
  alarm() { if (!ctx) return; [880, 660, 880, 660].forEach((f, i) => tone('square', f, f, 0.12, 0.06, sfxBus, ctx.currentTime + i * 0.14)); },
  spare() { if (!ctx) return; [784, 988, 1175, 1568].forEach((f, i) => tone('triangle', f, f, 0.15, 0.1, sfxBus, ctx.currentTime + i * 0.08)); },
  transform() { if (ctx) { noise(0.5, 0.3, 'bandpass', 900, 2400); tone('sine', 200, 600, 0.3, 0.1); } },
};

export function engine(speed, on) {
  if (!ctx) return;
  const t = ctx.currentTime;
  engineOsc.frequency.setTargetAtTime(38 + speed * 0.13, t, 0.08);
  engineFilter.frequency.setTargetAtTime(220 + speed * 1.1, t, 0.1);
  engineGain.gain.setTargetAtTime(on ? 0.045 : 0, t, 0.15);
}

// Original 16-step minor-key riff (not Peter Gunn): bass + muted stab + hats + snare backbeat.
const BPM = 150, STEP = 60 / BPM / 4;
const BASS = [40, 0, 40, 47, 0, 50, 52, 0, 40, 0, 40, 47, 0, 50, 48, 47];
const BASS_B = [43, 0, 43, 50, 0, 53, 55, 0, 45, 0, 45, 52, 0, 55, 53, 52];
const midi = n => 440 * Math.pow(2, (n - 69) / 12);

function scheduleStep(at) {
  const bar = Math.floor(stepIdx / 16) % 4, i = stepIdx % 16;
  const note = (bar === 2 ? BASS_B : BASS)[i];
  if (note) { tone('sawtooth', midi(note), midi(note), STEP * 1.6, 0.22, musicBus, at); tone('square', midi(note + 12), midi(note + 12), STEP * 0.6, 0.05, musicBus, at); }
  if (i % 2 === 0) noise(0.03, 0.08, 'highpass', 7000, 7000, musicBus, at);
  if (i === 4 || i === 12) noise(0.15, 0.25, 'bandpass', 1800, 900, musicBus, at);
  if (i === 0 || i === 8) tone('sine', 110, 40, 0.2, 0.5, musicBus, at);
  if (bar === 3 && (i === 6 || i === 14)) tone('square', midi(76), midi(75), STEP * 2, 0.05, musicBus, at);
}

function startMusic() {
  if (!ctx || musicTimer) return;
  nextNote = ctx.currentTime + 0.05;
  musicTimer = setInterval(() => {
    if (nextNote < ctx.currentTime) nextNote = ctx.currentTime + 0.05; // timers throttle in background tabs; skip, don't burst
    while (nextNote < ctx.currentTime + 0.25) { scheduleStep(nextNote); nextNote += STEP; stepIdx++; }
  }, 60);
}

function stopMusic() { clearInterval(musicTimer); musicTimer = null; }
