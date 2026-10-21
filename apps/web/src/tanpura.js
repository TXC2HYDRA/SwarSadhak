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
  let fadeToken = 0;

  const ensureAudio = () => {
    if (!audio && Audio) {
      audio = new Audio();
      audio.preload = 'auto';
      audio.loop = true;
      audio.volume = 0;
    }
    return audio;
  };

  const fadeTo = async (target) => {
    const element = ensureAudio();
    if (!element) return;
    const token = ++fadeToken;
    const start = Number.isFinite(element.volume) ? element.volume : 0;
    const steps = Math.max(1, Math.ceil(fadeSeconds * 30));
    for (let step = 1; step <= steps; step += 1) {
      if (token !== fadeToken) return;
      element.volume = Math.max(0, Math.min(1, start + ((target - start) * step) / steps));
      await sleep((fadeSeconds * 1000) / steps);
    }
    if (token === fadeToken) element.volume = target;
  };

  const stop = async ({ immediate = false } = {}) => {
    const element = ensureAudio();
    if (!element) return;
    if (immediate) {
      ++fadeToken;
      element.pause?.();
      try { element.currentTime = 0; } catch {}
      element.volume = 0;
      return;
    }
    await fadeTo(0);
    element.pause?.();
    try { element.currentTime = 0; } catch {}
  };

  return {
    async start(recording) {
      const element = ensureAudio();
      if (!element || !recording?.url) return { ok: false, error: 'audio-unavailable' };
      try {
        if (element.src !== recording.url) {
          if (element.src && !element.paused) await stop();
          element.src = recording.url;
          element.loop = true;
          element.load?.();
        }
        element.volume = 0;
        await element.play();
        await fadeTo(targetVolume);
        return { ok: true };
      } catch (cause) {
        await stop({ immediate: true });
        return { ok: false, error: 'audio-unavailable', cause };
      }
    },
    stop,
    get playing() { return Boolean(audio && !audio.paused); },
    get source() { return audio?.src || ''; },
  };
}
