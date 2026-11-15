import test from 'node:test';
import assert from 'node:assert/strict';
import { assessPracticeEvidence, createPracticeSession, PRACTICE_EVIDENCE_POLICY } from '../apps/web/src/practiceSession.js';
import { calculateMetrics } from '../packages/practice-domain/src/index.js';

const goodFrame = { voiced: true, valid: true, clipped: false, confidence: 0.95, frequencyHz: 220 };
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
function setup(options = {}) {
  let time = 0, wall = Date.parse('2026-10-21T10:00:00Z');
  const audio = [], updates = [], completed = [];
  const session = createPracticeSession({
    tonic: 220, exerciseId: 'sa-sustain', now: () => time, wallNow: () => wall,
    onChange: (snapshot) => updates.push(snapshot), onComplete: (payload) => completed.push(payload),
    createAudio: (callbacks) => {
      const instance = { callbacks, starts: 0, pauses: 0, resumes: 0, stops: 0,
        async start() { instance.starts += 1; return { ok: true }; },
        async pause() { instance.pauses += 1; return { ok: true }; },
        async resume() { instance.resumes += 1; return { ok: true }; },
        stop() { instance.stops += 1; },
      };
      audio.push(instance); return instance;
    }, ...options,
  });
  return { session, audio, updates, completed,
    advance(ms) { time += ms; wall += ms; },
    frame(frame = goodFrame) { audio.at(-1).callbacks.onFrame(frame); },
    enough() { for (let i = 0; i < 21; i++) { if (i) { time += 50; wall += 50; } audio.at(-1).callbacks.onFrame(goodFrame); } },
  };
}

test('session start is synchronously guarded and records actual wall start after permission', async () => {
  const gate = deferred();
  // The factory runs synchronously; the first start must remain pending.
  let callbacks, starts = 0;
  const session = createPracticeSession({ tonic: 220, exerciseId: 'sa-sustain', now: () => 100, wallNow: () => Date.parse('2026-10-21T10:01:00Z'),
    createAudio: (value) => { callbacks = value; return { start: () => { starts++; return gate.promise; }, stop() {} }; } });
  const first = session.start(), second = session.start();
  assert.equal(first, second); assert.equal(starts, 1); assert.equal(session.snapshot.phase, 'requesting');
  callbacks.onFrame(goodFrame); assert.equal(session.snapshot.observation, null);
  gate.resolve({ ok: true }); await first;
  assert.equal(session.snapshot.phase, 'running'); assert.equal(session.snapshot.elapsedMs, 0);
  assert.equal(session.snapshot.startedAt, '2026-10-21T10:01:00.000Z');
  session.dispose();
});

test('permission denial is explicit and permits a fresh retry', async () => {
  let attempts = 0, stops = 0;
  const session = createPracticeSession({ tonic: 220, exerciseId: 'sa-sustain', createAudio: () => ({
    async start() { attempts++; return attempts === 1 ? { ok: false, error: 'microphone-permission-denied' } : { ok: true }; },
    stop() { stops++; },
  }) });
  await session.start(); assert.equal(session.snapshot.phase, 'error'); assert.equal(session.snapshot.error, 'microphone-permission-denied');
  assert.equal(stops, 1);
  await session.start(); assert.equal(session.snapshot.phase, 'running'); assert.equal(session.snapshot.error, null);
  session.dispose();
});

test('silence and a short reliable burst complete without persistence', async () => {
  for (const mode of ['silence', 'one-frame', 'short-burst']) {
    const fixture = setup(); await fixture.session.start();
    if (mode === 'silence') { fixture.advance(2000); fixture.frame({ voiced: false, confidence: 0, frequencyHz: null }); }
    else if (mode === 'one-frame') { fixture.advance(2000); fixture.frame(); }
    else { for (let i = 0; i < 40; i++) { fixture.advance(10); fixture.frame(); } }
    fixture.session.finish();
    assert.equal(fixture.session.snapshot.phase, 'completed'); assert.equal(fixture.session.snapshot.outcome, 'insufficient-audio', mode);
    assert.equal(fixture.completed.length, 0); assert.equal(fixture.session.snapshot.observation, null);
  }
});

