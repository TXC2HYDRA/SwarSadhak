import { createAudioController } from '@swarsadhak/audio-engine';
import { centsBetween, targetFrequency } from '@swarsadhak/musical-core';
import { calculateMetrics } from '@swarsadhak/practice-domain';

export const PRACTICE_EVIDENCE_POLICY = Object.freeze({
  minReliableFrames: 20,
  minReliableSpanMs: 1000,
  confidenceThreshold: 0.55,
  minFrequencyHz: 50,
  maxFrequencyHz: 1200,
});

const reliable = (observation) => observation?.voiced === true && observation.valid !== false
  && observation.clipped !== true && Number.isFinite(observation.confidence)
  && observation.confidence >= PRACTICE_EVIDENCE_POLICY.confidenceThreshold
  && Number.isFinite(observation.frequencyHz) && observation.frequencyHz >= PRACTICE_EVIDENCE_POLICY.minFrequencyHz
  && observation.frequencyHz <= PRACTICE_EVIDENCE_POLICY.maxFrequencyHz && Number.isFinite(observation.centsError);

/** No timestamp evidence means insufficient audio, even when aggregate pitch looks good.
 * Repeated timestamps count once; reversed reliable timestamps invalidate evidence.
 * Metrics emitted by this controller retain the timestamp summary for save guards.
 */
export function assessPracticeEvidence(metrics = {}, observations) {
  metrics ??= {};
  let timedReliableFrameCount = metrics.timedReliableFrameCount ?? 0;
  let reliableSpanMs = metrics.reliableSpanMs ?? 0;
  let monotonic = metrics.reliableTimestampsMonotonic === true;
  if (Array.isArray(observations)) {
    timedReliableFrameCount = 0; reliableSpanMs = 0; monotonic = true;
    let first = null, previous = null;
    for (const observation of observations) {
      if (!reliable(observation)) continue;
      const timestamp = observation.timestamp;
      if (!Number.isFinite(timestamp) || timestamp < 0 || (previous !== null && timestamp < previous)) { monotonic = false; continue; }
      if (timestamp === previous) continue;
      first ??= timestamp; previous = timestamp;
      timedReliableFrameCount += 1; reliableSpanMs = timestamp - first;
    }
  }
  const sufficient = Number.isInteger(metrics.reliableFrameCount)
    && metrics.reliableFrameCount >= PRACTICE_EVIDENCE_POLICY.minReliableFrames
    && Number.isInteger(timedReliableFrameCount) && timedReliableFrameCount >= PRACTICE_EVIDENCE_POLICY.minReliableFrames
    && Number.isFinite(reliableSpanMs) && reliableSpanMs >= PRACTICE_EVIDENCE_POLICY.minReliableSpanMs && monotonic;
  return { sufficient, reason: sufficient ? null : 'insufficient-audio', reliableFrameCount: metrics.reliableFrameCount ?? 0,
    timedReliableFrameCount, reliableSpanMs, reliableTimestampsMonotonic: monotonic };
}

const notify = (callback, value) => {
  // Consumer callbacks may be async. Their failures must not leak rejected
  // promises or reopen a session that already finished.
  try { Promise.resolve(callback?.(value)).catch(() => {}); } catch {}
};

/** A UI-independent practice lifecycle. Clocks use milliseconds; durationMs
 * includes count-in, while payload.durationSeconds excludes it and pauses.
 * start/pause/resume resolve snapshots; finish/tick/dispose return snapshots.
 */
