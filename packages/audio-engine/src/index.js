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
  let current = null, state = 'idle', pendingStart = null, pendingTransition = null, transitionMethod = null;
  const cancelled = () => ({ ok: false, error: 'audio-cancelled' });
  const notifyError = (cause, code) => {
    try { Promise.resolve(options.onError?.(cause, code)).catch(() => {}); } catch {}
  };
  // Clear each handle before releasing it. A broken node/track must not prevent
  // the remaining resources from being released, including a late media stream.
  const cleanup = (attempt) => {
    if (!attempt) return Promise.resolve();
    const { processor, source, gain, stream, context } = attempt;
    attempt.processor = attempt.source = attempt.gain = attempt.stream = attempt.context = null;
    try { if (processor) processor.onaudioprocess = null; } catch {}
    for (const node of [processor, source, gain]) { try { node?.disconnect(); } catch {} }
    try { for (const track of stream?.getTracks?.() ?? []) { try { track.stop(); } catch {} } } catch {}
    try { return Promise.resolve(context?.close?.()).catch(() => {}); } catch { return Promise.resolve(); }
  };
  const fail = (attempt, cause, code) => {
    if (current !== attempt) { void cleanup(attempt); return cancelled(); }
    current = null; state = 'error';
    void cleanup(attempt);
    const error = code ?? (cause?.name === 'NotAllowedError' ? 'microphone-permission-denied' : 'audio-unavailable');
    notifyError(cause, error);
    return { ok: false, error, cause };
  };
  const transition = (method, nextState) => {
    if (pendingTransition) return transitionMethod === method ? pendingTransition : Promise.resolve({ ok: false, error: 'audio-transition-pending' });
    if (!current || !['running', 'paused'].includes(state)) return Promise.resolve({ ok: false, error: 'audio-not-running' });
    if (state === nextState) return Promise.resolve({ ok: true });
    const attempt = current;
    // Frame delivery stops synchronously, before suspend/resume can settle.
    state = 'requesting'; transitionMethod = method;
    const operation = (async () => {
      try {
        if (typeof attempt.context?.[method] !== 'function') throw new Error(`AudioContext.${method} unavailable`);
        await attempt.context[method]();
        if (current !== attempt) return cancelled();
        if (method === 'resume' && attempt.context.state && attempt.context.state !== 'running') throw new Error('AudioContext did not resume');
        state = nextState;
        return { ok: true };
      } catch (cause) { return fail(attempt, cause, method === 'resume' ? 'audio-resume-failed' : 'audio-pause-failed'); }
    })();
    pendingTransition = operation;
    void operation.then(() => { if (pendingTransition === operation) pendingTransition = null; });
    return operation;
  };
  return {
    start() {
      if (pendingStart) return pendingStart;
      if (current) return Promise.resolve({ ok: false, error: 'audio-already-started' });
      const attempt = { context: null, stream: null, source: null, gain: null, processor: null };
      current = attempt; state = 'requesting';
      const operation = (async () => {
        try {
          const AudioContext = options.AudioContext ?? globalThis.AudioContext ?? globalThis.webkitAudioContext;
          const getUserMedia = options.getUserMedia ?? globalThis.navigator?.mediaDevices?.getUserMedia?.bind(globalThis.navigator.mediaDevices);
          if (!AudioContext || !getUserMedia) throw new Error('Audio APIs unavailable');
          attempt.context = new AudioContext();
          attempt.stream = await getUserMedia({ audio: options.audioConstraints ?? { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: false } });
          if (current !== attempt) { await cleanup(attempt); return cancelled(); }
          const context = attempt.context;
          if (typeof context.createScriptProcessor !== 'function') return fail(attempt, new Error('Audio analysis processor unavailable'), 'audio-analysis-unavailable');
          attempt.source = context.createMediaStreamSource(attempt.stream);
          attempt.gain = context.createGain(); attempt.gain.gain.value = 0;
          attempt.processor = context.createScriptProcessor(options.bufferSize ?? 2048, 1, 1);
          if (!attempt.processor) return fail(attempt, new Error('Audio analysis processor unavailable'), 'audio-analysis-unavailable');
          attempt.processor.onaudioprocess = (event) => {
            if (current !== attempt || state !== 'running') return;
            try {
              const frame = estimatePitch(event.inputBuffer.getChannelData(0), context.sampleRate, options.pitchOptions);
              if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('swar:audio-frame', { detail: frame }));
              Promise.resolve(options.onFrame?.(frame)).catch((cause) => fail(attempt, cause, 'audio-processing-failed'));
            } catch (cause) { fail(attempt, cause, 'audio-processing-failed'); }
          };
          attempt.source.connect(attempt.processor); attempt.processor.connect(attempt.gain); attempt.gain.connect(context.destination);
          if (context.state !== 'running' && typeof context.resume === 'function') {
            try { await context.resume(); } catch (cause) { return fail(attempt, cause, 'audio-resume-failed'); }
          }
          if (current !== attempt) { await cleanup(attempt); return cancelled(); }
          if (context.state && context.state !== 'running') return fail(attempt, new Error('AudioContext did not start'), 'audio-resume-failed');
          state = 'running';
          return { ok: true, context, stream: attempt.stream };
        } catch (cause) { return fail(attempt, cause); }
      })();
      pendingStart = operation;
      void operation.then(() => { if (pendingStart === operation) pendingStart = null; });
      return operation;
    },
    pause() { return transition('suspend', 'paused'); },
    resume() { return transition('resume', 'running'); },
    stop() {
      const attempt = current;
      current = null; state = 'stopped'; pendingStart = pendingTransition = null;
      return cleanup(attempt);
    },
    get stopped() { return ['stopped', 'error'].includes(state); },
    get state() { return state; },
  };
}