test('evidence requires 20 reliable distinct active timestamps spanning one second', () => {
  assert.equal(PRACTICE_EVIDENCE_POLICY.minReliableFrames, 20);
  assert.equal(PRACTICE_EVIDENCE_POLICY.minReliableSpanMs, 1000);
  const observations = Array.from({ length: 20 }, (_, index) => ({ ...goodFrame, centsError: 0, timestamp: index * 1000 / 19 }));
  const metrics = calculateMetrics(observations, PRACTICE_EVIDENCE_POLICY);
  assert.equal(assessPracticeEvidence(metrics).sufficient, false);
  assert.equal(assessPracticeEvidence(null).sufficient, false);
  assert.equal(assessPracticeEvidence(metrics, observations).sufficient, true);
  assert.equal(assessPracticeEvidence(metrics, observations.map((frame) => ({ ...frame, timestamp: 0 }))).sufficient, false);
  assert.equal(assessPracticeEvidence(metrics, observations.toReversed()).sufficient, false);
  assert.equal(assessPracticeEvidence(metrics, observations.map((frame) => ({ ...frame, timestamp: undefined }))).sufficient, false);
  assert.equal(assessPracticeEvidence(metrics, observations.map((frame) => ({ ...frame, clipped: true }))).sufficient, false);
  assert.equal(assessPracticeEvidence(metrics, observations.map((frame) => ({ ...frame, confidence: .1 }))).sufficient, false);
});

test('enough audio completes once and emits only derived summary data', async () => {
  const fixture = setup(); await fixture.session.start(); fixture.enough();
  fixture.frame({ ...goodFrame, audio: new Float32Array(100), rawAudio: 'private', samples: [1, 2, 3] });
  assert.equal('audio' in fixture.session.snapshot.observation, false);
  assert.equal('rawAudio' in fixture.session.snapshot.observation, false);
  assert.equal('samples' in fixture.session.snapshot.observation, false);
  fixture.session.finish(); fixture.session.finish(); fixture.session.tick();
  assert.equal(fixture.completed.length, 1); assert.equal(fixture.audio[0].stops, 1);
  const payload = fixture.completed[0];
  assert.equal(payload.durationSeconds, 1); assert.equal(payload.metrics.reliableFrameCount, 22);
  assert.equal(payload.metrics.reliablePitchMatchPercent, 100); assert.equal(payload.completion.completed, true);
  assert.equal(payload.startedAt, '2026-10-21T10:00:00.000Z');
  assert.equal(payload.endedAt, '2026-10-21T10:00:01.000Z');
  assert.equal(assessPracticeEvidence(payload.metrics).sufficient, true);
  assert.equal('observations' in payload, false);
});

test('pause and async resume exclude inactive time and ignore queued audio', async () => {
  const fixture = setup(); await fixture.session.start(); fixture.advance(500); fixture.frame();
  const pauseGate = deferred(); fixture.audio[0].pause = () => pauseGate.promise;
  const pausing = fixture.session.pause();
  assert.equal(fixture.session.snapshot.phase, 'requesting'); assert.equal(fixture.session.snapshot.observation, null);
  fixture.advance(200); fixture.frame(); pauseGate.resolve({ ok: true }); await pausing;
  fixture.advance(10_000); fixture.frame(); fixture.session.tick();
  assert.equal(fixture.session.snapshot.elapsedMs, 500); assert.equal(fixture.session.snapshot.observation, null);
  const resumeGate = deferred(); fixture.audio[0].resume = () => resumeGate.promise;
  const resuming = fixture.session.resume(); fixture.advance(300); fixture.frame(); resumeGate.resolve({ ok: true }); await resuming;
  fixture.enough(); fixture.session.finish();
  assert.equal(fixture.completed.length, 1); assert.equal(fixture.completed[0].durationSeconds, 1.5);
  assert.equal(fixture.completed[0].metrics.totalFrameCount, 22);
  assert.equal(fixture.completed[0].startedAt, '2026-10-21T10:00:00.000Z');
  assert.equal(fixture.completed[0].endedAt, '2026-10-21T10:00:12.000Z');
});

