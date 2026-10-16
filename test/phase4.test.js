import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient, syncState } from '../packages/api-client/src/index.js';

test('API client is disabled safely and never sends raw audio', async () => {
  const disabled = createApiClient({ baseUrl: '' });
  assert.equal((await disabled.practice.list()).error, 'backend_disabled');
  let body;
  const client = createApiClient({ baseUrl: 'http://api.test', fetchImpl: async (_url, options) => { body = JSON.parse(options.body); return new Response('{}', { status: 201 }); } });
  assert.equal((await client.practice.create({ id: 's1', audio: 'raw', rawAudio: [1], exercise_id: 'sa-sustain' })).ok, true);
  assert.equal('audio' in body, false); assert.equal('rawAudio' in body, false); assert.equal(syncState({ ok: false, offline: true }), 'local-only');
});
test('API client covers routine and assignment mutations', async () => {
  const calls = []; const client = createApiClient({ baseUrl: 'http://api.test', fetchImpl: async (url, options) => { calls.push([url, options.method]); return new Response('{}', { status: 200 }); } });
  await client.routines.update('r1', {}); await client.routines.remove('r1'); await client.assignments.update('a1', { status: 'completed' }); await client.assignments.remove('a1');
  assert.deepEqual(calls, [['http://api.test/api/routines/r1', 'PATCH'], ['http://api.test/api/routines/r1', 'DELETE'], ['http://api.test/api/assignments/a1', 'PATCH'], ['http://api.test/api/assignments/a1', 'DELETE']]);
});
test('coach explain sends verified summary metrics only', async () => {
  let payload;
  const client = createApiClient({ baseUrl: 'http://api.test', token: 'secret', fetchImpl: async (_url, options) => { payload = JSON.parse(options.body); return new Response(JSON.stringify({ messageKey: 'recommendations.stablePerformance', source: 'gemini' }), { status: 200 }); } });
  await client.coach.explain({ exerciseId: 'sa-sustain', metrics: { reliableFrameCount: 4, totalFrameCount: 5, medianAbsoluteCents: 2 }, quality: { raw: 'omit' }, recommendation: 'omit', audio: 'never' }, 'mr');
  assert.deepEqual(payload, { exerciseId: 'sa-sustain', locale: 'mr', metrics: { reliableFrameCount: 4, totalFrameCount: 5, medianAbsoluteCents: 2 } });
});
