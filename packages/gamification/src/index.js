export const XP_RULES = Object.freeze({ item: 10, routine: 25, firstPractice: 20, newDay: 5, warmup: 3, cooldown: 3 });
export const ACHIEVEMENTS = Object.freeze([
  { id: 'first-practice', titleKey: 'achievements.firstPractice.title', descriptionKey: 'achievements.firstPractice.description' },
  { id: 'first-routine', titleKey: 'achievements.firstRoutine.title', descriptionKey: 'achievements.firstRoutine.description' },
  { id: 'three-sessions', titleKey: 'achievements.threeSessions.title', descriptionKey: 'achievements.threeSessions.description' },
  { id: 'five-minutes', titleKey: 'achievements.fiveMinutes.title', descriptionKey: 'achievements.fiveMinutes.description' },
  { id: 'warmup', titleKey: 'achievements.warmup.title', descriptionKey: 'achievements.warmup.description' },
  { id: 'cooldown', titleKey: 'achievements.cooldown.title', descriptionKey: 'achievements.cooldown.description' },
  { id: 'three-days', titleKey: 'achievements.threeDays.title', descriptionKey: 'achievements.threeDays.description' },
]);

// Participation is deliberately stricter than merely having a completed flag.
export const isValidParticipation = (session) => Boolean(session && session.completion?.completed === true
  && Number.isFinite(Number(session.durationSeconds)) && Number(session.durationSeconds) >= 10
  && Number(session.metrics?.reliableFrameCount ?? session.reliableFrameCount) > 0);
const valid = isValidParticipation;
const dayIn = (value, timezone = 'UTC') => {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value)); }
  catch { return null; }
};
const add = (events, ids, event) => { if (!ids.has(event.id)) { events.push(event); ids.add(event.id); } };

export function deriveRewards(sessions = [], existing = [], options = {}) {
  const timezone = options.timezone || 'UTC';
  const events = [...existing]; const ids = new Set(events.map((event) => event.id));
  const completed = sessions.filter(valid).sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
  const days = new Set();
  completed.forEach((s, index) => {
    const day = dayIn(s.startedAt, timezone); if (!day) return;
    add(events, ids, { id: `reward-${s.id}-item`, type: 'practice-item-completed', sourceId: s.id, xp: XP_RULES.item, awardedAt: s.endedAt || s.startedAt, participation: true });
    if (s.routineCompleted === true) add(events, ids, { id: `reward-${s.id}-routine`, type: 'routine-completed', sourceId: s.id, xp: XP_RULES.routine, awardedAt: s.endedAt || s.startedAt, participation: true });
    if (s.sectionType === 'warmup') add(events, ids, { id: `reward-${s.id}-warmup`, type: 'warmup-completed', sourceId: s.id, xp: XP_RULES.warmup, awardedAt: s.endedAt || s.startedAt, participation: true });
    if (s.sectionType === 'cooldown') add(events, ids, { id: `reward-${s.id}-cooldown`, type: 'cooldown-completed', sourceId: s.id, xp: XP_RULES.cooldown, awardedAt: s.endedAt || s.startedAt, participation: true });
    if (index === 0) add(events, ids, { id: 'reward-first-practice', type: 'first-practice', sourceId: s.id, xp: XP_RULES.firstPractice, awardedAt: s.endedAt || s.startedAt, participation: true });
    if (!days.has(day)) { if (days.size > 0) add(events, ids, { id: `reward-new-day-${day}`, type: 'new-practice-day', sourceId: s.id, day, xp: XP_RULES.newDay, awardedAt: s.endedAt || s.startedAt, participation: true }); days.add(day); }
  });
  return events;
}

export function deriveAchievements(sessions = [], rewards = [], options = {}) {
  const validSessions = sessions.filter(valid); const days = new Set(validSessions.map((s) => dayIn(s.startedAt, options.timezone || 'UTC')).filter(Boolean));
  const totalMinutes = validSessions.reduce((n, s) => n + Number(s.durationSeconds || 0), 0) / 60; const ids = [];
  if (validSessions.length >= 1) ids.push('first-practice'); if (validSessions.some((s) => s.routineId && s.routineCompleted)) ids.push('first-routine');
  if (validSessions.length >= 3) ids.push('three-sessions'); if (totalMinutes >= 5) ids.push('five-minutes');
  if (validSessions.some((s) => s.sectionType === 'warmup')) ids.push('warmup'); if (validSessions.some((s) => s.sectionType === 'cooldown')) ids.push('cooldown'); if (days.size >= 3) ids.push('three-days');
  return ACHIEVEMENTS.filter((a) => ids.includes(a.id)).map((a) => ({ ...a, earned: true }));
}
export function getLevel(xp = 0) { const level = Math.floor(xp / 100) + 1; return { level, next: level * 100, progress: xp % 100 }; }
export function getStreak(sessions = [], enabled = true, timezone = 'UTC') {
  if (!enabled) return 0; const days = [...new Set(sessions.filter(valid).map((s) => dayIn(s.startedAt, timezone)).filter(Boolean))].sort().reverse();
  let streak = 0; let cursor = days[0]; for (const day of days) { if (!cursor || day !== cursor) break; streak++; const date = new Date(`${cursor}T12:00:00Z`); date.setUTCDate(date.getUTCDate() - 1); cursor = date.toISOString().slice(0, 10); } return streak;
}
