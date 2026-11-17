import React, { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, ExternalLink, List, MapPin, MonitorSmartphone, Pause, Play, Trash2, Video } from 'lucide-react';
import { DAYS, SLOT_MINUTES, addDays, batchFormErrors, meetLink, classesOn, formatDate, formatTime, fromMinutes, mondayOf, nextClass, toMinutes, visibleRange, weekDates, weekOccurrences } from './schedule.js';

// Each course gets a chart colour (with its name in the legend and on every block, so colour is never the only cue).
export function courseColors(batches) {
  const courses = [...new Map(batches.map((batch) => [batch.course_id, batch.course_name])).entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1])));
  return new Map(courses.map(([id, name], index) => [id, { name, color: `var(--chart-${(index % 5) + 1})` }]));
}

const fill = (text, values) => Object.entries(values).reduce((out, [key, value]) => out.replace(`{${key}}`, value), text);
export const timeRange = (batch, locale) => `${formatTime(batch.start_time, locale)} – ${formatTime(batch.end_time, locale)}`;

// Week view: days across, times down. Slots are buttons with a roving tabindex: arrow keys move, Enter creates.
// List view (always on phones): the same week as an agenda, which also serves screen-reader users.
export function BatchCalendar({ t, locale, batches, timezone, today, now, selected, onSlot, onBatch }) {
  const b = t.portal.batches;
  const [monday, setMonday] = useState(() => mondayOf(today));
  // Phones open on the agenda: seven columns never fit 360 px.
  const [view, setView] = useState(() => (globalThis.matchMedia?.('(max-width: 599px)').matches ? 'list' : 'week'));
  const [cursor, setCursor] = useState(() => ({ day: (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7, row: 0 }));
  const colors = courseColors(batches);
  const nowRow = now && (toMinutes(now) - visibleRange(batches).start) / SLOT_MINUTES;
  const gridRef = useRef(null);
  // Drag down a day column to choose a time range; the guide snaps to 30-minute slots. Escape or a cancelled pointer drops it.
  const [drag, setDrag] = useState(null);
  useEffect(() => {
    if (!drag) return undefined;
    const finish = () => {
      const top = Math.min(drag.from, drag.to); const count = Math.abs(drag.to - drag.from) + 1;
      setDrag(null);
      onSlot({ dayIndex: drag.dayIndex, date: drag.date, minutes: visibleRange(batches).start + top * SLOT_MINUTES, duration: count > 1 ? count * SLOT_MINUTES : undefined });
    };
    const cancel = (event) => { if (!event.key || event.key === 'Escape') setDrag(null); };
    globalThis.addEventListener('pointerup', finish); globalThis.addEventListener('pointercancel', cancel); globalThis.addEventListener('keydown', cancel);
    return () => { globalThis.removeEventListener('pointerup', finish); globalThis.removeEventListener('pointercancel', cancel); globalThis.removeEventListener('keydown', cancel); };
  }, [drag]);
  const dates = weekDates(monday);
  const range = visibleRange(batches);
  const rows = (range.end - range.start) / SLOT_MINUTES;
  const occurrences = weekOccurrences(batches, monday);
  const move = (event, day, row) => {
    const step = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[event.key];
    if (!step) return;
    event.preventDefault();
    const next = { day: Math.min(6, Math.max(0, day + step[0])), row: Math.min(rows - 1, Math.max(0, row + step[1])) };
    setCursor(next);
    gridRef.current?.querySelector(`[data-cell="${next.day}-${next.row}"]`)?.focus();
  };
  const weekLabel = `${formatDate(dates[0], locale, { day: 'numeric', month: 'short' })} – ${formatDate(dates[6], locale, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const blockLabel = (batch, dayIndex) => `${b.edit}: ${batch.name}, ${batch.course_name}, ${b.dayLong[DAYS[dayIndex]]} ${timeRange(batch, locale)}${batch.status === 'paused' ? `, ${b.paused}` : ''}`;
  const blockDetail = (batch) => (batch.status === 'paused' ? b.paused : fill(b.studentCount, { count: batch.student_ids.length }));
  return <section className={`panel calendar-panel view-${view}`} aria-labelledby="calendar-title">
    <div className="calendar-toolbar">
      <div><h2 id="calendar-title">{b.title}</h2><p className="calendar-note">{fill(b.timezoneNote, { timezone })} <span className="drag-hint">{b.dragHint}</span></p></div>
      <div className="calendar-nav">
        <button className="icon-button" onClick={() => setMonday(addDays(monday, -7))} aria-label={b.previousWeek}><ChevronLeft size={18} aria-hidden="true" /></button>
        <button className="button quiet" onClick={() => setMonday(mondayOf(today))}>{b.thisWeek}</button>
        <button className="icon-button" onClick={() => setMonday(addDays(monday, 7))} aria-label={b.nextWeek}><ChevronRight size={18} aria-hidden="true" /></button>
        <strong aria-live="polite">{weekLabel}</strong>
        <div className="view-toggle" role="group" aria-label={b.viewLabel}>
          <button type="button" aria-pressed={view === 'week'} onClick={() => setView('week')}><CalendarDays size={16} aria-hidden="true" />{b.weekView}</button>
          <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}><List size={16} aria-hidden="true" />{b.listView}</button>
        </div>
      </div>
    </div>
    {!batches.length && <p className="calendar-note">{b.empty}</p>}
    <div ref={gridRef} className={`calendar-grid${drag ? ' is-dragging' : ''}`} role="group" aria-label={`${b.title}, ${weekLabel}`} style={{ '--rows': rows }}>
      <div className="cal-times" aria-hidden="true"><div className="cal-day-head" />{Array.from({ length: rows / 2 }, (_, hour) => <span key={hour} style={{ '--start': hour * 2 }}>{formatTime(`${String(range.start / 60 + hour).padStart(2, '0')}:00`, locale)}</span>)}</div>
      {dates.map((date, dayIndex) => <div key={date} className={`cal-day${date === today ? ' is-today' : ''}`}>
        <div className="cal-day-head"><span>{b.dayShort[DAYS[dayIndex]]}</span><strong>{formatDate(date, locale, { day: 'numeric' })}</strong></div>
        <div className="cal-day-body">
          {Array.from({ length: rows }, (_, row) => {
            const minutes = range.start + row * SLOT_MINUTES;
            const label = `${b.dayLong[DAYS[dayIndex]]} ${formatDate(date, locale, { day: 'numeric', month: 'long' })}, ${formatTime(`${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`, locale)}: ${b.slotAction}`;
            return <button key={row} type="button" data-cell={`${dayIndex}-${row}`} tabIndex={cursor.day === dayIndex && cursor.row === row ? 0 : -1}
              className={`cal-slot${selected?.date === date && minutes >= selected.minutes && minutes < selected.minutes + (selected.duration || SLOT_MINUTES) ? ' is-selected' : ''}${row % 2 ? '' : ' hour-start'}`}
              aria-label={label} onFocus={() => setCursor({ day: dayIndex, row })} onKeyDown={(event) => move(event, dayIndex, row)}
              onPointerDown={(event) => { if (event.button !== 0) return; if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); setDrag({ dayIndex, date, from: row, to: row }); }}
              onPointerEnter={() => { if (drag?.dayIndex === dayIndex && drag.to !== row) setDrag({ ...drag, to: row }); }}
              onClick={(event) => { if (event.detail === 0) onSlot({ dayIndex, minutes, date }); }} />;
          })}
          {drag?.dayIndex === dayIndex && (() => {
            const top = Math.min(drag.from, drag.to); const count = Math.abs(drag.to - drag.from) + 1; const start = range.start + top * SLOT_MINUTES;
            return <span className="cal-drag-guide" style={{ '--start': top, '--span': count }} aria-hidden="true">{timeRange({ start_time: fromMinutes(start), end_time: fromMinutes(start + count * SLOT_MINUTES) }, locale)}</span>;
          })()}
          {date === today && nowRow >= 0 && nowRow <= rows && <span className="cal-now" style={{ '--at': nowRow }} aria-hidden="true" />}
          {occurrences.filter((item) => item.dayIndex === dayIndex).map(({ batch }) => {
            const start = Math.max(range.start, toMinutes(batch.start_time));
            const span = Math.max(1, (toMinutes(batch.end_time) - start) / SLOT_MINUTES);
            const paused = batch.status === 'paused';
            const label = blockLabel(batch, dayIndex);
            return <button key={batch.id} type="button" className={`cal-block${paused ? ' is-paused' : ''}`} style={{ '--start': (start - range.start) / SLOT_MINUTES, '--span': span, '--block': colors.get(batch.course_id)?.color }}
              onClick={() => onBatch(batch)} aria-label={label} title={label}>
              <strong>{batch.name}</strong><small>{timeRange(batch, locale)}</small><small>{blockDetail(batch)}</small>
            </button>;
          })}
        </div>
      </div>)}
    </div>
    <ol className="cal-agenda" aria-label={`${b.title}, ${weekLabel}`}>
      {dates.map((date, dayIndex) => {
        const items = occurrences.filter((item) => item.dayIndex === dayIndex).sort((x, y) => x.batch.start_time.localeCompare(y.batch.start_time));
        return <li key={date} className={date === today ? 'is-today' : ''}>
          <h3>{b.dayLong[DAYS[dayIndex]]} {formatDate(date, locale, { day: 'numeric', month: 'short' })}{date === today && <span className="status-badge success">{t.portal.teacher.today}</span>}</h3>
          {items.length ? <ul>{items.map(({ batch }) => <li key={batch.id}><button type="button" className={`cal-agenda-item${batch.status === 'paused' ? ' is-paused' : ''}`} style={{ '--block': colors.get(batch.course_id)?.color }} onClick={() => onBatch(batch)} aria-label={blockLabel(batch, dayIndex)}>
            <span className="cal-agenda-time">{timeRange(batch, locale)}</span><strong>{batch.name}</strong><small>{batch.course_name} · {blockDetail(batch)}</small>
          </button></li>)}</ul> : <p className="calendar-note">{b.noClasses}</p>}
        </li>;
      })}
    </ol>
    {colors.size > 0 && <ul className="cal-legend" aria-label={b.legend}>{[...colors.values()].map((course) => <li key={course.name} style={{ '--block': course.color }}>{course.name}</li>)}</ul>}
  </section>;
}

export const MODE_ICONS = { online: Video, offline: MapPin, hybrid: MonitorSmartphone };

// "Online", "Offline · Room 2", "Hybrid · Main hall": the class mode with its place, as text (never colour alone).
export const modeLabel = (b, batch) => [b.modes[batch.class_mode || 'offline'], batch.class_mode !== 'online' && batch.location].filter(Boolean).join(' · ');

// The batch's Meet link, opened in a new tab. Rendered only from a server-normalised URL.
export function MeetLink({ b, batch }) {
  const href = meetLink(batch.meeting_url);
  if (!href || batch.class_mode === 'offline') return null;
  return <a className="button quiet meet-link" href={href} target="_blank" rel="noopener noreferrer" aria-label={`${b.openMeet}: ${batch.name} (${b.newTab})`}><Video size={16} aria-hidden="true" />{b.openMeet}</a>;
}

export function BatchDialog({ t, locale, state, courses, students, onClose, onSave, onRemove, onToggle }) {
  const b = t.portal.batches;
  const ref = useRef(null);
  const [form, setForm] = useState(state?.form);
  const [errors, setErrors] = useState([]);
  const [serverError, setServerError] = useState(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setForm(state?.form); setErrors([]); setServerError(null); setQuery(''); }, [state]);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (state && !dialog.open) dialog.showModal?.();
    if (!state && dialog.open) dialog.close();
  }, [state]);
  if (!form) return <dialog ref={ref} className="sheet-dialog" />;
  const courseStudents = students.filter((student) => student.courses.some((course) => course.id === form.course_id));
  const needle = query.trim().toLocaleLowerCase();
  const shown = courseStudents.filter((student) => !needle || student.display_name.toLocaleLowerCase().includes(needle) || student.username.toLocaleLowerCase().includes(needle));
  const set = (changes) => setForm({ ...form, ...changes });
  const toggle = (list, value) => list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  const chooseCourse = (courseId) => {
    const allowed = new Set(students.filter((student) => student.courses.some((course) => course.id === courseId)).map((student) => student.id));
    set({ course_id: courseId, student_ids: form.student_ids.filter((id) => allowed.has(id)) });
  };
  const submit = async (event) => {
    event.preventDefault();
    const found = batchFormErrors(form);
    setErrors(found); setServerError(null);
    if (found.length) return;
    setBusy(true);
    const problem = await onSave(form);
    setBusy(false);
    if (problem) setServerError(problem);
  };
  const editing = Boolean(state.batch);
  return <dialog ref={ref} className="sheet-dialog" aria-labelledby="batch-dialog-title" onClose={onClose}>
    <form className="portal-form" onSubmit={submit} noValidate>
      <h2 id="batch-dialog-title">{editing ? b.edit : b.create}</h2>
      <label className="field-label">{b.name}<input value={form.name} onChange={(event) => set({ name: event.target.value })} maxLength={120} aria-invalid={errors.includes('name')} autoFocus /></label>
      {errors.includes('name') && <p className="field-error">{b.errors.name}</p>}
      <label className="field-label">{b.course}<select value={form.course_id} onChange={(event) => chooseCourse(event.target.value)} aria-invalid={errors.includes('course')}><option value="">{t.portal.enrollments.choose}</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}</select></label>
      {!courses.length && <p className="field-error">{b.noCourses}</p>}
      {errors.includes('course') && <p className="field-error">{b.errors.course}</p>}
      <div className="time-row">
        <label className="field-label">{b.start}<input type="time" step="300" value={form.start_time} onChange={(event) => set({ start_time: event.target.value })} required /></label>
        <label className="field-label">{b.end}<input type="time" step="300" value={form.end_time} onChange={(event) => set({ end_time: event.target.value })} required aria-invalid={errors.includes('endAfterStart')} /></label>
      </div>
      {form.start_time && form.end_time && form.end_time > form.start_time && <p className="calendar-note">{timeRange(form, locale)}</p>}
      {errors.includes('endAfterStart') && <p className="field-error">{b.errors.endAfterStart}</p>}
      <fieldset className="day-toggles"><legend>{b.days}</legend>{DAYS.map((day) => <button key={day} type="button" aria-pressed={form.days.includes(day)} aria-label={b.dayLong[day]} onClick={() => set({ days: toggle(form.days, day) })}>{b.dayShort[day]}</button>)}</fieldset>
      {errors.includes('days') && <p className="field-error">{b.errors.days}</p>}
      <p className="calendar-note">{b.recurrence}</p>
      <fieldset className="mode-choice"><legend>{b.classMode}</legend>
        {['offline', 'online', 'hybrid'].map((mode) => { const Icon = MODE_ICONS[mode]; return <label key={mode}><input type="radio" name="class_mode" value={mode} checked={form.class_mode === mode} onChange={() => set({ class_mode: mode })} /><Icon size={16} aria-hidden="true" />{b.modes[mode]}</label>; })}
      </fieldset>
      {form.class_mode !== 'offline' && <>
        <label className="field-label">{b.meetLink}<input type="url" inputMode="url" autoComplete="off" spellCheck="false" placeholder="https://meet.google.com/abc-defg-hij" value={form.meeting_url} onChange={(event) => set({ meeting_url: event.target.value })} maxLength={300} aria-invalid={errors.includes('meetingUrl')} aria-describedby="meet-hint" /></label>
        <p className="field-hint" id="meet-hint">{b.meetHint}</p>
        {errors.includes('meetingUrl') && <p className="field-error">{b.errors.meetingUrl}</p>}
        {meetLink(form.meeting_url) && <a className="button quiet meet-open" href={meetLink(form.meeting_url)} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} aria-hidden="true" />{b.openLink}</a>}
      </>}
      {form.class_mode !== 'online' && <label className="field-label">{b.location}<input value={form.location} onChange={(event) => set({ location: event.target.value })} maxLength={200} /></label>}
      <fieldset className="student-picker"><legend>{b.students} · {fill(b.selected, { count: form.student_ids.length })}</legend>
        {!form.course_id ? <small>{b.chooseCourseFirst}</small> : !courseStudents.length ? <small>{b.noCourseStudents}</small> : <>
          <input type="search" className="portal-input" placeholder={b.searchStudents} aria-label={b.searchStudents} value={query} onChange={(event) => setQuery(event.target.value)} />
          <div className="student-options">{shown.map((student) => <label key={student.id}><input type="checkbox" checked={form.student_ids.includes(student.id)} onChange={() => set({ student_ids: toggle(form.student_ids, student.id) })} /><span>{student.display_name}<small>{student.username}</small></span></label>)}</div>
        </>}
      </fieldset>
      {serverError && <div className="notice error" role="alert"><span>{serverError.text}{serverError.conflicts?.length > 0 && <ul>{serverError.conflicts.map((item) => <li key={item.batch_id}>{item.name}: {item.days.map((day) => b.dayShort[day]).join(', ')} {timeRange(item, locale)}</li>)}</ul>}</span></div>}
      <div className="form-actions">
        <button className="button primary" type="submit" disabled={busy}>{b.save}</button>
        <button className="button quiet" type="button" onClick={onClose}>{b.cancel}</button>
        {editing && <button className="button quiet" type="button" onClick={() => onToggle(state.batch)}>{state.batch.status === 'paused' ? <><Play size={16} aria-hidden="true" />{b.resume}</> : <><Pause size={16} aria-hidden="true" />{b.pause}</>}</button>}
        {editing && <button className="button quiet danger" type="button" onClick={() => onRemove(state.batch)}><Trash2 size={16} aria-hidden="true" />{b.remove}</button>}
      </div>
    </form>
  </dialog>;
}

// Today's classes in academy time, marked finished / live / next, plus the next class on a later day. Shared by every role.
export function TodayPanel({ t, locale, batches, today, clock, onBatch, dated = true }) {
  const p = t.portal.teacher; const b = t.portal.batches;
  const todays = batches ? classesOn(batches, today) : [];
  const upNext = todays.find(({ batch }) => batch.start_time > clock);
  const upcoming = batches ? nextClass(batches, today, clock) : null;
  const later = upcoming && upcoming.date !== today ? upcoming : null;
  const state = (item) => (item.batch.end_time <= clock ? 'finished' : item.batch.start_time <= clock ? 'live' : item === upNext ? 'upNext' : '');
  return <section className="panel today-panel" aria-labelledby="today-title">
    {dated && <p className="eyebrow">{p.today} · {formatDate(today, locale, { weekday: 'long', day: 'numeric', month: 'long' })}</p>}
    <h2 id="today-title">{p.classesToday}</h2>
    {batches && !todays.length && <p>{p.todayEmpty}</p>}
    {todays.length > 0 && <ol className="today-list">{todays.map((item) => {
      const status = state(item);
      return <li key={item.batch.id} className={status ? `is-${status}` : undefined}><button type="button" onClick={() => onBatch(item.batch)}>
        <span className="today-time">{timeRange(item.batch, locale)}</span>
        <span className="today-name"><strong>{item.batch.name}</strong><small>{item.batch.course_name}{item.batch.teacher_name ? ` · ${item.batch.teacher_name}` : ''}{item.batch.student_ids ? ` · ${b.studentCount.replace('{count}', item.batch.student_ids.length)}` : ''}</small></span>
        {status && <span className={`status-badge ${status === 'live' ? 'success' : status === 'upNext' ? 'next' : ''}`}>{p[status]}</span>}
      </button></li>;
    })}</ol>}
    {later && <p className="today-next"><span>{p.nextClass}:</span> <strong>{b.dayLong[DAYS[later.dayIndex]]} {formatDate(later.date, locale, { day: 'numeric', month: 'short' })}, {timeRange(later.batch, locale)}</strong> · {later.batch.name}</p>}
  </section>;
}
