import test from 'node:test';
import assert from 'node:assert/strict';
import { estimatePitch } from '../packages/audio-engine/src/index.js';
test('estimates a clean sine pitch offline', () => { const rate = 8000; const samples = Float32Array.from({ length: 8000 }, (_, i) => Math.sin(2 * Math.PI * 440 * i / rate)); const result = estimatePitch(samples, rate); assert.ok(Math.abs(result.frequencyHz - 440) < 3); assert.equal(result.voiced, true); });
test('rejects silence with an explicit reason', () => { const result = estimatePitch(new Float32Array(1000), 8000); assert.equal(result.reason, 'silence'); assert.equal(result.frequencyHz, null); });
test('rejects non-finite and clipped input', () => { const invalid = new Float32Array(64); invalid[0] = Number.NaN; assert.equal(estimatePitch(invalid, 8000).reason, 'invalid_input'); const clipped = new Float32Array(1000).fill(1); assert.equal(estimatePitch(clipped, 8000).reason, 'clipping'); });
