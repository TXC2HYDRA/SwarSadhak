export const EXERCISES = Object.freeze([
  { id: 'sa-sustain', nameKey: 'exercises.saSustain.name', descriptionKey: 'exercises.saSustain.description', instructionKey: 'exercises.saSustain.instruction', notes: ['Sa'], durationSeconds: 10, toleranceCents: 50, level: 1, tradition: 'Hindustani' },
  { id: 'pitch-match', nameKey: 'exercises.pitchMatch.name', descriptionKey: 'exercises.pitchMatch.description', instructionKey: 'exercises.pitchMatch.instruction', notes: ['Sa'], durationSeconds: 10, toleranceCents: 50, level: 1, tradition: 'Hindustani' },
  { id: 'sa-re-ga', nameKey: 'exercises.saReGa.name', descriptionKey: 'exercises.saReGa.description', instructionKey: 'exercises.saReGa.instruction', notes: ['Sa', 'Re', 'Ga'], durationSeconds: 15, toleranceCents: 50, level: 2, tradition: 'Hindustani', limited: true },
  { id: 'ascending-sargam', nameKey: 'exercises.ascendingSargam.name', descriptionKey: 'exercises.ascendingSargam.description', instructionKey: 'exercises.ascendingSargam.instruction', notes: ['Sa', 'Re', 'Ga', 'Ma', 'Pa', 'Dha', 'Ni', 'Sa'], durationSeconds: 30, toleranceCents: 50, level: 2, tradition: 'Hindustani', limited: true },
]);
const byId = new Map(EXERCISES.map((exercise) => [exercise.id, exercise]));
export function getExercise(id) { return byId.get(id) ?? null; }
export const lookupExercise = getExercise;
export function validateExerciseId(id) { return typeof id === 'string' && byId.has(id); }
export const exerciseIds = Object.freeze(EXERCISES.map(({ id }) => id));
