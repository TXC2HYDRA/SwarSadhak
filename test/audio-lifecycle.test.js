import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudioController } from '../packages/audio-engine/src/index.js';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
function setup(overrides = {}) {
  const calls = [];
  const node = (name) => ({ connect() { calls.push(`${name}.connect`); }, disconnect() { calls.push(`${name}.disconnect`); } });
  const processor = node('processor'), source = node('source'), gain = { ...node('gain'), gain: { value: 1 } };
  const track = { stop() { calls.push('track.stop'); } }, stream = { getTracks: () => [track] };
  const context = {
    state: 'running', sampleRate: 8000, destination: {},
    createMediaStreamSource: () => source, createGain: () => gain, createScriptProcessor: () => processor,
    suspend() { calls.push('suspend'); context.state = 'suspended'; return Promise.resolve(); },
    resume() { calls.push('resume'); context.state = 'running'; return Promise.resolve(); },
    close() { calls.push('close'); context.state = 'closed'; return Promise.resolve(); },
  };
  let requests = 0, contexts = 0;
  const frames = [], errors = [];
  const controller = createAudioController({
    AudioContext: class { constructor() { contexts += 1; return context; } },
    getUserMedia() { requests += 1; return Promise.resolve(stream); },
    onFrame: (frame) => frames.push(frame), onError: (_cause, code) => errors.push(code), ...overrides,
  });
  const event = { inputBuffer: { getChannelData: () => new Float32Array(2048) } };
  return { controller, context, source, gain, processor, stream, track, event, calls, frames, errors, counts: () => ({ requests, contexts }) };
}

test('duplicate pending audio starts share one request and context', async () => {
  const media = deferred(); let requests = 0;
  const fixture = setup({ getUserMedia: () => { requests += 1; return media.promise; } });
  const first = fixture.controller.start(), second = fixture.controller.start();
  assert.equal(first, second); assert.equal(requests, 1); assert.equal(fixture.counts().contexts, 1);
  media.resolve(fixture.stream);
  assert.equal((await first).ok, true);
  assert.equal((await fixture.controller.start()).error, 'audio-already-started');
  await fixture.controller.stop();
});

test('stop during permission request closes context and stops a late stream', async () => {
  const media = deferred(); const fixture = setup({ getUserMedia: () => media.promise });
  const start = fixture.controller.start();
  await fixture.controller.stop();
  assert.equal(fixture.calls.filter((call) => call === 'close').length, 1);
  media.resolve(fixture.stream);
  assert.equal((await start).error, 'audio-cancelled');
  assert.equal(fixture.calls.filter((call) => call === 'track.stop').length, 1);
  assert.equal(fixture.processor.onaudioprocess, undefined);
  assert.equal(fixture.controller.state, 'stopped');
});

test('a late cancelled stream cannot stop a restarted audio attempt', async () => {
  const media = deferred(); let requests = 0, oldStops = 0, newStops = 0;
  const oldStream = { getTracks: () => [{ stop: () => oldStops++ }] };
  const newStream = { getTracks: () => [{ stop: () => newStops++ }] };
  const fixture = setup({ getUserMedia: () => ++requests === 1 ? media.promise : Promise.resolve(newStream) });
  const first = fixture.controller.start();
  await fixture.controller.stop();
  fixture.context.state = 'running';
  assert.equal((await fixture.controller.start()).ok, true);
  media.resolve(oldStream);
  assert.equal((await first).error, 'audio-cancelled');
  assert.equal(oldStops, 1); assert.equal(newStops, 0); assert.equal(fixture.controller.state, 'running');
  await fixture.controller.stop(); assert.equal(newStops, 1);
});

test('pause blocks queued frames immediately and resume waits for the context', async () => {
  const fixture = setup(); await fixture.controller.start();
  const queuedFrame = fixture.processor.onaudioprocess;
  queuedFrame(fixture.event); assert.equal(fixture.frames.length, 1);
  const suspend = deferred(); fixture.context.suspend = () => suspend.promise;
  const pause = fixture.controller.pause();
  queuedFrame(fixture.event); assert.equal(fixture.frames.length, 1);
  suspend.resolve(); await pause;
  queuedFrame(fixture.event); assert.equal(fixture.frames.length, 1);
  const resume = deferred(); fixture.context.resume = () => resume.promise;
  const resuming = fixture.controller.resume();
  queuedFrame(fixture.event); assert.equal(fixture.frames.length, 1);
  resume.resolve(); assert.equal((await resuming).ok, true);
  queuedFrame(fixture.event); assert.equal(fixture.frames.length, 2);
  await fixture.controller.stop();
  queuedFrame(fixture.event); assert.equal(fixture.frames.length, 2);
});

