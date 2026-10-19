import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudioController } from '../packages/audio-engine/src/index.js';
import { calculateActiveDuration, calculateMetrics, createSession, isValidPerformance } from '../packages/practice-domain/src/index.js';
import { exerciseIds } from '../packages/exercises/src/index.js';
import { recommend } from '../packages/recommendations/src/index.js';
import { createStorage } from '../packages/persistence/src/index.js';

test('active duration excludes time spent paused and rejects reversed intervals', () => {
  assert.equal(calculateActiveDuration(0, 10_000, [{ startedAt: 2_000, endedAt: 5_000 }]), 7);
  assert.equal(calculateActiveDuration(0, 10_000, [{ startedAt: -2_000, endedAt: 12_000 }]), 0);
  assert.throws(() => calculateActiveDuration(10, 0), /endedAt/);
});

test('audio controller pauses, resumes, and cleans up mocked resources', async () => {
  const calls = [];
  const track = { stop: () => calls.push('track.stop') };
  const stream = { getTracks: () => [track] };
  const context = {
    sampleRate: 44100, destination: {},
    createMediaStreamSource: () => ({ connect: () => {}, disconnect: () => calls.push('source.disconnect') }),
    createGain: () => ({ gain: { value: 1 }, connect: () => {}, disconnect: () => calls.push('gain.disconnect') }),
    suspend: () => calls.push('suspend'), resume: () => calls.push('resume'), close: () => calls.push('close'),
  };
  const controller = createAudioController({ AudioContext: class { constructor() { return context; } }, getUserMedia: async () => stream });
  assert.equal((await controller.start()).ok, true);
  controller.pause(); controller.resume(); controller.stop();
  assert.deepEqual(calls, ['suspend', 'resume', 'track.stop', 'source.disconnect', 'gain.disconnect', 'close']);
  assert.equal(controller.stopped, true);
});

test('audio controller maps permission errors and invokes error callback', async () => {
  let callback;
  const controller = createAudioController({ AudioContext: class {}, getUserMedia: async () => { throw Object.assign(new Error('no'), { name: 'NotAllowedError' }); }, onError: (_, code) => { callback = code; } });
  const result = await controller.start();
  assert.equal(result.error, 'microphone-permission-denied');
  assert.equal(callback, 'microphone-permission-denied');
});


test('real observations flow through metrics into a validated session', () => {
  const observations = [
    { voiced: true, clipped: false, confidence: .9, frequencyHz: 260, centsError: -10 },
    { voiced: true, clipped: false, confidence: .8, frequencyHz: 262, centsError: 5 },
    { voiced: false, clipped: false, confidence: .1, frequencyHz: null, centsError: null },
  ];
  const metrics = calculateMetrics(observations);
  const session = createSession({ id: 'phase2', exerciseId: 'sa-sustain', startedAt: '2026-01-01T00:00:00Z', metrics, durationSeconds: 2 });
  assert.equal(session.metrics.reliableFrameCount, 2);
  assert.equal(isValidPerformance(metrics), true);
});

test('insufficient audio is not a valid performance and recommendations stay canonical', () => {
  const metrics = calculateMetrics([{ voiced: false, clipped: false, confidence: .1, frequencyHz: null, centsError: null }]);
  assert.equal(isValidPerformance(metrics), false);
  assert.equal(recommend({ metrics }).exerciseId, 'sa-sustain');
  for (const result of [recommend({ metrics }), recommend({ metrics: { reliableFrameCount: 1, reliablePitchMatchPercent: 100, medianAbsoluteCents: 80 } })]) assert.ok(exerciseIds.includes(result.exerciseId));
});

test('persistence exposes warning outcomes when storage is unavailable', () => {
  const store = createStorage({ getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => { throw new Error('read-only'); } });
  assert.deepEqual(store.set('session', { id: 'phase2' }), { ok: false, value: null, error: 'storage_unavailable' });
  assert.equal(store.remove('session'), false);
});
