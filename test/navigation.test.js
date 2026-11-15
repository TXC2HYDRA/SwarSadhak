import test from 'node:test';
import assert from 'node:assert/strict';
import { EXERCISES } from '@swarsadhak/exercises';
import { STARTER_ROUTINES, createRoutine, routineItems } from '@swarsadhak/routines';
import { clearRoutineCurrent, completeRoutineItem, exerciseRoute, readPreference, routineRunState, skipRoutineItem, writePreference } from '../apps/web/src/navigation.js';

test('preference reads and writes tolerate storage failures and unavailable browser storage', () => {
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); } };
  assert.equal(readPreference('swar-locale', 'en', blocked), 'en');
  assert.equal(readPreference('swar-visited-v1', 'false', blocked), 'false');
  assert.equal(writePreference('swar-visited-v1', 'true', blocked), false);
  assert.equal(writePreference('swar-locale', 'mr', blocked), false);
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('security'); } });
    assert.equal(readPreference('swar-locale', 'en'), 'en');
    assert.equal(writePreference('swar-visited-v1', 'true'), false);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  }
});

test('preferences retain their existing raw-string storage format', () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  assert.equal(readPreference('swar-locale', 'en', storage), 'en');
  assert.equal(writePreference('swar-locale', 'hi', storage), true);
  assert.equal(readPreference('swar-locale', 'en', storage), 'hi');
  assert.equal(writePreference('swar-visited-v1', 'true', storage), true);
  assert.equal(values.get('swar-visited-v1'), 'true');
});

test('all canonical exercise entry points select the alankars picker only for sa-re-ga', () => {
  for (const exercise of EXERCISES) assert.equal(exerciseRoute(exercise), exercise.id === 'sa-re-ga' ? 'alankars' : 'practice');
});

test('routine cursor derives from completedIndex rather than stale current metadata', () => {
  const routine = STARTER_ROUTINES[0];
  const items = routineItems(routine);
  assert.equal(routineRunState(routine).index, 0);
  for (const completedIndex of [0, 1]) {
    const progress = routineRunState({ ...routine, completedIndex, current: items[0] });
    assert.equal(progress.index, completedIndex + 1);
    assert.equal(progress.item.id, items[completedIndex + 1].id);
    assert.equal(progress.completed, false);
  }
  assert.equal(routineRunState({ ...routine, completedIndex: 2 }).completed, true);
  assert.equal(routineRunState({ ...routine, routineCompleted: true }).item, null);
  assert.equal(routineRunState(createRoutine()).empty, true);
  assert.equal(routineRunState(createRoutine()).completed, false);
  assert.equal(routineRunState(null).item, null);
});

test('skip cursor survives navigation without recording completed practice or mutating the routine', () => {
  const original = { ...STARTER_ROUTINES[0], completedIndex: 0, current: routineItems(STARTER_ROUTINES[0])[1] };
  const before = structuredClone(original);
  const skipped = skipRoutineItem(original);
  assert.equal(skipped.completedIndex, 0);
  assert.equal(skipped.current, null);
  assert.equal(routineRunState(skipped).index, 2);
  const detached = clearRoutineCurrent({ ...skipped, current: routineRunState(skipped).item });
  assert.equal(detached.current, null);
  assert.equal(routineRunState(detached).index, 2);
  const exhausted = skipRoutineItem(detached);
  assert.equal(exhausted.completedIndex, 0);
  assert.equal(exhausted.routineCompleted, undefined);
  assert.equal(routineRunState(exhausted).completed, true);
  assert.equal(routineRunState(exhausted).item, null);
  assert.deepEqual(original, before);
});

test('completing a routine item advances the cursor and clears session attribution', () => {
  const routine = { ...STARTER_ROUTINES[0], current: routineItems(STARTER_ROUTINES[0])[0] };
  const next = completeRoutineItem(routine, 0);
  assert.equal(next.current, null);
  assert.equal(next.completedIndex, 0);
  assert.equal(next.routineCompleted, false);
  assert.equal(routineRunState(next).index, 1);
  const last = completeRoutineItem(next, 2);
  assert.equal(last.routineCompleted, true);
  assert.equal(routineRunState(last).item, null);
  assert.equal(clearRoutineCurrent(null), null);
});
