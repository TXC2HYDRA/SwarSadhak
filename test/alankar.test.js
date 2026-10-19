import test from 'node:test';
import assert from 'node:assert/strict';
import { ALANKARS, alankarDisplayGroups, alankarGroups, getAlankar } from '../packages/exercises/src/index.js';
import { advanceElapsed, createAlankarTimeline, getAlankarBeatAt, normalizeLoopCount } from '../packages/practice-domain/src/index.js';

test('Alankar catalogue contains exactly four patterns with preserved groups', () => {
  assert.equal(ALANKARS.length, 4);
  assert.deepEqual(ALANKARS[0].aroha.slice(0, 3), [['Sa'], ['Re'], ['Ga']]);
  assert.deepEqual(ALANKARS[1].aroha.slice(0, 2), [['Sa', 'Sa'], ['Re', 'Re']]);
  assert.deepEqual(ALANKARS[2].aroha.slice(0, 3), [['Sa', 'Re'], ['Re', 'Ga'], ['Ga', 'Ma']]);
  assert.deepEqual(ALANKARS[3].aroha.slice(0, 2), [['Sa', 'Re', 'Ga'], ['Re', 'Ga', 'Ma']]);
  assert.deepEqual(ALANKARS[2].avaroha.slice(0, 2), [['Sa', 'Ni'], ['Ni', 'Dha']]);
  assert.deepEqual(ALANKARS[3].avaroha.slice(-1), [['Ga', 'Re', 'Sa']]);
  assert.deepEqual(alankarGroups(getAlankar('alankar-1'), 'avaroha')[0], ['Sa']);
  assert.equal(getAlankar('missing'), null);
});

test('Alankar timeline counts in once, accents every 4/4 bar, and caps loops', () => {
  assert.equal(normalizeLoopCount(99), 10);
  const timeline = createAlankarTimeline({ groups: [['Sa'], ['Re']], bpm: 120, loops: 99 });
  assert.equal(timeline.countInBeats, 4);
  assert.equal(timeline.practiceBeats, 80);
  assert.equal(timeline.totalBeats, 84);
  assert.equal(timeline.countIn[0].accent, true);
  assert.equal(timeline.countIn[1].accent, false);
  assert.equal(timeline.practice[0].accent, true);
  assert.equal(timeline.practice[4].accent, true);
  assert.deepEqual(timeline.practice.slice(0, 4).map(({ swara, isSustain }) => [swara, isSustain]), [['Sa', false], ['Sa', true], ['Sa', true], ['Sa', true]]);
  assert.deepEqual(createAlankarTimeline({ groups: [['Sa', 'Re']] }).practice.slice(0, 4).map(({ swara, isSustain }) => [swara, isSustain]), [['Sa', false], ['Sa', true], ['Re', false], ['Re', true]]);
  assert.deepEqual(createAlankarTimeline({ groups: [['Sa', 'Re', 'Ga']] }).practice.slice(0, 4).map(({ swara, isSustain }) => [swara, isSustain]), [['Sa', false], ['Re', false], ['Ga', false], ['Ga', true]]);
  assert.equal(getAlankarBeatAt(0, timeline).phase, 'count-in');
  assert.equal(getAlankarBeatAt(2000, timeline).phase, 'practice');
  assert.equal(getAlankarBeatAt(2000, timeline).loopIndex, 0);
  assert.equal(getAlankarBeatAt(2000 + timeline.beatDurationMs * 8, timeline).loopIndex, 1);
  assert.equal(getAlankarBeatAt(timeline.beatDurationMs * timeline.totalBeats, timeline).phase, 'complete');
});

test('octave metadata marks only the expected Sa boundaries', () => {
  const aroha = alankarDisplayGroups(ALANKARS[0], 'aaroha').flat();
  const avaroha = alankarDisplayGroups(ALANKARS[0], 'avaroha').flat();
  assert.equal(aroha.at(0).octave, 'middle');
  assert.equal(aroha.at(-1).octave, 'higher');
  assert.equal(avaroha.at(0).octave, 'higher');
  assert.equal(avaroha.at(-1).octave, 'lower');
  assert.ok(aroha.slice(1, -1).every(({ octave }) => octave === 'middle'));
  assert.ok(avaroha.slice(1, -1).every(({ octave }) => octave === 'middle'));

  const repeatedAroha = alankarDisplayGroups(ALANKARS[1], 'aaroha');
  const repeatedAvaroha = alankarDisplayGroups(ALANKARS[1], 'avaroha');
  assert.deepEqual(repeatedAroha.at(-1).map(({ octave }) => octave), ['higher', 'higher']);
  assert.deepEqual(repeatedAvaroha[0].map(({ octave }) => octave), ['higher', 'higher']);
  assert.deepEqual(repeatedAvaroha.at(-1).map(({ octave }) => octave), ['lower', 'lower']);
});

test('elapsed BPM timing accumulates each timer segment only once', () => {
  let elapsed = 0;
  let startedAt = 0;
  for (let now = 40; now <= 400; now += 40) {
    elapsed = advanceElapsed(elapsed, startedAt, now);
    startedAt = now;
  }
  assert.equal(elapsed, 400);
});
