const q = new URLSearchParams(location.search);
export const opts = {
  debug: q.has('debug'),
  bot: q.get('bot') === '1',
  seed: q.has('seed') ? Number(q.get('seed')) : null,
};
export const FONT = '"Russo One", "Arial Black", sans-serif';
export function loadHi() { try { return Number(localStorage.getItem('spykiller.hi')) || 0; } catch { return 0; } }
export function saveHi(v) { try { localStorage.setItem('spykiller.hi', String(v)); } catch { /* storage blocked */ } }