export function createPracticeSession({
  createAudio = createAudioController, now = () => performance.now(), wallNow = () => Date.now(),
  onChange, onComplete, targetAt = () => ({ swara: 'Sa' }), durationMs = Infinity, countInMs = 0,
  tonic, exerciseId, toleranceCents = 50, completion = {},
} = {}) {
  if (!(durationMs === Infinity || (Number.isFinite(durationMs) && durationMs >= 0))) throw new RangeError('durationMs must be nonnegative');
  if (!Number.isFinite(countInMs) || countInMs < 0) throw new RangeError('countInMs must be nonnegative');
  let state = { phase: 'idle', elapsedMs: 0, observation: null, error: null, outcome: null, startedAt: null, metrics: null, evidence: null };
  let audio = null, observations = [], disposed = false, generation = 0, pending = null;
  let anchor = 0, activeBeforeAnchor = 0;
  const snapshot = () => ({ ...state });
  const publish = (changes = {}) => {
    state = { ...state, ...changes };
    const value = snapshot();
    if (!disposed) notify(onChange, value);
    return value;
  };
  const accrue = () => {
    if (state.phase === 'running') {
      state = { ...state, elapsedMs: Math.min(durationMs, Math.max(state.elapsedMs, activeBeforeAnchor + Math.max(0, now() - anchor))) };
    }
  };
  const stopAudio = () => {
    const previous = audio; audio = null;
    try { Promise.resolve(previous?.stop()).catch(() => {}); } catch {}
  };
  const fail = (code = 'audio-unavailable') => {
    accrue(); generation += 1; pending = null;
    state = { ...state, phase: 'error', observation: null, error: code };
    stopAudio();
    return publish();
  };
  const finish = (reason = completion.reason ?? 'finished') => {
    if (disposed || ['idle', 'error', 'completed'].includes(state.phase)) return snapshot();
    accrue(); generation += 1; pending = null;
    const metrics = calculateMetrics(observations, { toleranceCents, ...PRACTICE_EVIDENCE_POLICY });
    const evidence = assessPracticeEvidence(metrics, observations);
    Object.assign(metrics, { timedReliableFrameCount: evidence.timedReliableFrameCount, reliableSpanMs: evidence.reliableSpanMs,
      reliableTimestampsMonotonic: evidence.reliableTimestampsMonotonic });
    const payload = evidence.sufficient ? {
      startedAt: state.startedAt, endedAt: new Date(wallNow()).toISOString(), exerciseId, tonicFrequency: tonic,
      durationSeconds: Math.max(0, state.elapsedMs - countInMs) / 1000,
      reliableFrameCount: metrics.reliableFrameCount, totalFrameCount: metrics.totalFrameCount, metrics, quality: metrics.quality,
      completion: { ...completion, completed: true, reason },
    } : null;
    state = { ...state, phase: 'completed', observation: null, error: null,
      outcome: evidence.sufficient ? 'completed' : 'insufficient-audio', metrics, evidence };
    stopAudio();
    const value = publish();
    if (payload) notify(onComplete, payload);
    return value;
  };
  const tick = () => {
    if (disposed || state.phase !== 'running') return snapshot();
    accrue();
    if (state.elapsedMs >= durationMs) return finish('duration-complete');
    return publish();
  };
  const receiveFrame = (frame, token) => {
    if (disposed || token !== generation || state.phase !== 'running') return;
    accrue();
    if (state.elapsedMs >= durationMs) { finish('duration-complete'); return; }
    if (state.elapsedMs < countInMs) { publish({ observation: null }); return; }
    let target;
    try { target = targetAt(state.elapsedMs); } catch { fail('practice-target-unavailable'); return; }
    if (!target) { publish({ observation: null }); return; }
    const baseHz = targetFrequency(target.swara, tonic);
    const octave = target.octave ?? 0;
    const targetFrequencyHz = baseHz === null ? null : baseHz * 2 ** octave;
    if (!Number.isFinite(targetFrequencyHz) || targetFrequencyHz <= 0) { fail('practice-target-unavailable'); return; }
    // Only derived scalars cross the audio boundary. Never retain a frame's PCM,
    // buffers, or arbitrary properties supplied by a processor.
    const frequencyHz = Number.isFinite(frame?.frequencyHz) ? frame.frequencyHz : null;
    const voiced = frame?.voiced === true && frame.valid !== false && frequencyHz !== null && frequencyHz > 0;
    const observation = {
      timestamp: state.elapsedMs, frequencyHz, confidence: Number.isFinite(frame?.confidence) ? frame.confidence : 0,
      voiced, clipped: frame?.clipped === true, valid: frame?.valid !== false,
      reason: typeof frame?.reason === 'string' ? frame.reason : null,
      centsError: voiced ? centsBetween(frequencyHz, targetFrequencyHz) : null,
      targetFrequencyHz, targetNote: target.swara, targetSwara: target.swara, octave,
    };
    for (const key of ['groupIndex', 'groupBeatIndex', 'loopIndex', 'beatIndex', 'noteIndex', 'isSustain']) {
      if (typeof target[key] === 'number' || typeof target[key] === 'boolean') observation[key] = target[key];
    }
    Object.freeze(observation);
    observations.push(observation);
    publish({ observation });
  };
  const start = () => {
    if (disposed) return Promise.resolve(snapshot());
    if (state.phase === 'requesting') return pending ?? Promise.resolve(snapshot());
    if (!['idle', 'error', 'completed'].includes(state.phase)) return Promise.resolve(snapshot());
    const token = ++generation;
    stopAudio(); observations = []; activeBeforeAnchor = 0; anchor = 0;
    publish({ phase: 'requesting', elapsedMs: 0, observation: null, error: null, outcome: null, startedAt: null, metrics: null, evidence: null });
    const operation = (async () => {
      try {
        if (disposed || token !== generation) return snapshot();
        audio = createAudio({ onFrame: (frame) => receiveFrame(frame, token), onError: (_cause, code) => {
          if (!disposed && token === generation && !['error', 'completed'].includes(state.phase)) fail(code);
        } });
        const result = await audio.start();
        if (disposed || token !== generation) return snapshot();
        if (!result?.ok) return fail(result?.error);
        anchor = now(); activeBeforeAnchor = 0;
        publish({ phase: 'running', startedAt: new Date(wallNow()).toISOString() });
        return durationMs === 0 ? finish('duration-complete') : snapshot();
      } catch (cause) {
        if (disposed || token !== generation) return snapshot();
        return fail(cause?.name === 'NotAllowedError' ? 'microphone-permission-denied' : 'audio-unavailable');
      }
    })();
    pending = operation;
    void operation.then(() => { if (pending === operation) pending = null; });
    return operation;
  };
  const transition = (method, from, to) => {
    if (disposed) return Promise.resolve(snapshot());
    if (state.phase === 'requesting') return pending ?? Promise.resolve(snapshot());
    if (state.phase !== from) return Promise.resolve(snapshot());
    accrue();
    if (from === 'running' && state.elapsedMs >= durationMs) return Promise.resolve(finish('duration-complete'));
    const token = generation;
    publish({ phase: 'requesting', observation: null });
    const operation = (async () => {
      try {
        if (disposed || token !== generation) return snapshot();
        const result = await audio[method]();
        if (disposed || token !== generation) return snapshot();
        if (result?.ok === false) return fail(result.error ?? `audio-${method}-failed`);
        if (to === 'running') { activeBeforeAnchor = state.elapsedMs; anchor = now(); }
        return publish({ phase: to });
      } catch {
        if (disposed || token !== generation) return snapshot();
        return fail(`audio-${method}-failed`);
      }
    })();
    pending = operation;
    void operation.then(() => { if (pending === operation) pending = null; });
    return operation;
  };
  return {
    start, pause: () => transition('pause', 'running', 'paused'), resume: () => transition('resume', 'paused', 'running'), finish, tick,
    dispose() {
      if (!disposed) { accrue(); disposed = true; generation += 1; pending = null; state = { ...state, phase: 'idle', observation: null }; stopAudio(); }
      return snapshot();
    },
    getSnapshot: snapshot,
    get snapshot() { return snapshot(); },
  };
}
