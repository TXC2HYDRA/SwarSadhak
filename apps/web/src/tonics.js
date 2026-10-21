import { noteToFrequency } from '@swarsadhak/musical-core';

export const TONIC_NOTES = Object.freeze(['A3', 'A#3', 'B3', 'C4', 'C#4', 'D4', 'D#4', 'E4', 'F4', 'F#4', 'G4', 'G#4']);
const KEY_NAMES = Object.freeze({ A: 'pandhari6', 'A#': 'kali5', B: 'pandhari7', C: 'pandhari1', 'C#': 'kali1', D: 'pandhari2', 'D#': 'kali2', E: 'pandhari3', F: 'pandhari4', 'F#': 'kali3', G: 'pandhari5', 'G#': 'kali4' });
export const TONICS = Object.freeze(TONIC_NOTES.map((note) => ({
  note: note.replace(/\d$/, ''),
  value: Number(noteToFrequency(note).toFixed(2)),
  labelKey: `tonics.${KEY_NAMES[note.replace(/\d$/, '')]}`,
  key: KEY_NAMES[note.replace(/\d$/, '')],
  pitch: note,
})));
