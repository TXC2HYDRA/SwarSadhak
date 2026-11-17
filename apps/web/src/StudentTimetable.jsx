import React from 'react';
import { ArrowRight } from 'lucide-react';
import { LoadState, useApi } from './PortalShell.jsx';
import { TodayPanel } from './ClassViews.jsx';
import { addDays, due, nowIn, todayIn } from './schedule.js';
import './portal.css';

// Not handed in yet: no answer, or only a draft. The API already sorts by due date.
export const openAssignments = (items = []) => items.filter((item) => !item.submission || item.submission.status === 'draft');


// The academy half of the student home: today's classes and work still to hand in. Practice stays local-first.
export function StudentToday({ t, locale = 'en', client, now, onTimetable, onAssignments }) {
  const s = t.portal.student; const a = t.portal.assignments;
  const academy = useApi(t, () => client.academy());
  const assignments = useApi(t, () => client.student.assignments.list());
  const timezone = academy.data?.timezone || 'Asia/Kolkata';
  const today = todayIn(timezone, now);
  const classes = useApi(t, () => client.student.classes(today, addDays(today, 7)), [today]);
  const open = openAssignments(assignments.data || []);
  // Two sections laid out by the home grid (classes on the left, work on the right).
  return <>
    <TodayPanel t={t} locale={locale} classes={classes.data} today={today} clock={nowIn(timezone, now)} onClass={onTimetable} joinLabel={t.portal.teacher.joinClass} dated={false} />
    <section className="home-work" aria-labelledby="open-work-title">
      <h2 id="open-work-title">{s.openWork}</h2>
      {!assignments.data ? <LoadState t={t} state={assignments} /> : !open.length ? <p>{s.noOpenWork}</p>
        : <ul className="attention-list is-plain">{open.slice(0, 3).map((item) => <li key={item.id}><button type="button" onClick={onAssignments}>
          <span><span className="attention-label">{item.title}</span><small>{[item.course_name, due(a, item.due_on, locale), a.status[item.submission?.status || 'notStarted']].filter(Boolean).join(' · ')}</small></span><ArrowRight size={16} aria-hidden="true" />
        </button></li>)}</ul>}
      {open.length > 3 && <button type="button" className="button quiet" onClick={onAssignments}>{s.allWork.replace('{count}', open.length)}</button>}
    </section>
  </>;
}
