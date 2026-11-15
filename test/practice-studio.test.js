import test from 'node:test';
import assert from 'node:assert/strict';
import { ALANKARS } from '../packages/exercises/src/index.js';
import { getAlankarBeatAt } from '../packages/practice-domain/src/index.js';
import { alankarSetup, livePitch, octaveKey, octaveNumber } from '../apps/web/src/practiceSetup.js';
import { timeLabel } from '../apps/web/src/practiceSetup.js';

test('practice setup preserves timed Alankar groups and octave metadata', () => {
  const setup = alankarSetup(ALANKARS[0], { direction: 'aaroha', bpm: 120, loops: 2 });
  assert.equal(setup.timeline.countInBeats, 4);
  assert.equal(setup.timeline.loops, 2);
  assert.equal(setup.targetAt(0), null);
  const beat = getAlankarBeatAt(setup.countInMs + 7, setup.timeline);
  const target = setup.targetAt(setup.countInMs + 7);
  assert.equal(target.swara, beat.swara);
  assert.equal(target.octave, 0);
  const finalTarget = setup.targetAt(setup.durationMs - 1);
  assert.equal(finalTarget.octave, 1);
  assert.equal(octaveNumber('lower'), -1);
  assert.equal(octaveKey(1), 'highOctave');
});

test('live pitch feedback only reports a current real observation', () => {
  const target = { swara: 'Sa', octave: 0 };
  const valid = { timestamp: 1000, targetNote: 'Sa', octave: 0, frequencyHz: 261.63, centsError: 2, confidence: .9, voiced: true, clipped: false, valid: true };
  assert.equal(livePitch(valid, target, 1100).status, 'inTune');
  assert.equal(livePitch({ ...valid, timestamp: 0 }, target, 1100), null);
  assert.equal(livePitch({ ...valid, targetNote: 'Re' }, target, 1100), null);
  assert.equal(livePitch({ ...valid, centsError: -70 }, target, 1100).status, 'flat');
});

test('practice time labels are deterministic and pause-friendly', () => {
  assert.equal(timeLabel(0), '0:00');
  assert.equal(timeLabel(61_000), '1:01');
  assert.equal(timeLabel(125_000), '2:05');
});
