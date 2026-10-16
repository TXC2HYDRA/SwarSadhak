const MAX_FRAMES = 4096;
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function boundedFrames(frames, limit = MAX_FRAMES) {
  if (!Array.isArray(frames)) return [];
  const safeLimit = clamp(Number.isInteger(limit) ? limit : MAX_FRAMES, 0, MAX_FRAMES);
  return frames.slice(0, safeLimit).filter((frame) => frame && typeof frame === 'object');
}

export function mean(values) {
  const valid = Array.from(values ?? []).filter(finite);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

export function median(values) {
  const valid = Array.from(values ?? []).filter(finite).sort((a, b) => a - b);
  if (!valid.length) return null;
  const middle = Math.floor(valid.length / 2);
  return valid.length % 2 ? valid[middle] : (valid[middle - 1] + valid[middle]) / 2;
}

export function medianAbsoluteDeviation(values) {
  const center = median(values);
  return center === null ? null : median(Array.from(values ?? []).filter(finite).map((value) => Math.abs(value - center)));
}

export function summarizeAcoustics(frames, options = {}) {
  const safe = boundedFrames(frames, options.maxFrames);
  const confidenceThreshold = finite(options.confidenceThreshold) ? clamp(options.confidenceThreshold, 0, 1) : 0.7;
  const voiced = safe.filter((frame) => frame.voiced === true && finite(frame.frequencyHz) && frame.frequencyHz > 0 &&
    finite(frame.confidence) && frame.confidence >= confidenceThreshold &&
    (options.excludeClipped !== false ? frame.clipped !== true : true));
  const frequencies = voiced.map((frame) => frame.frequencyHz);
  const cents = voiced.map((frame) => frame.centsError).filter(finite);
  const confidences = safe.map((frame) => frame.confidence).filter(finite).map((value) => clamp(value, 0, 1));
  return Object.freeze({
    frameCount: safe.length, reliableFrameCount: voiced.length,
    voicedPercent: safe.length ? (voiced.length / safe.length) * 100 : 0,
    meanFrequencyHz: mean(frequencies), minFrequencyHz: frequencies.length ? Math.min(...frequencies) : null,
    maxFrequencyHz: frequencies.length ? Math.max(...frequencies) : null,
    medianAbsoluteCents: cents.length ? median(cents.map(Math.abs)) : null,
    pitchStabilityMad: cents.length ? medianAbsoluteDeviation(cents) : null,
    meanConfidence: mean(confidences), clippedFrameCount: safe.filter((frame) => frame.clipped === true).length,
    lowConfidenceFrameCount: safe.filter((frame) => finite(frame.confidence) && frame.confidence < confidenceThreshold).length
  });
}

export const extractFeatures = summarizeAcoustics;
export const analyzeAcoustics = summarizeAcoustics;
