import test from 'node:test';
import assert from 'node:assert/strict';
import { STARTER_ROUTINES, validateRoutine, totalRoutineSeconds, routineItems, nextRoutineIndex, routineTransition } from '@swarsadhak/routines';
import { deriveRewards, deriveAchievements, getLevel, getStreak } from '@swarsadhak/gamification';
import { createStorage } from '@swarsadhak/persistence';

const session = (id, startedAt, extra = {}) => ({ id, startedAt, endedAt: startedAt, durationSeconds: 20, metrics: { reliableFrameCount: 1 }, completion: { completed: true }, ...extra });
test('starter routine is ordered, bounded, and uses canonical exercises', () => { assert.equal(validateRoutine(STARTER_ROUTINES[0]), true); assert.equal(totalRoutineSeconds(STARTER_ROUTINES[0]), 120); assert.equal(routineItems(STARTER_ROUTINES[0]).length, 3); });
test('routine validation rejects unknown, zero, negative, and oversized values', () => { for (const durationSeconds of [0, -1, 901]) { const r = structuredClone(STARTER_ROUTINES[0]); r.sections[0].items[0].durationSeconds = durationSeconds; assert.throws(() => validateRoutine(r)); } const bad = structuredClone(STARTER_ROUTINES[0]); bad.sections[0].items[0].exerciseId = 'unknown'; assert.throws(() => validateRoutine(bad)); });
test('all deterministic reward rules are awarded once with stable IDs', () => {
  const s = session('s1', '2026-10-16T10:00:00Z', { routineId: 'r1', routineCompleted: true, sectionType: 'warmup' });
  const s2 = session('s2', '2026-10-17T10:00:00Z', { sectionType: 'cooldown' });
  const rewards = deriveRewards([s, s2]);
  assert.deepEqual(rewards.map((r) => r.type), ['practice-item-completed', 'routine-completed', 'warmup-completed', 'first-practice', 'practice-item-completed', 'cooldown-completed', 'new-practice-day']);
  assert.equal(deriveRewards([s, s2], rewards).length, rewards.length);
});
test('invalid, cancelled, and unreliable sessions earn nothing', () => {
  const good = session('good', '2026-10-16T10:00:00Z');
  assert.equal(deriveRewards([{ ...good, metrics: { reliableFrameCount: 0 } }]).length, 0);
  assert.equal(deriveRewards([{ ...good, completion: { completed: false } }]).length, 0);
  assert.equal(deriveRewards([{ ...good, durationSeconds: 9 }]).length, 0);
});
test('achievements include routine metadata and streaks respect timezone and disabled state', () => {
  const sessions = [session('a', '2026-10-15T03:30:00Z', { routineId: 'r', routineCompleted: true }), session('b', '2026-10-15T04:30:00Z'), session('c', '2026-10-16T04:30:00Z')];
  assert.ok(deriveAchievements(sessions, [], { timezone: 'America/New_York' }).some((a) => a.id === 'first-routine' && a.earned));
  assert.equal(getStreak(sessions, true, 'America/New_York'), 3);
  assert.equal(getStreak(sessions, false, 'America/New_York'), 0);
  assert.equal(getStreak(sessions, true, 'UTC'), 2);
  assert.deepEqual(getLevel(120), { level: 2, next: 200, progress: 20 });
});
test('routine transition completes after the final item and never repeats it', () => {
  assert.equal(nextRoutineIndex(0, 3), 1);
  assert.equal(nextRoutineIndex(2, 3), 3);
  assert.deepEqual(routineTransition(2, 3), { nextIndex: 3, completed: true });
});
test('skipped routine items do not award XP', () => {
  assert.equal(deriveRewards([session('skipped', '2026-10-16T10:00:00Z', { completion: { completed: false } })]).length, 0);
});
test('storage reports persistence failures without claiming success', () => {
  const failing = { getItem: () => null, setItem: () => { throw new Error('full'); }, removeItem: () => {} };
  const result = createStorage(failing).set('streak', false);
  assert.equal(result.ok, false);
});
