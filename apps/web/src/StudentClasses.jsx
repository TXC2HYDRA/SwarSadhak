import React from 'react';
import { LoadState, useApi } from './PortalShell.jsx';
import { MODE_ICONS, MeetLink, modeLabel, timeRange } from './ClassViews.jsx';
import { DAYS, addDays, canJoin, classKey, classState, formatDate, meetLink, nextClass, nowIn, todayIn } from './schedule.js';
import { Video } from 'lucide-react';
import './portal.css';

// The student's Timetable page, loaded on demand: dated classes coming up (with Join class inside the window),
// class history with the attendance their teacher marked, and the weekly pattern.
export const timetableDays = (batches) => DAYS.map((day, index) => ({ day, index, items: batches.filter((batch) => batch.days.includes(day)) })).filter((day) => day.items.length);

const ATTENDANCE_TONE = { present: 'success', late: 'warning', absent: 'neutral', excused: 'neutral' };

export function ClassList({ t, locale, state, items, today, clock, title, lede, empty, history = false }) {
  const p = t.portal.teacher; const b = t.portal.batches; const c = b.classes;
  const day = (iso) => formatDate(iso, locale, { weekday: 'short', day: 'numeric', month: 'short' });
  const id = history ? 'class-history' : 'class-upcoming';
  return <section className="panel student-classes" aria-labelledby={id}>
    <h2 id={id}>{title}</h2><p className="calendar-note">{lede}</p>
    {state.error || !state.data ? <LoadState t={t} state={state} /> : !items.length ? <p>{empty}</p>
      : <ol className="class-list">{items.map((k) => {
        const timing = classState(k, today, clock);
        const badge = k.status === 'cancelled' ? ['danger', p.cancelled]
          : history ? (k.my_attendance ? [ATTENDANCE_TONE[k.my_attendance], c.statuses[k.my_attendance]] : ['neutral', c.notMarked])
            : timing === 'live' ? ['success', p.live] : timing === 'soon' ? ['next', p.startingSoon] : null;
        return <li key={classKey(k)} className={`is-${timing}`}><div className="class-row">
          <span className="class-when"><strong>{day(k.date)}</strong><span>{timeRange(k, locale)}</span></span>
          <span className="class-what"><strong>{k.batch_name}</strong>
            <small>{[k.course_name, k.teacher_name, modeLabel(b, k), k.status === 'rescheduled' && p.movedFrom.replace('{date}', day(k.original_date)), k.note].filter(Boolean).join(' · ')}</small></span>
          <span className="class-actions">
            {badge && <span className={`status-badge ${badge[0]}`}>{badge[1]}</span>}
            {!history && canJoin(k, today, clock) && <a className="button primary join-link" href={meetLink(k.meeting_url)} target="_blank" rel="noopener noreferrer" aria-label={`${p.joinClass}: ${k.batch_name} (${b.newTab})`}><Video size={16} aria-hidden="true" />{p.joinClass}</a>}
          </span>
        </div></li>;
      })}</ol>}
  </section>;
}

// A weekly list, not a grid: a student has a few classes, and a list reads well on a phone.
export function StudentTimetable({ t, locale = 'en', client, now }) {
  const s = t.portal.student; const b = t.portal.batches;
  const batches = useApi(t, () => client.student.batches());
  const academy = useApi(t, () => client.academy());
  const timezone = academy.data?.timezone || 'Asia/Kolkata';
  const today = todayIn(timezone, now);
  const todayIndex = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  const days = timetableDays(batches.data || []);
  const clock = nowIn(timezone, now);
  const next = batches.data ? nextClass(batches.data, today, clock) : null;
  // One request covers both lists: 30 days back (history) and 7 ahead (coming up).
  const classes = useApi(t, () => client.student.classes(addDays(today, -30), addDays(today, 7)), [today]);
  const ended = (k) => k.date < today || (k.date === today && k.end_time <= clock);
  const upcoming = (classes.data || []).filter((k) => !ended(k));
  const history = (classes.data || []).filter(ended).reverse();
  return <div className="page portal-page student-timetable">
    <h1>{s.title}</h1><p className="page-lede">{s.lede}</p>
    <p className="calendar-note">{b.timezoneNote.replace('{timezone}', timezone)}</p>
    <ClassList t={t} locale={locale} state={classes} items={upcoming} today={today} clock={clock} title={s.upcoming} lede={s.upcomingLede} empty={s.upcomingEmpty} />
    <ClassList t={t} locale={locale} state={classes} items={history} today={today} clock={clock} title={s.history} lede={s.historyLede} empty={s.historyEmpty} history />
    <h2 className="timetable-weekly">{s.weekly}</h2>
    <LoadState t={t} state={batches} empty={s.empty} />
    {days.map(({ day, index, items }) => <section key={day} className={`panel timetable-day${index === todayIndex ? ' is-today' : ''}`} aria-labelledby={`day-${day}`}>
      <h2 id={`day-${day}`}>{b.dayLong[day]}{index === todayIndex && <span className="chip">{s.today}</span>}</h2>
      <ul className="student-list">{items.map((batch) => {
        const isNext = next?.batch.id === batch.id && next.dayIndex === index;
        return <li key={batch.id} className={batch.status === 'paused' ? 'is-paused' : isNext ? 'is-next' : undefined}>
          <strong>{timeRange(batch, locale)} · {batch.name}</strong>
          <small>{batch.course_name} · {s.teacher}: {batch.teacher_name}</small>
          <small className="class-mode">{React.createElement(MODE_ICONS[batch.class_mode || 'offline'], { size: 14, 'aria-hidden': true })}{modeLabel(b, batch)}</small>
          <MeetLink b={b} batch={batch} />
          {(batch.status === 'paused' || isNext) && <span className="chip-row">{batch.status === 'paused' ? <span className="chip">{b.paused}</span> : <span className="status-badge warning">{t.portal.teacher.upNext}</span>}</span>}
        </li>;
      })}</ul>
    </section>)}
  </div>;
}
