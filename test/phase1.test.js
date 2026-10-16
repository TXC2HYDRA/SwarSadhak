import test from 'node:test';
import assert from 'node:assert/strict';
import { estimatePitch } from '../packages/audio-engine/src/index.js';
import { frequencyToNote, frameToObservation } from '../packages/musical-core/src/index.js';
import { exerciseIds, getExercise, validateExerciseId } from '../packages/exercises/src/index.js';

test('autocorrelation estimates a voiced sine and rejects invalid input', () => {
  const samples = Float64Array.from({ length: 4096 }, (_, i) => Math.sin(2 * Math.PI * 440 * i / 44100));
  const result = estimatePitch(samples, 44100);
  assert.ok(Math.abs(result.frequencyHz - 440) < 3);
  assert.equal(result.voiced, true);
  assert.equal(estimatePitch([0, Number.NaN, 1], 44100).valid, false);
});

test('tonic-relative conversion reports swara and cents classification', () => {
  const note = frequencyToNote(240, 240);
  assert.equal(note.swara, 'Sa');
  assert.equal(note.classification, 'in-tune');
  assert.equal(frameToObservation({ frequencyHz: 240, voiced: true }, 240).centsError, 0);
});

test('canonical exercise IDs are available and validated', () => {
  assert.deepEqual(exerciseIds, ['sa-sustain', 'pitch-match', 'sa-re-ga', 'ascending-sargam']);
  assert.equal(getExercise('sa-re-ga').notes[2], 'Ga');
  assert.equal(validateExerciseId('unknown'), false);
});

test('pitch detector rejects silence, clipping, and low confidence', () => {
  assert.equal(estimatePitch(new Float64Array(2048), 44100).reason, 'silence');
  assert.equal(estimatePitch(Float64Array.from({ length: 2048 }, (_, i) => i % 2 ? 1 : -1), 44100).reason, 'clipping');
  const quiet = Float64Array.from({ length: 2048 }, (_, i) => 0.000001 * Math.sin(i));
  assert.equal(estimatePitch(quiet, 44100).reason, 'silence');
});

test('frame adapter preserves invalid frames without inventing cents', () => {
  const observation = frameToObservation({ frequencyHz: null, voiced: false, reason: 'silence' }, 261.63);
  assert.equal(observation.centsError, null);
  assert.equal(observation.voiced, false);
});
