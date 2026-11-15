export const TANPURA_RECORDINGS = Object.freeze({
  A3: [{ id: 'low', labelKey: 'tanpuraProfiles.lowMale', file: 'tanpura_a_low.mp3', url: 'https://res.cloudinary.com/v2luwkfe/video/upload/v1792480331/tanpura_a_low.mp3' }, { id: 'medium', labelKey: 'tanpuraProfiles.mediumFemale', file: 'tanpura_a_medium.mp3', url: 'https://res.cloudinary.com/v2luwkfe/video/upload/v1792480324/tanpura_a_medium.mp3' }],
  'A#3': [{ id: 'low', labelKey: 'tanpuraProfiles.lowMale', file: 'tanpura_a-sharp_low.mp3', url: 'https://res.cloudinary.com/v2luwkfe/video/upload/v1792480486/tanpura_a-sharp_low.mp3' }, { id: 'medium', labelKey: 'tanpuraProfiles.mediumFemale', file: 'tanpura_a-sharp_medium.mp3', url: 'https://res.cloudinary.com/v2luwkfe/video/upload/v1792480316/tanpura_a-sharp_medium.mp3' }],
  B3: [{ id: 'male', labelKey: 'tanpuraProfiles.lowMale', file: 'tanpura_b_low_male.mp3', url: 'https://res.cloudinary.com/v2luwkfe/video/upload/v1792480471/tanpura_b_low_male.mp3' }, { id: 'female', labelKey: 'tanpuraProfiles.lowFemale', file: 'tanpura_b_low_female.mp3', url: 'https://res.cloudinary.com/v2luwkfe/video/upload/v1792480452/tanpura_b_low_female.mp3' }],
  C4: [{ id: 'medium', labelKey: 'tanpuraProfiles.medium', file: 'tanpura_c_medium.mp3', url: 'https://res.cloudinary.com/v2luwkfe/video/upload/v1792480425/tanpura_c_medium.mp3' }],
  'C#4': [{ id: 'male', labelKey: 'tanpuraProfiles.mediumMale', file: 'tanpura_c-sharp_medium_male.mp3', url: 'https://res.cloudinary.com/v2luwkfe/video/upload/v1792480432/tanpura_c-sharp_medium_male.mp3' }],
  D4: [{ id: 'medium', labelKey: 'tanpuraProfiles.medium', file: 'tanpura_d_medium.mp3', url: 'https://res.cloudinary.com/v2luwkfe/video/upload/v1792480419/tanpura_d_medium.mp3' }],
  'D#4': [{ id: 'medium', labelKey: 'tanpuraProfiles.medium', file: 'tanpura_d-sharp_medium.mp3', url: 'https://res.cloudinary.com/v2luwkfe/video/upload/v1792480394/tanpura_d-sharp_medium.mp3' }],
  E4: [{ id: 'medium', labelKey: 'tanpuraProfiles.medium', file: 'tanpura_e_medium.mp3', url: 'https://res.cloudinary.com/v2luwkfe/video/upload/v1792480322/tanpura_e_medium.mp3' }],
  F4: [{ id: 'medium', labelKey: 'tanpuraProfiles.medium', file: 'tanpura_f_medium.mp3', url: 'https://res.cloudinary.com/v2luwkfe/video/upload/v1792480314/tanpura_f_medium.mp3' }],
  'F#4': [{ id: 'medium', labelKey: 'tanpuraProfiles.medium', file: 'tanpura_f-sharp_medium.mp3', url: 'https://res.cloudinary.com/v2luwkfe/video/upload/v1792480436/tanpura_f-sharp_medium.mp3' }],
  G4: [{ id: 'medium', labelKey: 'tanpuraProfiles.medium', file: 'tanpura_g_medium.mp3', url: 'https://res.cloudinary.com/v2luwkfe/video/upload/v1792480294/tanpura_g_medium.mp3' }],
  'G#4': [{ id: 'medium', labelKey: 'tanpuraProfiles.medium', file: 'tanpura_g-sharp_medium.mp3', url: 'https://res.cloudinary.com/v2luwkfe/video/upload/v1792480413/tanpura_g-sharp_medium.mp3' }],
});

export function tanpuraRecordingsFor(pitch) {
  return TANPURA_RECORDINGS[pitch] || [];
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export function createTanpuraPlayer(options = {}) {
  const Audio = options.Audio ?? globalThis.Audio;
  const fadeSeconds = options.fadeSeconds ?? 0.8;
  const targetVolume = options.targetVolume ?? 0.72;
  let audio = null;
  let generation = 0, pending = null;
  const release = (element) => {
    if (!element) return;
    element.pause?.();
    try { element.currentTime = 0; } catch {}
    element.volume = 0;
    element.removeAttribute?.('src');
    element.load?.();
  };
  const fadeTo = async (element, target, token) => {
    const start = Number.isFinite(element.volume) ? element.volume : 0;
    const steps = Math.max(1, Math.ceil(fadeSeconds * 30));
    for (let step = 1; step <= steps; step += 1) {
      if (token !== generation) return;
      element.volume = Math.max(0, Math.min(1, start + ((target - start) * step) / steps));
      await sleep((fadeSeconds * 1000) / steps);
    }
    if (token === generation) element.volume = target;
  };

  const stop = async ({ immediate = false } = {}) => {
    const element = audio;
    const token = ++generation;
    audio = null; pending = null;
    if (!element) return;
    if (!immediate) await fadeTo(element, 0, token);
    release(element);
  };

  return {
    start(recording) {
      if (pending) return pending;
      if (!Audio || !recording?.url) return Promise.resolve({ ok: false, error: 'audio-unavailable' });
      if (audio && !audio.paused && audio.src === recording.url) return Promise.resolve({ ok: true });
      void stop({ immediate: true });
      const token = ++generation;
      const operation = (async () => {
        let element;
        try {
          element = new Audio(); audio = element;
          element.preload = 'auto'; element.src = recording.url; element.loop = true; element.volume = 0;
          element.load?.();
          await element.play();
          if (token !== generation) { release(element); return { ok: false, error: 'audio-cancelled' }; }
          await fadeTo(element, targetVolume, token);
          if (token !== generation) { release(element); return { ok: false, error: 'audio-cancelled' }; }
          return { ok: true };
        } catch (cause) {
          release(element);
          if (audio === element) audio = null;
          return { ok: false, error: 'audio-unavailable', cause };
        }
      })();
      pending = operation;
      void operation.then(() => { if (pending === operation) pending = null; });
      return operation;
    },
    stop,
    get playing() { return Boolean(audio && !audio.paused); },
    get source() { return audio?.src || ''; },
  };
}
