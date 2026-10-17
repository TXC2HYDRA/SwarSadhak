import { noteToFrequency } from '@swarsadhak/musical-core';

export const TONIC_NOTES = Object.freeze(['A3', 'A#3', 'B3', 'C4', 'C#4', 'D4', 'D#4', 'E4', 'F4', 'F#4', 'G4', 'G#4']);
export const TONICS = Object.freeze(TONIC_NOTES.map((note) => ({
  note: note.replace(/\d$/, ''),
  value: Number(noteToFrequency(note).toFixed(2)),
  label: `${note.replace(/\d$/, '')} · ${noteToFrequency(note).toFixed(2)} Hz`,
})));
