import React from 'react';
import { MapPin, MonitorSmartphone, Video } from 'lucide-react';
import { canJoin, classKey, classState, formatDate, formatTime, meetLink, nextOf } from './schedule.js';

// Class views shared by every role (student home and timetable, teacher dashboard, owner overview). Kept apart
// from BatchCalendar.jsx so the teacher's calendar and batch drawer stay out of the main bundle.
export const timeRange = (batch, locale) => `${formatTime(batch.start_time, locale)} – ${formatTime(batch.end_time, locale)}`;

export const MODE_ICONS = { online: Video, offline: MapPin, hybrid: MonitorSmartphone };

// "Online", "Offline · Room 2", "Hybrid · Main hall": the class mode with its place, as text (never colour alone).
export const modeLabel = (b, batch) => [b.modes[batch.class_mode || 'offline'], batch.class_mode !== 'online' && batch.location].filter(Boolean).join(' · ');

// The batch's Meet link, opened in a new tab. Rendered only from a server-normalised URL.
export function MeetLink({ b, batch }) {
  const href = meetLink(batch.meeting_url);
  if (!href || batch.class_mode === 'offline') return null;
  return <a className="button quiet meet-link" href={href} target="_blank" rel="noopener noreferrer" aria-label={`${b.openMeet}: ${batch.name} (${b.newTab})`}><Video size={16} aria-hidden="true" />{b.openMeet}</a>;
}

// Today's classes in academy time (dated classes from /api/{role}/classes), marked done / class time / next /
// cancelled, plus the next class on a later day. Start or Join appears inside the join window when joinLabel is given.
export function TodayPanel({ t, locale, classes, today, clock, onClass, joinLabel, dated = true }) {
  const p = t.portal.teacher; const b = t.portal.batches;
  const todays = classes ? classes.filter((k) => k.date === today) : [];
  const upNext = todays.find((k) => ['scheduled', 'soon'].includes(classState(k, today, clock)));
  const upcoming = classes ? nextOf(classes, today, clock) : null;
  const later = upcoming && upcoming.date !== today ? upcoming : null;
  return <section className="panel today-panel" aria-labelledby="today-title">
    {dated && <p className="eyebrow">{p.today} · {formatDate(today, locale, { weekday: 'long', day: 'numeric', month: 'long' })}</p>}
    <h2 id="today-title">{p.classesToday}</h2>
    {classes && !todays.length && <p>{p.todayEmpty}</p>}
    {todays.length > 0 && <ol className="today-list">{todays.map((k) => {
      const timing = classState(k, today, clock);
      const status = k === upNext ? 'upNext' : ['live', 'finished', 'cancelled'].includes(timing) ? timing : '';
      const details = [k.course_name, k.teacher_name, k.student_count != null && b.studentCount.replace('{count}', k.student_count), modeLabel(b, k),
        k.status === 'rescheduled' && k.original_date !== k.date && p.movedFrom.replace('{date}', formatDate(k.original_date, locale, { weekday: 'short', day: 'numeric', month: 'short' })), k.note];
      return <li key={classKey(k)} className={status ? `is-${status}` : undefined}><button type="button" onClick={() => onClass(k)}>
        <span className="today-time">{timeRange(k, locale)}</span>
        <span className="today-name"><strong>{k.batch_name}</strong><small>{details.filter(Boolean).join(' · ')}</small></span>
        {status && <span className={`status-badge ${status === 'live' ? 'success' : status === 'upNext' ? 'next' : status === 'cancelled' ? 'danger' : ''}`}>{status === 'upNext' && timing === 'soon' ? p.startingSoon : p[status]}</span>}
      </button>
        {joinLabel && canJoin(k, today, clock) && <a className="button primary join-link" href={meetLink(k.meeting_url)} target="_blank" rel="noopener noreferrer" aria-label={`${joinLabel}: ${k.batch_name} (${b.newTab})`}><Video size={16} aria-hidden="true" />{joinLabel}</a>}
      </li>;
    })}</ol>}
    {later && <p className="today-next"><span>{p.nextClass}:</span> <strong>{formatDate(later.date, locale, { weekday: 'long', day: 'numeric', month: 'short' })}, {timeRange(later, locale)}</strong> · {later.batch_name}</p>}
  </section>;
}
