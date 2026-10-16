import test from 'node:test';
import assert from 'node:assert/strict';
import { pitchAccuracy, createSession, validateSession, calculateMetrics } from '../packages/practice-domain/src/index.js';
import { recommend } from '../packages/recommendations/src/index.js';
import { createStorage } from '../packages/persistence/src/index.js';

test('metrics and session validation enforce finite, range, schema, and audio rules', () => {
  assert.equal(pitchAccuracy(0), 100);
  assert.throws(() => pitchAccuracy(Number.NaN), /finite/);
  const session = createSession({ id: 's1', exerciseId: 'sa-sustain', startedAt: '2026-01-01T00:00:00Z' });
  assert.equal(validateSession(session), true);
  assert.throws(() => validateSession({ ...session, schemaVersion: 99 }), /schema/);
  assert.throws(() => validateSession({ ...session, rawAudio: 'data' }), /audio/);
});

test('metrics gate invalid frames and recommendations include evidence', () => {
  const metrics = calculateMetrics([{ voiced: true, clipped: false, confidence: .9, frequencyHz: 261, centsError: 10 }, { voiced: true, clipped: false, confidence: .2, frequencyHz: 261, centsError: 2 }]);
  assert.equal(metrics.reliableFrameCount, 1);
  const result = recommend({ exerciseId: 'sa-sustain', metrics });
  assert.equal(result.evidence.metric, 'reliablePitchMatchPercent');
});

test('storage safely round-trips JSON without browser globals', () => {
  const store = createStorage(undefined);
  assert.equal(store.set('session', { id: 's1' }).ok, true);
  assert.deepEqual(store.get('session'), { id: 's1' });
  assert.deepEqual(store.get('bad', []), []);
});

test('storage failures return safe outcomes', () => {
  const failing = { getItem() { throw new Error('read'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('remove'); } };
  const store = createStorage(failing);
  assert.deepEqual(store.get('x', []), []);
  assert.equal(store.set('x', {}).ok, false);
  assert.equal(store.remove('x'), false);
});
