export const SESSION_SCHEMA_VERSION = 1;

const finite = (value, name) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  return value;
};
export const inRange = (value, min, max, name = 'value') => {
  finite(value, name);
  if (value < min || value > max) throw new RangeError(`${name} must be between ${min} and ${max}`);
  return value;
};

export function mean(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  return values.reduce((sum, value) => sum + finite(value, 'metric'), 0) / values.length;
}

export function pitchAccuracy(centsError) {
  const error = Math.abs(finite(centsError, 'centsError'));
  return Math.max(0, Math.min(100, 100 - (error / 50) * 100));
}

export function sessionMetrics(samples = []) {
  if (!Array.isArray(samples)) throw new TypeError('samples must be an array');
  const accuracies = samples.map((sample) => pitchAccuracy(sample.centsError ?? sample));
  const accuracy = accuracies.length ? mean(accuracies) : 0;
  const durationSeconds = samples.length ? samples.reduce((total, sample) => total + finite(sample.durationSeconds ?? 0, 'durationSeconds'), 0) : 0;
  return { sampleCount: samples.length, accuracy, durationSeconds };
}

export function calculateMetrics(observations = [], options = {}) {
  const tolerance = options.toleranceCents ?? 50;
  const valid = observations.filter((o) => o && o.voiced === true && o.clipped !== true && Number.isFinite(o.confidence) && o.confidence >= (options.confidenceThreshold ?? 0.7) && Number.isFinite(o.frequencyHz) && o.frequencyHz >= (options.minFrequencyHz ?? 50) && o.frequencyHz <= (options.maxFrequencyHz ?? 1200) && Number.isFinite(o.centsError));
  const cents = valid.map((o) => Math.abs(o.centsError)).sort((a, b) => a - b);
  const median = (values) => values.length ? (values.length % 2 ? values[(values.length - 1) / 2] : (values[values.length / 2 - 1] + values[values.length / 2]) / 2) : null;
  const med = median(cents);
  const center = median(valid.map((o) => o.centsError).sort((a, b) => a - b));
  const mad = center === null ? null : median(valid.map((o) => Math.abs(o.centsError - center)).sort((a, b) => a - b));
  return {
    reliableFrameCount: valid.length,
    totalFrameCount: observations.length,
    reliablePitchMatchPercent: valid.length ? Math.round(valid.filter((o) => Math.abs(o.centsError) <= tolerance).length / valid.length * 100) : null,
    medianAbsoluteCents: med,
    pitchStabilityCents: mad,
    minFrequencyHz: valid.length ? Math.min(...valid.map((o) => o.frequencyHz)) : null,
    maxFrequencyHz: valid.length ? Math.max(...valid.map((o) => o.frequencyHz)) : null,
    quality: { reliableRatio: observations.length ? valid.length / observations.length : 0, silenceFrameCount: observations.filter((o) => o?.voiced === false).length, lowConfidenceFrameCount: observations.filter((o) => Number.isFinite(o?.confidence) && o.confidence < (options.confidenceThreshold ?? 0.7)).length, clippedFrameCount: observations.filter((o) => o?.clipped === true).length, invalidFrameCount: observations.filter((o) => !o || !Number.isFinite(o.centsError)).length }
  };
}

/** Return elapsed active time after subtracting one or more paused intervals. */
export function calculateActiveDuration(startedAt, endedAt, pausedIntervals = []) {
  const start = finite(Number(startedAt), 'startedAt');
  const end = finite(Number(endedAt), 'endedAt');
  if (end < start) throw new RangeError('endedAt must not precede startedAt');
  const paused = pausedIntervals.reduce((total, interval) => {
    const pauseStart = finite(Number(interval?.startedAt), 'pause.startedAt');
    const pauseEnd = finite(Number(interval?.endedAt), 'pause.endedAt');
    if (pauseEnd < pauseStart) throw new RangeError('pause.endedAt must not precede pause.startedAt');
    return total + Math.max(0, Math.min(end, pauseEnd) - Math.max(start, pauseStart));
  }, 0);
  return Math.max(0, end - start - paused) / 1000;
}

export function isValidPerformance(metrics = {}) {
  return Number.isInteger(metrics.reliableFrameCount) && metrics.reliableFrameCount > 0 && metrics.reliablePitchMatchPercent != null;
}

export function validateSession(session) {
  if (!session || typeof session !== 'object' || Array.isArray(session)) throw new TypeError('session must be an object');
  if (session.schemaVersion !== SESSION_SCHEMA_VERSION) throw new RangeError('unsupported session schema version');
  if (typeof session.id !== 'string' || !session.id.trim()) throw new TypeError('session.id is required');
  if (typeof session.startedAt !== 'string' || Number.isNaN(Date.parse(session.startedAt))) throw new TypeError('session.startedAt must be an ISO date');
  if (session.endedAt !== undefined && (typeof session.endedAt !== 'string' || Number.isNaN(Date.parse(session.endedAt)))) throw new TypeError('session.endedAt must be an ISO date');
  if (session.durationSeconds !== undefined) inRange(session.durationSeconds, 0, 24 * 60 * 60, 'durationSeconds');
  if (typeof session.exerciseId !== 'string' || !session.exerciseId.trim()) throw new TypeError('exerciseId is required');
  if (session.metrics) {
    if (typeof session.metrics !== 'object') throw new TypeError('session.metrics must be an object');
    if (session.metrics.accuracy !== undefined) inRange(session.metrics.accuracy, 0, 100, 'accuracy');
  }
  if ('audio' in session || 'audioData' in session || 'rawAudio' in session) throw new TypeError('raw audio is not allowed');
  return true;
}

export function createSession(input = {}) {
  const session = { schemaVersion: SESSION_SCHEMA_VERSION, ...input };
  validateSession(session);
  return structuredClone(session);
}

export { ALANKAR_COUNT_IN_BEATS, ALANKAR_MAX_LOOPS, ALANKAR_TIME_SIGNATURE, advanceElapsed, beatDurationMs, createAlankarTimeline, getAlankarBeatAt, normalizeBpm, normalizeLoopCount } from './alankarTiming.js';
