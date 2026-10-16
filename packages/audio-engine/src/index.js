export function estimatePitch(samples, sampleRate, { minFrequency = 65, maxFrequency = 1000, silenceRms = 0.01, minConfidence = 0.72 } = {}) {
  if (!samples || !Number.isFinite(sampleRate) || sampleRate <= 0 || samples.length < 32) return { frequencyHz: null, confidence: 0, rms: 0, voiced: false, clipped: false, reason: 'invalid_input' };
  let sum = 0; let clippedSamples = 0;
  for (const value of samples) { if (!Number.isFinite(value)) return { frequencyHz: null, confidence: 0, rms: 0, voiced: false, clipped: false, reason: 'invalid_input' }; sum += value * value; if (Math.abs(value) >= 1) clippedSamples += 1; }
  const clipped = clippedSamples > samples.length * 0.01;
  const rms = Math.sqrt(sum / samples.length);
  if (clipped) return { frequencyHz: null, confidence: 0, rms, voiced: false, clipped: true, reason: 'clipping' };
  if (rms < silenceRms) return { frequencyHz: null, confidence: 0, rms, voiced: false, clipped: false, reason: 'silence' };
  let crossings = 0; for (let i = 1; i < samples.length; i += 1) if (samples[i - 1] <= 0 && samples[i] > 0) crossings += 1;
  const zeroCrossingFrequency = crossings * sampleRate / samples.length;
  if (crossings >= 2 && zeroCrossingFrequency >= minFrequency && zeroCrossingFrequency <= maxFrequency) {
    const lag = Math.max(1, Math.round(sampleRate / zeroCrossingFrequency)); let product = 0; let energy = 0;
    for (let i = 0; i + lag < samples.length; i += 1) { product += samples[i] * samples[i + lag]; energy += samples[i] * samples[i]; }
    const confidence = Math.max(0, Math.min(1, product / (energy || 1)));
    if (confidence >= minConfidence) return { frequencyHz: zeroCrossingFrequency, confidence, rms, voiced: true, clipped: false, reason: null };
  }
  const minLag = Math.max(2, Math.floor(sampleRate / maxFrequency)); const maxLag = Math.min(samples.length - 2, Math.ceil(sampleRate / minFrequency));
  let bestLag = 0; let best = Infinity; let total = 0;
  for (let lag = minLag; lag <= maxLag; lag += 1) { let d = 0; for (let i = 0; i + lag < samples.length; i += 1) { const delta = samples[i] - samples[i + lag]; d += delta * delta; } if (d < best) { best = d; bestLag = lag; } total += d; }
  if (!bestLag) { bestLag = minLag; best = correlationDifference(samples, bestLag); }
  if (!bestLag || !Number.isFinite(best) || !Number.isFinite(total)) return { frequencyHz: null, confidence: 0, rms, voiced: false, clipped: false, reason: 'invalid_input' };
  const confidence = Math.max(0, Math.min(1, 1 - best / (2 * sum)));
  const frequencyHz = sampleRate / bestLag;
  if (confidence < minConfidence) return { frequencyHz: null, confidence, rms, voiced: false, clipped: false, reason: 'low_confidence' };
  return { frequencyHz: frequencyHz >= minFrequency && frequencyHz <= maxFrequency ? frequencyHz : null, confidence, rms, voiced: frequencyHz >= minFrequency && frequencyHz <= maxFrequency, clipped: false, reason: frequencyHz >= minFrequency && frequencyHz <= maxFrequency ? null : 'out_of_range' };
}

function correlationDifference(samples, lag) { let difference = 0; for (let i = 0; i + lag < samples.length; i += 1) { const delta = samples[i] - samples[i + lag]; difference += delta * delta; } return difference; }

export function microphoneErrorReason(error) { if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') return 'permission_denied'; if (error?.name === 'NotFoundError') return 'microphone_not_found'; if (error?.name === 'NotReadableError') return 'microphone_busy'; return 'microphone_error'; }

export function createAudioController({ onPitch = () => {}, onError = () => {}, windowObject = globalThis } = {}) {
  let context; let source; let processor; let stream;
  const stop = () => { processor?.disconnect(); source?.disconnect(); stream?.getTracks().forEach((track) => track.stop()); if (context && context.state !== 'closed') context.close(); processor = source = stream = context = undefined; };
  return { async start() { try { const media = windowObject.navigator?.mediaDevices; if (!media?.getUserMedia) throw Object.assign(new Error('Microphone unavailable'), { name: 'NotSupportedError' }); stream = await media.getUserMedia({ audio: true }); const AudioContext = windowObject.AudioContext || windowObject.webkitAudioContext; if (!AudioContext) throw Object.assign(new Error('Web Audio unavailable'), { name: 'NotSupportedError' }); context = new AudioContext(); await context.resume?.(); source = context.createMediaStreamSource(stream); processor = context.createScriptProcessor(2048, 1, 1); const sink = context.createGain(); sink.gain.value = 0; processor.onaudioprocess = ({ inputBuffer }) => onPitch(estimatePitch(inputBuffer.getChannelData(0), context.sampleRate)); source.connect(processor); processor.connect(sink); sink.connect(context.destination); } catch (error) { stop(); onError(error, microphoneErrorReason(error)); throw error; } }, pause() { if (context?.state === 'running') context.suspend(); }, resume() { if (context?.state === 'suspended') context.resume(); }, stop };
}
