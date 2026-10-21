const finite = (n) => typeof n === 'number' && Number.isFinite(n);

/** Estimate the fundamental with normalized autocorrelation. */
export function estimatePitch(samples, sampleRate, options = {}) {
  const input = samples && typeof samples.length === 'number' ? samples : [];
  const sr = Number(sampleRate);
  const minHz = options.minFrequencyHz ?? 60;
  const maxHz = options.maxFrequencyHz ?? 1000;
  const result = { frequencyHz: null, confidence: 0, voiced: false, clipped: false, valid: false };
  if (!finite(sr) || sr <= 0 || input.length < 3 || !Number.isInteger(input.length)) return { ...result, reason: 'invalid-input' };
  let sum = 0, peak = 0, valid = true;
  for (const value of input) { if (!finite(value)) valid = false; else { sum += value; peak = Math.max(peak, Math.abs(value)); } }
  if (!valid) return { ...result, reason: 'invalid_input' };
  const clipped = peak >= (options.clipThreshold ?? 1) && input.every((value) => Math.abs(value) >= (options.clipThreshold ?? 1));
  if (clipped) return { ...result, clipped: true, reason: 'clipping' };
  const mean = sum / input.length;
  const centered = Float64Array.from(input, (v) => v - mean);
  const energy = centered.reduce((a, v) => a + v * v, 0);
  if (energy < (options.silenceEnergy ?? 1e-8)) return { ...result, clipped, reason: 'silence' };
  const minLag = Math.max(1, Math.floor(sr / maxHz));
  const maxLag = Math.min(input.length - 2, Math.ceil(sr / minHz));
  if (maxLag <= minLag) return { ...result, clipped, reason: 'insufficient-window' };
  let bestLag = minLag, best = -1; const correlations = new Map();
  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    for (let i = 0; i < input.length - lag; i++) corr += centered[i] * centered[i + lag];
    corr /= energy;
    correlations.set(lag, corr); if (corr > best) { best = corr; bestLag = lag; }
  }
  const confidence = Math.max(0, Math.min(1, best));
  const threshold = options.confidenceThreshold ?? 0.55;
  const voiced = confidence >= threshold;
  if (!voiced) return { ...result, confidence, reason: 'low-confidence', valid: true, sampleRate: sr };
  const left = correlations.get(bestLag - 1) ?? best; const right = correlations.get(bestLag + 1) ?? best;
  const denominator = left - 2 * best + right; const offset = denominator ? 0.5 * (left - right) / denominator : 0;
  const frequencyHz = sr / (bestLag + offset);
  if (frequencyHz < minHz || frequencyHz > maxHz) return { ...result, confidence, reason: 'out-of-range', valid: true, sampleRate: sr };
  return { frequencyHz, confidence, voiced: true, clipped: false, valid: true, sampleRate: sr, reason: null };
}

export function createAudioController(options = {}) {
  let context = null, source = null, gain = null, processor = null, stream = null, stopped = false;
  const error = (cause) => ({ ok: false, error: cause?.name === 'NotAllowedError' ? 'microphone-permission-denied' : 'audio-unavailable', cause });
  return {
    async start() {
      try {
        const AudioContext = options.AudioContext ?? globalThis.AudioContext ?? globalThis.webkitAudioContext;
        const getUserMedia = options.getUserMedia ?? globalThis.navigator?.mediaDevices?.getUserMedia?.bind(globalThis.navigator.mediaDevices);
        if (!AudioContext || !getUserMedia) return error(new Error('Audio APIs unavailable'));
        context = new AudioContext(); stream = await getUserMedia({ audio: options.audioConstraints ?? { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: false } });
        source = context.createMediaStreamSource(stream); gain = context.createGain(); gain.gain.value = 0;
        source.connect(gain); gain.connect(context.destination);
        if (context.createScriptProcessor) {
          processor = context.createScriptProcessor(options.bufferSize ?? 2048, 1, 1);
           processor.onaudioprocess = (event) => { if (!stopped) { const frame = estimatePitch(event.inputBuffer.getChannelData(0), context.sampleRate, options.pitchOptions); if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('swar:audio-frame', { detail: frame })); options.onFrame?.(frame); } };
          source.connect(processor); processor.connect(gain);
        }
        stopped = false; return { ok: true, context, stream };
      } catch (cause) { this.stop?.(); const mapped = error(cause); options.onError?.(cause, mapped.error); return mapped; }
    },
    pause() { if (context?.suspend) context.suspend(); },
    resume() { if (context?.resume) context.resume(); },
    stop() { stopped = true; stream?.getTracks?.().forEach((track) => track.stop()); try { processor?.disconnect(); source?.disconnect(); gain?.disconnect(); } catch {} if (context?.close) context.close(); processor = source = gain = context = stream = null; },
    get stopped() { return stopped; },
  };
}
