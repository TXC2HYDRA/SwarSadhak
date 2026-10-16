export const exercises = Object.freeze([
  { id: 'sa-sustain', nameKey: 'exercises.saSustain.name', descriptionKey: 'exercises.saSustain.description', instructionKey: 'exercises.saSustain.instructions', tradition: 'hindustani', level: 'beginner', durationSeconds: 8, targetNotes: ['Sa'], success: { maxAbsoluteCents: 50, minimumReliableRatio: 0.5 } },
  { id: 'pitch-match', nameKey: 'exercises.pitchMatch.name', descriptionKey: 'exercises.pitchMatch.description', instructionKey: 'exercises.pitchMatch.instructions', tradition: 'hindustani', level: 'beginner', durationSeconds: 8, targetNotes: ['Sa'], success: { maxAbsoluteCents: 45, minimumReliableRatio: 0.5 } },
  { id: 'sa-practice', nameKey: 'exercises.saPractice.name', descriptionKey: 'exercises.saPractice.description', instructionKey: 'exercises.saPractice.instructions', tradition: 'hindustani', level: 'beginner', durationSeconds: 12, targetNotes: ['Sa'], success: { maxAbsoluteCents: 50, minimumReliableRatio: 0.5 } },
  { id: 'sa-re-ga-ma', nameKey: 'exercises.saReGaMa.name', descriptionKey: 'exercises.saReGaMa.description', instructionKey: 'exercises.saReGaMa.instructions', tradition: 'hindustani', level: 'beginner', durationSeconds: 20, targetNotes: ['Sa', 'Re', 'Ga', 'Ma'], success: { maxAbsoluteCents: 60, minimumReliableRatio: 0.5 } }
  ,{ id: 'ascending-sargam', nameKey: 'exercises.saReGaMa.name', descriptionKey: 'exercises.saReGaMa.description', instructionKey: 'exercises.saReGaMa.instructions', tradition: 'hindustani', level: 'beginner', durationSeconds: 20, targetNotes: ['Sa', 'Re', 'Ga', 'Ma', 'Pa', 'Dha', 'Ni', 'Sa'], success: { maxAbsoluteCents: 60, minimumReliableRatio: 0.5 } }
]);
export const getExercise = (id) => exercises.find((exercise) => exercise.id === id) ?? null;
export function evaluateSequence(measurements, exercise, targetForNote, centsBetween) {
  if (!exercise || !Array.isArray(measurements)) return { completed: false, reliableRatio: 0, matchedTargets: 0 };
  let reliable = 0; let matchedTargets = 0;
  measurements.forEach((measurement, index) => { if (!measurement?.voiced || !Number.isFinite(measurement.frequencyHz)) return; reliable += 1; const note = exercise.targetNotes[Math.min(index, exercise.targetNotes.length - 1)]; const cents = centsBetween(measurement.frequencyHz, targetForNote(note)); if (Math.abs(cents) <= exercise.success.maxAbsoluteCents) matchedTargets += 1; });
  const reliableRatio = measurements.length ? reliable / measurements.length : 0;
  return { completed: reliableRatio >= exercise.success.minimumReliableRatio && matchedTargets >= exercise.targetNotes.length, reliableRatio, matchedTargets };
}