test('a long pause does not turn a short reliable burst into sufficient evidence', async () => {
  const fixture = setup(); await fixture.session.start();
  for (let i = 0; i < 10; i++) { fixture.advance(10); fixture.frame(); }
  await fixture.session.pause(); fixture.advance(60_000); await fixture.session.resume();
  for (let i = 0; i < 10; i++) { fixture.advance(10); fixture.frame(); }
  fixture.session.finish(); assert.equal(fixture.completed.length, 0);
  assert.equal(fixture.session.snapshot.evidence.reliableSpanMs, 190);
});

test('resume failure becomes an explicit error and releases audio', async () => {
  for (const rejects of [false, true]) {
    const fixture = setup(); await fixture.session.start(); await fixture.session.pause();
    fixture.audio[0].resume = async () => { if (rejects) throw new Error('interrupted'); return { ok: false, error: 'audio-resume-failed' }; };
    await fixture.session.resume();
    assert.equal(fixture.session.snapshot.phase, 'error'); assert.equal(fixture.session.snapshot.error, 'audio-resume-failed');
    assert.equal(fixture.audio[0].stops, 1); assert.equal(fixture.completed.length, 0);
  }
});

test('restart resets observations and timing and rejects old callbacks', async () => {
  const fixture = setup(); await fixture.session.start(); fixture.enough(); fixture.session.finish();
  const oldCallbacks = fixture.audio[0].callbacks;
  fixture.advance(3000); await fixture.session.start();
  assert.equal(fixture.session.snapshot.elapsedMs, 0); assert.equal(fixture.session.snapshot.metrics, null);
  oldCallbacks.onFrame(goodFrame); oldCallbacks.onError(new Error('old'), 'audio-unavailable');
  assert.equal(fixture.session.snapshot.phase, 'running'); assert.equal(fixture.session.snapshot.observation, null);
  fixture.session.finish();
  assert.equal(fixture.completed.length, 1); assert.equal(fixture.session.snapshot.metrics.totalFrameCount, 0);
  assert.equal(fixture.session.snapshot.outcome, 'insufficient-audio');
});

test('tick clamps configured active duration and automatically finishes once', async () => {
  const fixture = setup({ durationMs: 1500 }); await fixture.session.start(); fixture.enough();
  fixture.advance(2000); fixture.session.tick(); fixture.session.tick(); fixture.session.finish();
  assert.equal(fixture.session.snapshot.elapsedMs, 1500); assert.equal(fixture.completed.length, 1);
  assert.equal(fixture.completed[0].durationSeconds, 1.5); assert.equal(fixture.completed[0].completion.reason, 'duration-complete');
  assert.equal(fixture.audio[0].stops, 1);
});

test('count-in is ignored, target metadata is derived, and octave changes alter comparison', async () => {
  const seenTimes = [];
  const fixture = setup({ durationMs: 4000, countInMs: 2000, exerciseId: 'sa-re-ga',
    targetAt: (elapsed) => { seenTimes.push(elapsed); return elapsed < 2000 ? null : { swara: 'Sa', octave: 1, groupIndex: 2, loopIndex: 0, isSustain: true }; },
    completion: { alankarId: 'sample', direction: 'ascending', bpm: 120, loops: 1, reason: 'manual' },
  });
  await fixture.session.start(); fixture.frame(); fixture.advance(1500); fixture.frame();
  assert.equal(fixture.session.snapshot.observation, null);
  fixture.advance(500); fixture.frame({ ...goodFrame, frequencyHz: 440 });
  assert.equal(fixture.session.snapshot.observation.targetFrequencyHz, 440);
  assert.equal(fixture.session.snapshot.observation.centsError, 0);
  assert.equal(fixture.session.snapshot.observation.groupIndex, 2);
  fixture.frame(); assert.equal(fixture.session.snapshot.observation.centsError, -1200);
  for (let i = 0; i < 20; i++) { fixture.advance(50); fixture.frame({ ...goodFrame, frequencyHz: 440 }); }
  fixture.session.finish();
  assert.equal(fixture.completed.length, 1); assert.equal(fixture.completed[0].durationSeconds, 1);
  assert.equal(fixture.completed[0].metrics.reliablePitchMatchPercent, 95);
  assert.deepEqual(fixture.completed[0].completion, { alankarId: 'sample', direction: 'ascending', bpm: 120, loops: 1, reason: 'manual', completed: true });
  assert.ok(seenTimes.every((time) => time >= 2000));
});

