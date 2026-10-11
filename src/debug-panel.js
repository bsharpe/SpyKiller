// ?debug=1: live sliders for the feel numbers in tuning.js, plus "copy values" to paste back into the file.
import { T } from './logic/tuning.js';

export function installDebugPanel() {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;top:8px;right:8px;width:250px;max-height:95vh;overflow:auto;background:#0b1118ee;color:#cfe3f5;font:11px monospace;padding:8px;border:1px solid #27c9ff55;border-radius:6px;z-index:10';
  const start = { ...T };
  for (const k of Object.keys(T)) {
    const max = Math.max(1, start[k] * 3), stepSize = max / 300;
    const row = document.createElement('label');
    row.style.cssText = 'display:block;margin:3px 0';
    row.innerHTML = `<div style="display:flex;justify-content:space-between"><span>${k}</span><b>${T[k]}</b></div>`;
    const input = Object.assign(document.createElement('input'), { type: 'range', min: 0, max, step: stepSize, value: T[k] });
    input.style.width = '100%';
    input.oninput = () => { T[k] = Number(Number(input.value).toPrecision(3)); row.querySelector('b').textContent = T[k]; };
    row.append(input);
    el.append(row);
  }
  const btn = Object.assign(document.createElement('button'), { textContent: 'copy values' });
  btn.onclick = () => { const json = JSON.stringify(T, null, 2); console.log(json); navigator.clipboard?.writeText(json).catch(() => {}); btn.textContent = 'copied (also in console)'; };
  el.append(btn);
  document.body.append(el);
}
