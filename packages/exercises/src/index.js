export const EXERCISES = Object.freeze([
  { id: 'sa-sustain', nameKey: 'exercises.saSustain.name', descriptionKey: 'exercises.saSustain.description', instructionKey: 'exercises.saSustain.instruction', notes: ['Sa'], durationSeconds: 10, toleranceCents: 50, level: 1, tradition: 'Hindustani' },
  // Keep the legacy id so existing routines and stored sessions remain readable;
  // the user-facing concept is now Alankar and the full Alankar catalogue below
  // is the entry point for this practice mode.
  { id: 'sa-re-ga', nameKey: 'alankar.name', descriptionKey: 'alankar.description', instructionKey: 'alankar.instruction', notes: ['Sa', 'Re', 'Ga'], durationSeconds: 15, toleranceCents: 50, level: 2, tradition: 'Hindustani', limited: true },
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

export const SWARAS = Object.freeze(['Sa', 'Re', 'Ga', 'Ma', 'Pa', 'Dha', 'Ni', 'Sa']);

const freezeGroups = (groups) => Object.freeze(groups.map((group) => Object.freeze([...group])));
const makePattern = (id, nameKey, aroha, avaroha) => Object.freeze({
  id,
  nameKey,
  aroha: freezeGroups(aroha),
  avaroha: freezeGroups(avaroha),
});
const descending = [...SWARAS].reverse();
const windows = (notes, size) => notes.slice(0, -(size - 1)).map((_, index) => notes.slice(index, index + size));

// These are deliberately represented as groups rather than a single flat list.
// The group boundaries are part of the practice contract and are used by the
// timed pitch matcher to keep each phrase together.
export const ALANKARS = Object.freeze([
  makePattern('alankar-1', 'alankars.pattern1', SWARAS.map((swara) => [swara]), [...SWARAS].reverse().map((swara) => [swara])),
  makePattern('alankar-2', 'alankars.pattern2', SWARAS.map((swara) => [swara, swara]), [...SWARAS].reverse().map((swara) => [swara, swara])),
  makePattern('alankar-3', 'alankars.pattern3', windows(SWARAS, 2), windows(descending, 2)),
  makePattern('alankar-4', 'alankars.pattern4', windows(SWARAS, 3), windows(descending, 3)),
]);

const alankarById = new Map(ALANKARS.map((pattern) => [pattern.id, pattern]));
export const getAlankar = (id) => alankarById.get(id) ?? null;
export const alankarIds = Object.freeze(ALANKARS.map(({ id }) => id));

export function flattenAlankarGroups(groups = []) {
  return groups.flatMap((group) => group);
}

export function alankarGroups(pattern, direction = 'full') {
  const value = typeof pattern === 'string' ? getAlankar(pattern) : pattern;
  if (!value) return [];
  if (direction === 'aaroha') return value.aroha;
  if (direction === 'avaroha') return value.avaroha;
  return [...value.aroha, ...value.avaroha];
}

export const ALANKAR_OCTAVES = Object.freeze({ lower: 'lower', middle: 'middle', higher: 'higher' });

const annotateGroups = (groups, direction) => {
  const firstSaGroup = groups.findIndex((group) => group.includes('Sa'));
  const lastSaGroup = groups.length - 1 - [...groups].reverse().findIndex((group) => group.includes('Sa'));
  return groups.map((group, groupIndex) => group.map((swara) => ({
    swara,
    octave: swara !== 'Sa'
      ? ALANKAR_OCTAVES.middle
      : direction === 'aaroha' && groupIndex === lastSaGroup
        ? ALANKAR_OCTAVES.higher
        : direction === 'avaroha' && groupIndex === firstSaGroup
          ? ALANKAR_OCTAVES.higher
          : direction === 'avaroha' && groupIndex === lastSaGroup
            ? ALANKAR_OCTAVES.lower
            : ALANKAR_OCTAVES.middle,
  })));
};

/** Return display metadata without changing the canonical pitch/group data. */
export function alankarDisplayGroups(pattern, direction = 'full') {
  const value = typeof pattern === 'string' ? getAlankar(pattern) : pattern;
  if (!value) return [];
  if (direction === 'aaroha') return annotateGroups(value.aroha, 'aaroha');
  if (direction === 'avaroha') return annotateGroups(value.avaroha, 'avaroha');
  return [...annotateGroups(value.aroha, 'aaroha'), ...annotateGroups(value.avaroha, 'avaroha')];
}