test('permission rejection reports its code and releases the early context', async () => {
  const fixture = setup({ getUserMedia: async () => { throw Object.assign(new Error('Denied'), { name: 'NotAllowedError' }); } });
  assert.equal((await fixture.controller.start()).error, 'microphone-permission-denied');
  assert.deepEqual(fixture.errors, ['microphone-permission-denied']);
  assert.ok(fixture.calls.includes('close')); assert.equal(fixture.controller.stopped, true);
});

test('missing processor is an explicit failure, never a running microphone', async () => {
  const fixture = setup(); fixture.context.createScriptProcessor = undefined;
  assert.equal((await fixture.controller.start()).error, 'audio-analysis-unavailable');
  assert.ok(fixture.calls.includes('track.stop')); assert.ok(fixture.calls.includes('close'));
  assert.equal(fixture.controller.state, 'error');
});

test('resume rejection is explicit and releases every resource', async () => {
  const fixture = setup(); await fixture.controller.start(); await fixture.controller.pause();
  fixture.context.resume = async () => { throw new Error('Device gone'); };
  assert.equal((await fixture.controller.resume()).error, 'audio-resume-failed');
  assert.deepEqual(fixture.errors, ['audio-resume-failed']);
  for (const call of ['processor.disconnect', 'source.disconnect', 'gain.disconnect', 'track.stop', 'close']) assert.ok(fixture.calls.includes(call), call);
  assert.equal(fixture.processor.onaudioprocess, null);
});

test('stop absorbs independent disconnect, track and close failures', async () => {
  let secondTrackStopped = false;
  const fixture = setup(); await fixture.controller.start();
  fixture.processor.disconnect = () => { throw new Error('disconnect'); };
  fixture.stream.getTracks = () => [{ stop() { throw new Error('track'); } }, { stop() { secondTrackStopped = true; } }];
  fixture.context.close = () => Promise.reject(new Error('close'));
  await fixture.controller.stop(); await fixture.controller.stop();
  assert.equal(secondTrackStopped, true);
  assert.ok(fixture.calls.includes('source.disconnect')); assert.ok(fixture.calls.includes('gain.disconnect'));
});

test('processing errors and rejecting error listeners do not escape the lifecycle', async () => {
  const fixture = setup({ onError: async () => { throw new Error('listener'); } });
  await fixture.controller.start();
  fixture.processor.onaudioprocess({ inputBuffer: { getChannelData() { throw new Error('processor'); } } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fixture.controller.state, 'error');
  assert.ok(fixture.calls.includes('track.stop')); assert.ok(fixture.calls.includes('close'));
});

test('stop while resume is pending cannot restore running state', async () => {
  const fixture = setup(); await fixture.controller.start(); await fixture.controller.pause();
  const gate = deferred(); fixture.context.resume = () => gate.promise;
  const resume = fixture.controller.resume(); await fixture.controller.stop(); gate.resolve();
  assert.equal((await resume).error, 'audio-cancelled'); assert.equal(fixture.controller.state, 'stopped');
});

test('startup resume rejection cannot report a running analysis graph', async () => {
  const fixture = setup(); fixture.context.state = 'suspended';
  fixture.context.resume = async () => { throw new Error('resume denied'); };
  assert.equal((await fixture.controller.start()).error, 'audio-resume-failed');
  assert.equal(fixture.controller.state, 'error');
  assert.ok(fixture.calls.includes('track.stop')); assert.ok(fixture.calls.includes('processor.disconnect'));
});

test('conflicting pending audio transitions are explicit and duplicate pauses are coalesced', async () => {
  const fixture = setup(); await fixture.controller.start();
  const gate = deferred(); fixture.context.suspend = () => gate.promise;
  const pause = fixture.controller.pause(); assert.equal(fixture.controller.pause(), pause);
  assert.equal((await fixture.controller.resume()).error, 'audio-transition-pending');
  gate.resolve(); await pause; assert.equal(fixture.controller.state, 'paused');
  await fixture.controller.stop();
});
