const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTE_PATTERN = /^([A-Ga-g])([#b]?)(-?\d+)$/;

export const noteNames = NOTE_NAMES;

export function noteToMidi(note) {
  if (typeof note === 'number' && Number.isFinite(note)) return note;
  const match = NOTE_PATTERN.exec(String(note).trim());
  if (!match) throw new RangeError(`Invalid note: ${note}`);
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[match[1].toUpperCase()];
  const accidental = match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0;
  return (Number(match[3]) + 1) * 12 + base + accidental;
}

export function midiToNote(midi, { preferFlats = false } = {}) {
  if (!Number.isFinite(midi)) throw new RangeError('MIDI must be finite');
  const rounded = Math.round(midi);
  const names = preferFlats ? ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] : NOTE_NAMES;
  return `${names[((rounded % 12) + 12) % 12]}${Math.floor(rounded / 12) - 1}`;
}

export function frequencyToMidi(frequency, reference = 440) {
  if (!(frequency > 0) || !(reference > 0)) return null;
  return 69 + 12 * Math.log2(frequency / reference);
}
export function midiToFrequency(midi, reference = 440) {
  if (!Number.isFinite(midi) || !(reference > 0)) return null;
  return reference * 2 ** ((midi - 69) / 12);
}
export const noteToFrequency = (note, reference = 440) => midiToFrequency(noteToMidi(note), reference);
export const centsBetween = (actual, target) => actual > 0 && target > 0 ? 1200 * Math.log2(actual / target) : null;
export function targetFrequency(note, tonicFrequency = 261.63) {
  const offsets = { Sa: 0, Re: 2, Ga: 4, Ma: 5, Pa: 7, Dha: 9, Ni: 11 };
  if (!(tonicFrequency > 0) || offsets[note] === undefined) return null;
  return tonicFrequency * 2 ** (offsets[note] / 12);
}
export function classifyCents(cents, tolerance = 50) {
  if (!Number.isFinite(cents)) return 'unknown';
  if (Math.abs(cents) <= tolerance) return 'in-tune';
  return cents < 0 ? 'flat' : 'sharp';
}
export function evaluatePitch(actualFrequency, targetFrequency, toleranceCents = 50) {
  const cents = centsBetween(actualFrequency, targetFrequency);
  if (cents === null || !Number.isFinite(cents)) return { status: 'silent', cents: null, inTune: false };
  return { status: classifyCents(cents, toleranceCents), cents, inTune: Math.abs(cents) <= toleranceCents };
}
