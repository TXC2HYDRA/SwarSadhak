import { exerciseIds, getExercise } from '@swarsadhak/exercises';

export const ROUTINE_LIMITS = Object.freeze({ minItemSeconds: 10, maxItemSeconds: 900, maxTotalSeconds: 3600, maxItems: 20 });
export const SECTION_TYPES = Object.freeze(['warmup', 'main', 'cooldown']);
export const STARTER_ROUTINES = Object.freeze([{ id: 'routine-morning-foundation', nameKey: 'routines.morningFoundation.name', descriptionKey: 'routines.morningFoundation.description', sections: [{ id: 'warmup', type: 'warmup', titleKey: 'routineSections.warmup', items: [{ id: 'warmup-sa', exerciseId: 'sa-sustain', durationSeconds: 30 }] }, { id: 'main', type: 'main', titleKey: 'routineSections.main', items: [{ id: 'main-pitch', exerciseId: 'pitch-match', durationSeconds: 60 }] }, { id: 'cooldown', type: 'cooldown', titleKey: 'routineSections.cooldown', items: [{ id: 'cooldown-sa', exerciseId: 'sa-sustain', durationSeconds: 30 }] }] }]);
const error = (message) => { throw new RangeError(message); };
export function validateRoutine(routine) {
  if (!routine || typeof routine !== 'object' || !routine.id || !routine.nameKey) error('routine id and nameKey are required');
  if (!Array.isArray(routine.sections) || routine.sections.length !== 3) error('routine must have warmup, main, and cooldown sections');
  const all = []; let total = 0;
  routine.sections.forEach((section, index) => { if (section.type !== SECTION_TYPES[index]) error('routine sections must be ordered'); if (!Array.isArray(section.items)) error('section items are required'); section.items.forEach((item) => { if (!item.id || !exerciseIds.includes(item.exerciseId)) error(`invalid exercise id: ${item.exerciseId}`); if (!Number.isFinite(item.durationSeconds) || item.durationSeconds < ROUTINE_LIMITS.minItemSeconds || item.durationSeconds > ROUTINE_LIMITS.maxItemSeconds) error('duration must be between 10 and 900 seconds'); all.push(item); total += item.durationSeconds; }); });
  if (all.length > ROUTINE_LIMITS.maxItems) error('routine has too many items'); if (total > ROUTINE_LIMITS.maxTotalSeconds) error('routine exceeds 60 minutes');
  return true;
}
export function normalizeRoutine(routine) { validateRoutine(routine); return structuredClone(routine); }
export function routineItems(routine) { return routine.sections.flatMap((section) => section.items.map((item) => ({ ...item, sectionType: section.type, exercise: getExercise(item.exerciseId) }))); }
export function totalRoutineSeconds(routine) { return routineItems(routine).reduce((sum, item) => sum + item.durationSeconds, 0); }
export function createRoutine({ id = `routine-${Date.now()}`, nameKey = 'routines.custom.name', descriptionKey = 'routines.custom.description', sections } = {}) { return normalizeRoutine({ id, nameKey, descriptionKey, sections: sections || SECTION_TYPES.map((type) => ({ id: type, type, titleKey: `routineSections.${type}`, items: [] })) }); }

export function nextRoutineIndex(completedIndex, itemCount) {
  if (!Number.isInteger(itemCount) || itemCount <= 0) return -1;
  if (!Number.isInteger(completedIndex) || completedIndex < 0) return 0;
  return completedIndex >= itemCount - 1 ? itemCount : completedIndex + 1;
}

export function routineTransition(completedIndex, itemCount) {
  const nextIndex = nextRoutineIndex(completedIndex, itemCount);
  return { nextIndex, completed: nextIndex === itemCount };
}
