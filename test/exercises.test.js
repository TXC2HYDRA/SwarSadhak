import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSequence, exercises, getExercise } from '../packages/exercises/src/index.js';
test('exercise definitions are data-driven and addressable', () => { assert.ok(exercises.length >= 3); assert.equal(getExercise('ascending-sargam').targetNotes.length, 8); assert.equal(getExercise('missing'), null); });
test('sequence evaluation ignores invalid frames and applies exercise tolerance', () => { const exercise = getExercise('sa-re-ga-ma'); const target = (note) => 261.63 * 2 ** ({ Sa: 0, Re: 2, Ga: 4, Ma: 5 }[note] / 12); const result = evaluateSequence(exercise.targetNotes.map((note) => ({ voiced: true, frequencyHz: target(note) })), exercise, target, (a, b) => 1200 * Math.log2(a / b)); assert.equal(result.completed, true); assert.equal(evaluateSequence([{ voiced: false }], exercise, () => 261.63, () => 0).completed, false); });
