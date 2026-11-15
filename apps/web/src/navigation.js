import { nextRoutineIndex, routineItems } from '@swarsadhak/routines';

// Browser preferences are best-effort: storage restrictions must not stop the UI.
export function readPreference(key, fallback, storage) {
  try { return (storage ?? globalThis.localStorage)?.getItem(key) ?? fallback; } catch { return fallback; }
}

export function writePreference(key, value, storage) {
  try {
    const backend = storage ?? globalThis.localStorage;
    if (!backend) return false;
    backend.setItem(key, value);
    return true;
  } catch { return false; }
}

export function exerciseRoute(exercise) {
  return exercise.id === 'sa-re-ga' ? 'alankars' : 'practice';
}

export function clearRoutineCurrent(routine) {
  return routine?.current ? { ...routine, current: null } : routine;
}

export function routineRunState(routine) {
  const items = routine ? routineItems(routine) : [];
  const afterCompleted = nextRoutineIndex(routine?.completedIndex ?? -1, items.length);
  // Skips advance the cursor without claiming a completed practice item.
  const skippedTo = Number.isInteger(routine?.nextIndex) ? routine.nextIndex : 0;
  const index = items.length ? Math.min(items.length, Math.max(afterCompleted, skippedTo)) : -1;
  const empty = items.length === 0;
  const completed = !empty && (routine?.routineCompleted === true || index === items.length);
  return { items, index, empty, completed, item: completed ? null : items[index] ?? null };
}

export function skipRoutineItem(routine) {
  const { index, items, item } = routineRunState(routine);
  if (!item) return clearRoutineCurrent(routine);
  return { ...routine, current: null, nextIndex: nextRoutineIndex(index, items.length) };
}

export function completeRoutineItem(routine, itemIndex) {
  const itemCount = routineItems(routine).length;
  return { ...routine, current: null, completedIndex: itemIndex, nextIndex: nextRoutineIndex(itemIndex, itemCount), routineCompleted: itemIndex === itemCount - 1 };
}
