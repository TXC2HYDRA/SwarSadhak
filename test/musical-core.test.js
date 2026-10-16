import test from 'node:test';
import assert from 'node:assert/strict';
import { noteToMidi, midiToNote, noteToFrequency, centsBetween, evaluatePitch } from '../packages/musical-core/src/index.js';
test('converts notes and frequencies', () => { assert.equal(noteToMidi('A4'), 69); assert.equal(midiToNote(60), 'C4'); assert.equal(noteToFrequency('A4'), 440); });
test('evaluates cents and tolerance', () => { assert.equal(Math.round(centsBetween(445, 440)), 20); assert.equal(evaluatePitch(440, 440).status, 'in-tune'); assert.equal(evaluatePitch(null, 440).status, 'silent'); });
