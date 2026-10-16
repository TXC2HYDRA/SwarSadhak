import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeAcoustics, medianAbsoluteDeviation } from '../packages/acoustic-analysis/src/index.js';
import { coach, deterministicCoach, validateCoachOutput } from '../packages/ai-coach/src/index.js';

test('acoustic analysis is pure, bounded, and deterministic', () => {
  const frames = Array.from({ length: 5000 }, (_, i) => ({ voiced: true, frequencyHz: 200 + i, centsError: i % 2 ? 10 : -10, confidence: 2 }));
  const result = summarizeAcoustics(frames);
  assert.equal(result.frameCount, 4096); assert.equal(result.reliableFrameCount, 4096); assert.equal(result.meanConfidence, 1);
  assert.equal(medianAbsoluteDeviation([1, 2, 3]), 1);
});

test('coach validates input and gives canonical deterministic localization keys', async () => {
  assert.throws(() => deterministicCoach({ exerciseId: 'unknown' }), /invalid exerciseId/);
  const result = await coach({ exerciseId: 'sa-sustain', frames: [] });
  assert.equal(result.messageKey, 'recommendations.noReliableAudio');
  assert.equal(result.provider, 'deterministic');
});

test('provider failures and malformed output safely fall back', async () => {
  const input = { exerciseId: 'sa-sustain', frames: [{ voiced: true, frequencyHz: 261.63, centsError: 0, confidence: 0.9 }] };
  const result = await coach(input, { provider: async () => ({ nope: true }) });
  assert.equal(result.provider, 'deterministic');
  assert.equal((await coach(input, { provider: async () => { throw new Error('down'); } })).messageKey, 'recommendations.stablePerformance');
});

test('rejects raw audio, unknown frame fields, and unbounded derived frames', () => {
  assert.throws(() => deterministicCoach({ exerciseId: 'sa-sustain', pcm: new Uint8Array(2) }), /raw audio/);
  assert.throws(() => deterministicCoach({ exerciseId: 'sa-sustain', frames: [{ voiced: true, frequencyHz: 261, samples: [] }] }), /unsupported/);
  assert.throws(() => deterministicCoach({ exerciseId: 'sa-sustain', frames: Array(4097).fill({ voiced: false }) }), /bounded/);
  assert.throws(() => deterministicCoach({ exerciseId: 'sa-sustain', frames: [{ voiced: true, frequencyHz: 20001 }] }), /bounds/);
});

test('strict provider output validates canonical keys, exercise, evidence, and confidence', async () => {
  const input = { exerciseId: 'sa-sustain', frames: [{ voiced: true, frequencyHz: 261, centsError: 2, confidence: 0.9 }] };
  for (const result of [
    { messageKey: 'not.a.translation' },
    { messageKey: 'recommendations.stablePerformance', nextExerciseId: 'unknown' },
    { messageKey: 'recommendations.stablePerformance', confidence: 'certain' },
    { messageKey: 'recommendations.stablePerformance', evidence: { metric: 'reliableFrameCount', value: 99 } },
    { messageKey: 'recommendations.stablePerformance', html: '<script>alert(1)</script>' },
  ]) assert.equal((await coach(input, { provider: async () => result })).provider, 'deterministic');
  assert.equal(validateCoachOutput({ messageKey: 'recommendations.stablePerformance' }, input), true);
});

test('provider timeout falls back and deterministic metrics cannot be replaced', async () => {
  const input = { exerciseId: 'sa-sustain', frames: [{ voiced: true, frequencyHz: 261, centsError: 2, confidence: 0.9 }] };
  const result = await coach(input, { timeoutMs: 5, provider: () => new Promise((resolve) => setTimeout(() => resolve({ messageKey: 'recommendations.stablePerformance' }), 50)) });
  assert.equal(result.provider, 'deterministic');
  const preserved = await coach(input, { provider: async () => ({ messageKey: 'recommendations.stablePerformance', metrics: { reliableFrameCount: 999 } }) });
  assert.equal(preserved.metrics.reliableFrameCount, 1);
});
