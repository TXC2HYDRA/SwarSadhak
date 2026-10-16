export const NOTE_TARGETS = Object.freeze([
  { swara: 'Sa', degree: 0, ratio: 1 }, { swara: 'Re', degree: 2, ratio: 2 ** (2 / 12) }, { swara: 'Ga', degree: 4, ratio: 2 ** (4 / 12) },
  { swara: 'Ma', degree: 5, ratio: 2 ** (5 / 12) }, { swara: 'Pa', degree: 7, ratio: 2 ** (7 / 12) }, { swara: 'Dha', degree: 9, ratio: 2 ** (9 / 12) }, { swara: 'Ni', degree: 11, ratio: 2 ** (11 / 12) }
]);
export const HINDUSTANI_NOTES = NOTE_TARGETS;
export function frequencyToNote(frequencyHz, tonicHz, options = {}) {
  if (!Number.isFinite(frequencyHz) || !Number.isFinite(tonicHz) || frequencyHz <= 0 || tonicHz <= 0) return null;
  const midiOffset = 12 * Math.log2(frequencyHz / tonicHz), semitones = Math.round(midiOffset), octave = Math.floor(semitones / 12);
  const degree = ((semitones % 12) + 12) % 12, note = NOTE_TARGETS.reduce((a, n) => Math.abs(n.degree - degree) < Math.abs(a.degree - degree) ? n : a);
  const cents = 1200 * Math.log2(frequencyHz / (tonicHz * 2 ** (semitones / 12)));
  const tolerance = options.toleranceCents ?? 50;
  return { ...note, octave, frequencyHz, targetHz: tonicHz * note.ratio * 2 ** octave, cents, inTune: Math.abs(cents) <= tolerance, classification: Math.abs(cents) <= tolerance ? 'in-tune' : cents < 0 ? 'flat' : 'sharp' };
}
export const classifyFrequency = frequencyToNote;
export function targetFrequency(swara = 'Sa', tonicHz = 261.63) { const target = NOTE_TARGETS.find((note) => note.swara === swara); return target && Number.isFinite(tonicHz) && tonicHz > 0 ? tonicHz * target.ratio : null; }
export function centsBetween(frequencyHz, targetHz) { return Number.isFinite(frequencyHz) && Number.isFinite(targetHz) && frequencyHz > 0 && targetHz > 0 ? 1200 * Math.log2(frequencyHz / targetHz) : null; }
export function frameToObservation(frame, tonicHz, options = {}) {
  if (!frame || frame.voiced !== true || !Number.isFinite(frame.frequencyHz)) return { ...frame, centsError: null, targetFrequencyHz: targetFrequency(options.targetNote, tonicHz), targetNote: options.targetNote ?? 'Sa', voiced: false };
  const targetFrequencyHz = options.targetFrequencyHz ?? targetFrequency(options.targetNote ?? 'Sa', tonicHz);
  const centsError = centsBetween(frame.frequencyHz, targetFrequencyHz);
  return { ...frame, centsError, targetFrequencyHz, targetNote: options.targetNote ?? 'Sa', voiced: centsError !== null };
}
