export const EXERCISES = Object.freeze([
  { id: 'sa-sustain', nameKey: 'exercises.saSustain.name', descriptionKey: 'exercises.saSustain.description', instructionKey: 'exercises.saSustain.instruction', notes: ['Sa'], durationSeconds: 10, toleranceCents: 50, level: 1, tradition: 'Hindustani' },
  { id: 'sa-re-ga', nameKey: 'exercises.saReGa.name', descriptionKey: 'exercises.saReGa.description', instructionKey: 'exercises.saReGa.instruction', notes: ['Sa', 'Re', 'Ga'], durationSeconds: 15, toleranceCents: 50, level: 2, tradition: 'Hindustani', limited: true },
  { id: 'ascending-sargam', nameKey: 'exercises.ascendingSargam.name', descriptionKey: 'exercises.ascendingSargam.description', instructionKey: 'exercises.ascendingSargam.instruction', notes: ['Sa', 'Re', 'Ga', 'Ma', 'Pa', 'Dha', 'Ni', 'Sa'], targetNotes: ['Sa', 'Re', 'Ga', 'Ma', 'Pa', 'Dha', 'Ni', 'Sa'], durationSeconds: 30, toleranceCents: 50, level: 2, tradition: 'Hindustani', limited: true },
]);
const byId = new Map(EXERCISES.map((exercise) => [exercise.id, exercise]));
export function getExercise(id) { return id === 'sa-re-ga-ma' ? { ...byId.get('sa-re-ga'), id: 'sa-re-ga-ma', targetNotes: ['Sa', 'Re', 'Ga', 'Ma'] } : byId.get(id) ?? null; }
export const lookupExercise = getExercise;
export function validateExerciseId(id) { return typeof id === 'string' && byId.has(id); }
export const exerciseIds = Object.freeze(EXERCISES.map(({ id }) => id));
export const exercises = EXERCISES;
export function evaluateSequence(frames = [], exercise, targetFrequency, centsBetween) {
  if (!exercise || !Array.isArray(frames)) return { completed: false, reliableFrameCount: 0 };
  const valid = frames.filter((frame, index) => frame?.voiced === true && Number.isFinite(frame.frequencyHz) && Math.abs(centsBetween(frame.frequencyHz, targetFrequency(exercise.targetNotes?.[index] ?? exercise.notes?.[index] ?? 'Sa'))) <= (exercise.toleranceCents ?? 50));
  return { completed: valid.length === (exercise.targetNotes?.length ?? exercise.notes?.length ?? 0), reliableFrameCount: valid.length };
}
export const sequenceExercise = { ...EXERCISES.find((exercise) => exercise.id === 'sa-re-ga'), id: 'sa-re-ga-ma', targetNotes: ['Sa', 'Re', 'Ga', 'Ma'] };
export const getExerciseWithAliases = (id) => id === sequenceExercise.id ? sequenceExercise : getExercise(id);
