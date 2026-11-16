import React from 'react';
import { ArrowRight } from 'lucide-react';
import { LoadState, useApi } from './PortalShell.jsx';
import { TodayPanel, timeRange } from './BatchCalendar.jsx';
import { due } from './Assignments.jsx';
import { DAYS, nextClass, nowIn, todayIn } from './schedule.js';
import './portal.css';

export const timetableDays = (batches) => DAYS.map((day, index) => ({ day, index, items: batches.filter((batch) => batch.days.includes(day)) })).filter((day) => day.items.length);

// Not handed in yet: no answer, or only a draft. The API already sorts by due date.
export const openAssignments = (items = []) => items.filter((item) => !item.submission || item.submission.status === 'draft');

// A weekly list, not a grid: a student has a few classes, and a list reads well on a phone.
export function StudentTimetable({ t, locale = 'en', client, now }) {
  const s = t.portal.student; const b = t.portal.batches;
  const batches = useApi(t, () => client.student.batches());
  const academy = useApi(t, () => client.academy());
  const timezone = academy.data?.timezone || 'Asia/Kolkata';
  const today = todayIn(timezone, now);
  const todayIndex = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  const days = timetableDays(batches.data || []);
  const next = batches.data ? nextClass(batches.data, today, nowIn(timezone, now)) : null;
  return <div className="page portal-page student-timetable">
    <h1>{s.title}</h1><p className="page-lede">{s.lede}</p>
    <p className="calendar-note">{b.timezoneNote.replace('{timezone}', timezone)}</p>
    <LoadState t={t} state={batches} empty={s.empty} />
    {days.map(({ day, index, items }) => <section key={day} className={`panel timetable-day${index === todayIndex ? ' is-today' : ''}`} aria-labelledby={`day-${day}`}>
      <h2 id={`day-${day}`}>{b.dayLong[day]}{index === todayIndex && <span className="chip">{s.today}</span>}</h2>
      <ul className="student-list">{items.map((batch) => {
        const isNext = next?.batch.id === batch.id && next.dayIndex === index;
        return <li key={batch.id} className={batch.status === 'paused' ? 'is-paused' : isNext ? 'is-next' : undefined}>
          <strong>{timeRange(batch, locale)} · {batch.name}</strong>
          <small>{batch.course_name} · {s.teacher}: {batch.teacher_name}</small>
          {(batch.status === 'paused' || isNext) && <span className="chip-row">{batch.status === 'paused' ? <span className="chip">{b.paused}</span> : <span className="status-badge warning">{t.portal.teacher.upNext}</span>}</span>}
        </li>;
      })}</ul>
    </section>)}
  </div>;
}

// The academy half of the student home: today's classes and work still to hand in. Practice stays local-first below.
export function StudentToday({ t, locale = 'en', client, now, onTimetable, onAssignments }) {
  const s = t.portal.student; const a = t.portal.assignments;
  const batches = useApi(t, () => client.student.batches());
  const academy = useApi(t, () => client.academy());
  const assignments = useApi(t, () => client.student.assignments.list());
  const timezone = academy.data?.timezone || 'Asia/Kolkata';
  const open = openAssignments(assignments.data || []);
  return <div className="workspace-grid owner-grid student-today">
    <TodayPanel t={t} locale={locale} batches={batches.data} today={todayIn(timezone, now)} clock={nowIn(timezone, now)} onBatch={onTimetable} />
    <section className="panel" aria-labelledby="open-work-title">
      <p className="eyebrow">{a.nav}</p>
      <h2 id="open-work-title">{s.openWork}</h2>
      {!assignments.data ? <LoadState t={t} state={assignments} /> : !open.length ? <p>{s.noOpenWork}</p>
        : <ul className="attention-list is-plain">{open.slice(0, 3).map((item) => <li key={item.id}><button type="button" onClick={onAssignments}>
          <span><span className="attention-label">{item.title}</span><small>{[item.course_name, due(a, item.due_on, locale), a.status[item.submission?.status || 'notStarted']].filter(Boolean).join(' · ')}</small></span><ArrowRight size={16} aria-hidden="true" />
        </button></li>)}</ul>}
      {open.length > 3 && <button type="button" className="button quiet" onClick={onAssignments}>{s.allWork.replace('{count}', open.length)}</button>}
    </section>
  </div>;
}
