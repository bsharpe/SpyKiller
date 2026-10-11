import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTrack, W } from '../src/logic/track.js';
import { T } from '../src/logic/tuning.js';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const LEN = 120000;

test('same seed builds the same road, so a run can be replayed', () => {
  const a = createTrack(42), b = createTrack(42);
  for (let d = 0; d < 30000; d += 97) assert.deepEqual(a.at(d), b.at(d));
});

test('every strip is wide enough to pass a car and stays on screen', () => {
  for (const seed of SEEDS) {
    const tr = createTrack(seed);
    for (let d = 0; d < LEN; d += 20) for (const st of tr.at(d).strips) {
      assert.ok(st.hw * 2 >= 120, `seed ${seed} d ${d}: strip only ${st.hw * 2}px wide`);
      assert.ok(st.l >= 8 && st.r <= W - 8, `seed ${seed} d ${d}: strip off screen ${st.l}..${st.r}`);
    }
  }
});

test('road never bends faster than the car can steer at top speed', () => {
  for (const seed of SEEDS) {
    const tr = createTrack(seed);
    let prev = tr.at(0);
    for (let d = 10; d < LEN; d += 10) {
      const cur = tr.at(d);
      cur.strips.forEach((st, i) => {
        const lateral = Math.abs(st.c - prev.strips[i].c) / 10 * T.hiMax;
        assert.ok(lateral < T.steer * 0.9, `seed ${seed} d ${d}: needs ${lateral.toFixed(0)}px/s sideways`);
      });
      prev = cur;
    }
  }
});

test('the river is farther from any road than a car can wander off it, so a car cannot drift into water', () => {
  for (const seed of SEEDS) {
    const tr = createTrack(seed);
    for (let d = 0; d < LEN; d += 20) {
      const [a, b] = tr.at(d).strips;
      if (a.surf === b.surf) continue;
      const gap = Math.max(a.l, b.l) - Math.min(a.r, b.r);
      assert.ok(gap > T.shoulder + T.grassDepth + 10, `seed ${seed} d ${d}: water and road only ${gap}px apart`);
    }
  }
});

test('every river has a boathouse to enter and a dock to leave', () => {
  for (const seed of SEEDS) {
    const tr = createTrack(seed);
    tr.at(LEN);
    const houses = tr.featuresIn(0, LEN).filter(x => x.type === 'boathouse');
    const docks = tr.featuresIn(0, LEN + 10000).filter(x => x.type === 'dock'); // the last river may end past LEN
    assert.ok(houses.length >= 1, `seed ${seed}: no river in ${LEN}px`);
    assert.ok(docks.length >= houses.length);
    houses.forEach((h, i) => {
      assert.ok(h.d < docks[i].d);
      assert.equal(tr.at(h.d - 5).strips[h.strip].surf, 'road');
      assert.equal(tr.at(h.d + 5).strips[h.strip].surf, 'water');
      assert.equal(tr.at(docks[i].d - 5).strips[h.strip].surf, 'water');
      assert.equal(tr.at(docks[i].d + 5).strips[h.strip].surf, 'road');
    });
  }
});