test('null timeline target skips observations even after count-in', async () => {
  const fixture = setup({ targetAt: () => null }); await fixture.session.start(); fixture.enough(); fixture.session.finish();
  assert.equal(fixture.session.snapshot.metrics.totalFrameCount, 0); assert.equal(fixture.completed.length, 0);
});

test('disposal invalidates pending start, stops audio and silences callbacks', async () => {
  const gate = deferred(); let callbacks, stopped = 0, changed = 0, completed = 0;
  const session = createPracticeSession({ tonic: 220, exerciseId: 'sa-sustain',
    onChange: () => changed++, onComplete: () => completed++,
    createAudio: (value) => { callbacks = value; return { start: () => gate.promise, stop: () => stopped++ }; },
  });
  const start = session.start(); session.dispose(); const before = changed;
  callbacks.onFrame(goodFrame); callbacks.onError(new Error('late'), 'audio-unavailable');
  gate.resolve({ ok: true }); await start; await session.start(); session.finish(); session.tick(); session.dispose();
  assert.equal(session.snapshot.phase, 'idle'); assert.equal(session.snapshot.observation, null);
  assert.equal(stopped, 1); assert.equal(changed, before); assert.equal(completed, 0);
});

test('finish during pending permission is idempotent and ignores late start', async () => {
  const gate = deferred(); let stopped = 0;
  const session = createPracticeSession({ tonic: 220, exerciseId: 'sa-sustain', createAudio: () => ({ start: () => gate.promise, stop: () => stopped++ }) });
  const start = session.start(); session.finish(); session.finish(); gate.resolve({ ok: true }); await start;
  assert.equal(stopped, 1); assert.equal(session.snapshot.phase, 'completed'); assert.equal(session.snapshot.outcome, 'insufficient-audio');
});

test('active clock regressions do not decrease elapsed time or manufacture evidence', async () => {
  const fixture = setup(); await fixture.session.start(); fixture.advance(100); fixture.frame();
  fixture.advance(-50); fixture.frame(); assert.equal(fixture.session.snapshot.elapsedMs, 100);
  fixture.session.finish(); assert.equal(fixture.session.snapshot.evidence.timedReliableFrameCount, 1);
});

test('async consumer and cleanup failures do not leave unhandled rejections', async () => {
  const fixture = setup({ onChange: async () => { throw new Error('render'); }, onComplete: async () => { throw new Error('persist'); } });
  await fixture.session.start(); fixture.enough(); fixture.audio[0].stop = () => Promise.reject(new Error('stop'));
  fixture.session.finish(); await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fixture.session.snapshot.phase, 'completed');
});

test('disposal during resume ignores its settlement and a pending duplicate is coalesced', async () => {
  const fixture = setup(); await fixture.session.start(); await fixture.session.pause();
  const gate = deferred(); let resumes = 0;
  fixture.audio[0].resume = () => { resumes++; return gate.promise; };
  const resume = fixture.session.resume(); assert.equal(fixture.session.resume(), resume);
  fixture.session.dispose(); const updates = fixture.updates.length;
  gate.resolve({ ok: true }); await resume;
  assert.equal(resumes, 1); assert.equal(fixture.audio[0].stops, 1);
  assert.equal(fixture.session.snapshot.phase, 'idle'); assert.equal(fixture.updates.length, updates);
});

test('runtime audio error clears observation and freezes active time until retry', async () => {
  const fixture = setup(); await fixture.session.start(); fixture.advance(500); fixture.frame();
  fixture.audio[0].callbacks.onError(new Error('lost input'), 'audio-processing-failed');
  fixture.advance(5000); fixture.frame(); fixture.session.tick();
  assert.equal(fixture.session.snapshot.phase, 'error'); assert.equal(fixture.session.snapshot.observation, null);
  assert.equal(fixture.session.snapshot.elapsedMs, 500); assert.equal(fixture.audio[0].stops, 1);
  await fixture.session.start(); fixture.enough(); fixture.session.finish();
  assert.equal(fixture.completed.length, 1); assert.equal(fixture.completed[0].metrics.totalFrameCount, 21);
  assert.equal(fixture.completed[0].startedAt, '2026-10-21T10:00:05.500Z');
});
