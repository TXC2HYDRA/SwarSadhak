import test from 'node:test';
import assert from 'node:assert/strict';
import { TONIC_NOTES, TONICS } from '../apps/web/src/tonics.js';

test('tonic dropdown includes every requested chromatic note', () => {
  assert.deepEqual(TONIC_NOTES.map((note) => note.replace(/\d$/, '')), ['A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#']);
  assert.equal(TONICS.length, 12);
  assert.ok(TONICS.every((tonic) => Number.isFinite(tonic.value) && tonic.label.includes('Hz')));
});
