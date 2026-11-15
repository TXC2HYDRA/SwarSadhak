// Optional beat audio: separate from the microphone graph, closed on pause/exit.
export function createBeatPlayer({ AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext } = {}) {
  let context = null;
  const voices = new Set();
  const stop = () => {
    for (const voice of voices) { try { voice.stop(); voice.disconnect(); } catch {} }
    voices.clear();
    const previous = context; context = null;
    try { Promise.resolve(previous?.close()).catch(() => {}); } catch {}
  };
  return {
    stop,
    play(accent) {
      try {
        if (!AudioContext) return false;
        context ??= new AudioContext();
        if (context.state === 'suspended') { stop(); return false; }
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.frequency.value = accent ? 880 : 660;
        gain.gain.setValueAtTime(.045, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .08);
        oscillator.connect(gain); gain.connect(context.destination); voices.add(oscillator);
        oscillator.addEventListener('ended', () => { voices.delete(oscillator); oscillator.disconnect(); gain.disconnect(); }, { once: true });
        oscillator.start(); oscillator.stop(context.currentTime + .09);
        return true;
      } catch { stop(); return false; }
    },
  };
}
