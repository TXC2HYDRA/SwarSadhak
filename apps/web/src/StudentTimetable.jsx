import React from 'react';
import { LoadState, useApi } from './PortalShell.jsx';
import { timeRange } from './BatchCalendar.jsx';
import { DAYS, todayIn } from './schedule.js';
import './portal.css';

export const timetableDays = (batches) => DAYS.map((day, index) => ({ day, index, items: batches.filter((batch) => batch.days.includes(day)) })).filter((day) => day.items.length);

// A weekly list, not a grid: a student has a few classes, and a list reads well on a phone.
export function StudentTimetable({ t, locale = 'en', client, now }) {
  const s = t.portal.student; const b = t.portal.batches;
  const batches = useApi(t, () => client.student.batches());
  const academy = useApi(t, () => client.academy());
  const timezone = academy.data?.timezone || 'Asia/Kolkata';
  const todayIndex = (new Date(`${todayIn(timezone, now)}T00:00:00Z`).getUTCDay() + 6) % 7;
  const days = timetableDays(batches.data || []);
  return <div className="page portal-page student-timetable">
    <h1>{s.title}</h1><p className="page-lede">{s.lede}</p>
    <p className="calendar-note">{b.timezoneNote.replace('{timezone}', timezone)}</p>
    <LoadState t={t} state={batches} empty={s.empty} />
    {days.map(({ day, index, items }) => <section key={day} className={`panel timetable-day${index === todayIndex ? ' is-today' : ''}`} aria-labelledby={`day-${day}`}>
      <h2 id={`day-${day}`}>{b.dayLong[day]}{index === todayIndex && <span className="chip">{s.today}</span>}</h2>
      <ul className="student-list">{items.map((batch) => <li key={batch.id} className={batch.status === 'paused' ? 'is-paused' : ''}>
        <strong>{timeRange(batch, locale)} · {batch.name}</strong>
        <small>{batch.course_name} · {s.teacher}: {batch.teacher_name}</small>
        {batch.status === 'paused' && <span className="chip-row"><span className="chip">{b.paused}</span></span>}
      </li>)}</ul>
    </section>)}
  </div>;
}
