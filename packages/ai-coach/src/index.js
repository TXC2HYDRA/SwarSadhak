import { getExercise, validateExerciseId } from '../../exercises/src/index.js';
import { summarizeAcoustics } from '../../acoustic-analysis/src/index.js';

const locales = new Set(['en', 'mr', 'hi']);
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const MAX_FRAMES = 4096;
const MAX_OUTPUT_BYTES = 8192;
const frameFields = new Set(['voiced', 'frequencyHz', 'centsError', 'confidence', 'clipped']);
const outputFields = new Set(['exerciseId', 'locale', 'messageKey', 'reasonKey', 'metrics', 'nextExerciseId', 'confidence', 'evidence']);
const messageKeys = new Set(['recommendations.stablePerformance', 'recommendations.noReliableAudio', 'recommendations.clipping', 'recommendations.highDeviation']);
const confidenceLevels = new Set(['low', 'medium', 'high']);
const unsafe = /<\/?(?:script|html|iframe|style)\b|\b(?:diagnos(?:e|is|tic)|medical|disease|condition|prescription|treatment)\b/i;
const hasUnsafeText = (value) => typeof value === 'string' ? unsafe.test(value) : value && typeof value === 'object' ? Object.values(value).some(hasUnsafeText) : false;
const exactKeys = (value, allowed) => Object.keys(value).every((key) => allowed.has(key));

export function validateCoachInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('coach input must be an object');
  if (!validateExerciseId(input.exerciseId) && input.exerciseId !== 'sa-re-ga-ma') throw new TypeError('invalid exerciseId');
  if (input.locale !== undefined && !locales.has(input.locale)) throw new TypeError('unsupported locale');
  if (hasUnsafeText(input) || ['rawAudio', 'pcm', 'audio', 'samples', 'waveform', 'buffer'].some((key) => key in input)) throw new TypeError('raw audio is not accepted');
  if (input.frames !== undefined && (!Array.isArray(input.frames) || input.frames.length > MAX_FRAMES)) throw new TypeError('frames must be a bounded array');
  for (const frame of input.frames ?? []) {
    if (!frame || typeof frame !== 'object' || Array.isArray(frame) || !exactKeys(frame, frameFields)) throw new TypeError('frame contains unsupported fields');
    if (frame.frequencyHz !== undefined && (!finite(frame.frequencyHz) || frame.frequencyHz < 20 || frame.frequencyHz > 20000)) throw new RangeError('frequencyHz out of bounds');
    if (frame.centsError !== undefined && (!finite(frame.centsError) || frame.centsError < -2400 || frame.centsError > 2400)) throw new RangeError('centsError out of bounds');
    if (frame.confidence !== undefined && (!finite(frame.confidence) || frame.confidence < 0 || frame.confidence > 1)) throw new RangeError('confidence out of bounds');
  }
  return true;
}

function deterministic(input) {
  const metrics = input.metrics ?? summarizeAcoustics(input.frames ?? []);
  let messageKey = 'recommendations.stablePerformance';
  if (!metrics.reliableFrameCount) messageKey = 'recommendations.noReliableAudio';
  else if ((metrics.clippedFrameCount ?? 0) > 0) messageKey = 'recommendations.clipping';
  else if ((metrics.medianAbsoluteCents ?? 0) > 50) messageKey = 'recommendations.highDeviation';
  const exercise = getExercise(input.exerciseId);
  return Object.freeze({ exerciseId: input.exerciseId, locale: input.locale ?? 'en', messageKey, reasonKey: messageKey, metrics, nextExerciseId: exercise?.id ?? 'sa-sustain', provider: 'deterministic' });
}

export function validateCoachOutput(output, input, metrics = input?.metrics ?? summarizeAcoustics(input?.frames ?? [])) {
  if (!output || typeof output !== 'object' || Array.isArray(output) || !exactKeys(output, outputFields)) throw new TypeError('invalid coach output fields');
  if (hasUnsafeText(output) || typeof output.messageKey !== 'string' || !messageKeys.has(output.messageKey)) throw new TypeError('invalid translation key or unsafe output');
  if (output.exerciseId !== undefined && output.exerciseId !== input?.exerciseId) throw new TypeError('output exercise does not match input');
  if (output.locale !== undefined && !locales.has(output.locale)) throw new TypeError('invalid output locale');
  if (output.reasonKey !== undefined && (!messageKeys.has(output.reasonKey) || output.reasonKey !== output.messageKey)) throw new TypeError('invalid reason key');
  if (output.nextExerciseId !== undefined && !getExercise(output.nextExerciseId)) throw new TypeError('invalid suggested exercise');
  if (output.confidence !== undefined && !confidenceLevels.has(output.confidence)) throw new TypeError('invalid confidence');
  if (output.metrics !== undefined && JSON.stringify(output.metrics) !== JSON.stringify(metrics)) throw new TypeError('output evidence does not match input metrics');
  if (output.evidence !== undefined) {
    const { metric, value } = output.evidence;
    if (typeof metric !== 'string' || !Object.prototype.hasOwnProperty.call(metrics, metric) || value !== metrics[metric]) throw new TypeError('evidence does not match input metrics');
  }
  if (Buffer.byteLength(JSON.stringify(output), 'utf8') > MAX_OUTPUT_BYTES) throw new RangeError('coach output is too large');
  return true;
}

export async function coach(input, options = {}) {
  validateCoachInput(input);
  const fallback = () => deterministic(input);
  const provider = options.provider;
  if (typeof provider !== 'function') return fallback();
  try {
    const metrics = input.metrics ?? summarizeAcoustics(input.frames ?? []);
    const call = Promise.resolve(provider({ ...input, metrics }));
    const result = options.timeoutMs > 0 ? await Promise.race([call, new Promise((resolve) => setTimeout(() => resolve(null), options.timeoutMs))]) : await call;
    if (!result || typeof result !== 'object') return fallback();
    validateCoachOutput(result, input, metrics);
    return Object.freeze({ ...deterministic(input), ...result, metrics, provider: 'provider' });
  } catch { return fallback(); }
}
export const getCoaching = coach;
export const deterministicCoach = (input) => { validateCoachInput(input); return deterministic(input); };
