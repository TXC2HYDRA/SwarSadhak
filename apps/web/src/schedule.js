// Weekly batch schedule helpers. Batches store wall-clock HH:MM in the academy timezone.
// Calendar dates are plain YYYY-MM-DD strings computed in UTC, so neither the viewer's own
// timezone nor a DST change can shift a class to another day or hour.
export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const SLOT_MINUTES = 30;
export const DEFAULT_RANGE = { start: 6 * 60, end: 22 * 60 };
const LAST_MINUTE = 23 * 60 + 59;

export const toMinutes = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
export const fromMinutes = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

const parse = (isoDate) => new Date(`${isoDate}T00:00:00Z`);
export const addDays = (isoDate, days) => { const date = parse(isoDate); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); };
export const mondayOf = (isoDate) => addDays(isoDate, -((parse(isoDate).getUTCDay() + 6) % 7));
export const weekDates = (monday) => DAYS.map((_, index) => addDays(monday, index));
export const todayIn = (timeZone, now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

export function weekOccurrences(batches, monday) {
  const dates = weekDates(monday);
  return batches.flatMap((batch) => batch.days.map((day) => ({ batch, dayIndex: DAYS.indexOf(day), date: dates[DAYS.indexOf(day)] })))
    .filter(({ batch, date }) => !batch.starts_on || date >= batch.starts_on);
}

// Whole hours around the batches with an hour of air either side, at least MIN_HOURS tall.
// No batches: DEFAULT_RANGE. "Create batch" still accepts any time outside the visible hours.
const MIN_HOURS = 8;
export function visibleRange(batches, range = DEFAULT_RANGE) {
  if (!batches.length) return range;
  let start = Math.max(0, Math.min(...batches.map((batch) => Math.floor(toMinutes(batch.start_time) / 60) * 60)) - 60);
  let end = Math.min(24 * 60, Math.max(...batches.map((batch) => Math.ceil(toMinutes(batch.end_time) / 60) * 60)) + 60);
  const missing = MIN_HOURS * 60 - (end - start);
  if (missing > 0) { end = Math.min(24 * 60, end + Math.ceil(missing / 120) * 60); start = Math.max(0, end - MIN_HOURS * 60); }
  return { start, end };
}

// Active classes on one date, earliest first.
export const classesOn = (batches, date) => weekOccurrences(batches.filter((batch) => batch.status === 'active'), mondayOf(date))
  .filter((item) => item.date === date).sort((a, b) => a.batch.start_time.localeCompare(b.batch.start_time));

// The class running now or next: today's first class that has not ended, else the next day with a class (up to a week ahead).
export function nextClass(batches, today, nowHHMM) {
  const current = classesOn(batches, today).find(({ batch }) => batch.end_time > nowHHMM);
  if (current) return current;
  for (let day = 1; day <= 7; day += 1) { const [first] = classesOn(batches, addDays(today, day)); if (first) return first; }
  return null;
}

export const nowIn = (timeZone, now = new Date()) => new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);

export function formatTime(hhmm, locale = 'en') {
  const minutes = toMinutes(hhmm);
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC' }).format(new Date(Date.UTC(2000, 0, 1, Math.floor(minutes / 60), minutes % 60)));
}
export const formatDate = (isoDate, locale, options) => new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...options }).format(parse(isoDate));

export function slotForm(dayIndex, startMinutes, durationMinutes = 60) {
  return { days: [DAYS[dayIndex]], start_time: fromMinutes(startMinutes), end_time: fromMinutes(Math.min(startMinutes + durationMinutes, LAST_MINUTE)) };
}

// Same rule as the API (apps/api/app/meetings.py): returns https://meet.google.com/abc-defg-hij for a pasted
// Meet link (missing scheme, capitals, trailing slash or query allowed), or null. The server has the final say.
export function meetLink(raw = '') {
  let value = String(raw || '').trim();
  if (!value) return null;
  if (!value.includes('://')) value = `https://${value}`;
  let url;
  try { url = new URL(value); } catch { return null; }
  const code = url.pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
  const ok = url.protocol === 'https:' && url.hostname === 'meet.google.com' && !url.port && !url.username && !url.password && /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(code);
  return ok ? `https://meet.google.com/${code}` : null;
}

// Dated classes come from /api/{role}/classes, sorted, with cancellations and moves applied. A class's state
// follows the timetable only: "live" means it is class time, not that anyone has joined the call.
// Start class / Join class appear from JOIN_EARLY_MINUTES before the start until the end.
export const JOIN_EARLY_MINUTES = 15;
export function classState(k, today, clock) {
  if (k.status === 'cancelled') return 'cancelled';
  if (k.date !== today) return k.date < today ? 'finished' : 'scheduled';
  if (k.end_time <= clock) return 'finished';
  if (k.start_time <= clock) return 'live';
  return toMinutes(k.start_time) - toMinutes(clock) <= JOIN_EARLY_MINUTES ? 'soon' : 'scheduled';
}
export const canJoin = (k, today, clock) => k.class_mode !== 'offline' && !!meetLink(k.meeting_url) && ['soon', 'live'].includes(classState(k, today, clock));
// The class running now or next, skipping cancelled ones.
export const nextOf = (classes, today, clock) => classes.find((k) => k.status !== 'cancelled' && (k.date > today || (k.date === today && k.end_time > clock))) || null;
export const classKey = (k) => `${k.batch_id}:${k.original_date}`;

export function batchFormErrors(form) {
  const errors = [];
  if (!form.name.trim()) errors.push('name');
  if (!form.course_id) errors.push('course');
  if (!form.days.length) errors.push('days');
  if (!form.start_time || !form.end_time || form.end_time <= form.start_time) errors.push('endAfterStart');
  if (form.class_mode && form.class_mode !== 'offline' && !meetLink(form.meeting_url)) errors.push('meetingUrl');
  return errors;
}

// "Due 20 Nov 2026" for an assignment's due date (shared by the student timetable strip and the assignments pages).
export const due = (a, date, locale) => (date ? a.dueOn.replace('{date}', formatDate(date, locale, { day: 'numeric', month: 'short', year: 'numeric' })) : '');
