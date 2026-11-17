import React, { useState } from 'react';
import { ArrowRight, CalendarPlus, ClipboardList, LayoutDashboard, Search, Video } from 'lucide-react';
import { useUrlPage } from './router.js';
import { LoadState, PortalShell, useApi } from './PortalShell.jsx';
import { BatchCalendar, BatchDialog, timeRange } from './BatchCalendar.jsx';
import { TeacherAssignments } from './Assignments.jsx';
import { apiErrorKey } from './auth.js';
import { addDays, canJoin, classState, formatDate, meetLink, nextOf, nowIn, slotForm, todayIn } from './schedule.js';

export function TeacherPortal({ shell, client, user }) {
  const [page, setPage] = useUrlPage('teacher', ['dashboard', 'assignments'], 'dashboard');
  const { t } = shell;
  return <PortalShell {...shell} kicker={t.portal.roles.teacher} nav={[['dashboard', t.portal.nav.dashboard, LayoutDashboard], ['assignments', t.portal.assignments.nav, ClipboardList]]} page={page} onPage={setPage}>
    {page === 'dashboard' && <TeacherDashboard t={t} locale={shell.locale} client={client} onReviews={() => setPage('assignments')} />}
    {page === 'assignments' && <TeacherAssignments t={t} locale={shell.locale} client={client} user={user} />}
  </PortalShell>;
}

export function filterStudents(students = [], query = '', courseId = '') {
  const needle = query.trim().toLocaleLowerCase();
  return students.filter((student) => (!courseId || student.courses.some((course) => course.id === courseId))
    && (!needle || student.display_name.toLocaleLowerCase().includes(needle) || student.username.toLocaleLowerCase().includes(needle)));
}

const emptyBatch = { name: '', course_id: '', start_time: '18:00', end_time: '19:00', days: [], student_ids: [], class_mode: 'offline', meeting_url: '', location: '' };

export function TeacherDashboard({ t, locale = 'en', client, now, onReviews }) {
  const p = t.portal.teacher; const b = t.portal.batches;
  const summary = useApi(t, () => client.teacher.summary());
  const courses = useApi(t, () => client.teacher.courses());
  const students = useApi(t, () => client.teacher.students());
  const batches = useApi(t, () => client.teacher.batches.list());
  const academy = useApi(t, () => client.academy());
  const assignments = useApi(t, () => client.teacher.assignments.list());
  const [query, setQuery] = useState('');
  const [courseId, setCourseId] = useState('');
  const [dialog, setDialog] = useState(null);
  const [selected, setSelected] = useState(null);
  const [notice, setNotice] = useState(null);
  const timezone = academy.data?.timezone || 'Asia/Kolkata';
  const today = todayIn(timezone, now);
  const clock = nowIn(timezone, now);
  const classes = useApi(t, () => client.teacher.classes(today, addDays(today, 7)), [today]);
  const reviews = assignments.data?.reduce((sum, item) => sum + (item.submitted_count || 0), 0);
  const visible = filterStudents(students.data || [], query, courseId);
  const courseList = courses.data || [];
  const defaultCourse = courseList.length === 1 ? courseList[0].id : '';

  const openCreate = (slot) => {
    setSelected(slot ? { date: slot.date, minutes: slot.minutes, duration: slot.duration || 60 } : null);
    setDialog({ form: { ...emptyBatch, course_id: defaultCourse, ...(slot ? slotForm(slot.dayIndex, slot.minutes, slot.duration) : {}) } });
  };
  const openEdit = (batch) => setDialog({ batch, form: { name: batch.name, course_id: batch.course_id, start_time: batch.start_time, end_time: batch.end_time, days: batch.days,
    class_mode: batch.class_mode || 'offline', meeting_url: batch.meeting_url || '', location: batch.location || '',
    student_ids: batch.student_ids.filter((id) => (students.data || []).some((student) => student.id === id)) } });
  const close = () => { setDialog(null); setSelected(null); };
  const problem = (result) => {
    if (result.status === 409) return { text: b.errors.conflict, conflicts: result.data?.detail?.conflicts || [] };
    if (result.status === 403) return { text: b.errors.forbidden };
    return { text: t.portal.errors[apiErrorKey(result)] };
  };
  const finish = (result, text) => {
    setNotice({ text, warnings: result.data?.warnings || [] });
    close(); batches.reload(); summary.reload(); classes.reload();
  };
  const save = async (form) => {
    const body = { ...form, name: form.name.trim(), meeting_url: form.class_mode === 'offline' ? null : form.meeting_url.trim() };
    const result = dialog.batch ? await client.teacher.batches.update(dialog.batch.id, body) : await client.teacher.batches.create(body);
    if (!result.ok) return problem(result);
    finish(result, dialog.batch ? b.saved : b.created);
    return null;
  };
  const toggle = async (batch) => {
    const result = await client.teacher.batches.update(batch.id, { status: batch.status === 'paused' ? 'active' : 'paused' });
    if (result.ok) finish(result, b.saved); else { close(); setNotice({ text: problem(result).text, error: true, conflicts: result.data?.detail?.conflicts }); }
  };
  const remove = async (batch) => {
    if (!globalThis.confirm?.(b.confirmRemove)) return;
    const result = await client.teacher.batches.remove(batch.id);
    if (result.ok) finish(result, b.removed); else { close(); setNotice({ text: problem(result).text, error: true }); }
  };
  const activeCount = (batches.data || []).filter((batch) => batch.status === 'active').length;
  const upcoming = classes.data ? nextOf(classes.data, today, clock) : null;
  const timing = upcoming && classState(upcoming, today, clock);
  const batchOf = (k) => (batches.data || []).find((batch) => batch.id === k.batch_id);

  return <div className="page portal-page teacher-page">
    <div className="page-heading-row"><div><h1>{p.title}</h1><p className="page-lede">{p.lede}</p></div>
      <button className="button primary create-batch" onClick={() => openCreate(null)}><CalendarPlus size={18} aria-hidden="true" />{b.create}</button></div>
    {/* One summary row (counts, then the class running now or next) so the week calendar starts above the fold. */}
    <div className="summary-row">
      <dl className="metric-strip">
        <div><dt>{p.studentCount}</dt><dd>{summary.data?.student_count ?? '–'}</dd></div>
        <div><dt>{b.activeBatches}</dt><dd>{batches.data ? activeCount : '–'}</dd></div>
        <div><dt>{p.reviews}</dt><dd><button type="button" className={`metric-link${reviews ? ' has-items' : ''}`} onClick={onReviews} aria-label={`${p.reviews}: ${reviews ?? '–'}`}>{reviews ?? '–'}<ArrowRight size={16} aria-hidden="true" /></button></dd></div>
      </dl>
      {upcoming && <div className="next-group"><button type="button" className="next-inline" onClick={() => batchOf(upcoming) && openEdit(batchOf(upcoming))}>
        <span className={`status-badge ${timing === 'live' ? 'success' : 'next'}`}>{timing === 'live' ? p.live : timing === 'soon' ? p.startingSoon : p.nextClass}</span>
        <strong>{upcoming.batch_name}</strong>
        <span>{upcoming.date === today ? p.today : formatDate(upcoming.date, locale, { weekday: 'long', day: 'numeric', month: 'short' })}, {timeRange(upcoming, locale)}</span>
      </button>
        {canJoin(upcoming, today, clock) && <a className="button primary join-link" href={meetLink(upcoming.meeting_url)} target="_blank" rel="noopener noreferrer" aria-label={`${p.startClass}: ${upcoming.batch_name} (${b.newTab})`}><Video size={16} aria-hidden="true" />{p.startClass}</a>}
      </div>}
      {classes.data && !upcoming && <p className="next-inline is-empty">{p.todayEmpty}</p>}
    </div>
    {notice && <div className={`notice ${notice.error ? 'error' : notice.warnings?.length ? 'warning' : 'success'}`} role={notice.error ? 'alert' : 'status'}><span>{notice.warnings?.length ? b.warning : notice.text}
      {(notice.warnings?.length > 0 || notice.conflicts?.length > 0) && <ul>{(notice.warnings || []).map((item) => <li key={`${item.student_id}-${item.batch_name}`}>{item.student_name}: {item.batch_name}, {item.days.map((day) => b.dayShort[day]).join(', ')} {timeRange(item, locale)}</li>)}
        {(notice.conflicts || []).map((item) => <li key={item.batch_id}>{item.name}: {item.days.map((day) => b.dayShort[day]).join(', ')} {timeRange(item, locale)}</li>)}</ul>}</span></div>}
    <LoadState t={t} state={batches} />
    {batches.data && <BatchCalendar t={t} locale={locale} batches={batches.data} timezone={timezone} today={today} now={clock} selected={selected} onSlot={openCreate} onBatch={openEdit} />}
    <BatchDialog t={t} locale={locale} state={dialog} courses={courseList} students={students.data || []} onClose={close} onSave={save} onRemove={remove} onToggle={toggle} />
    <section className="teacher-students" aria-labelledby="my-students-title">
      <h2 id="my-students-title">{p.students}</h2>
      <div className="filter-controls">
        <label className="search-field"><Search size={16} aria-hidden="true" /><span className="sr-only">{p.search}</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={p.search} aria-label={p.search} /></label>
        <label><span className="sr-only">{p.courseFilter}</span><select aria-label={p.courseFilter} value={courseId} onChange={(event) => setCourseId(event.target.value)}><option value="">{p.allCourses}</option>{courseList.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}</select></label>
      </div>
      <LoadState t={t} state={students} empty={p.noStudents} />
      {students.data?.length > 0 && !visible.length && <p>{p.noMatches}</p>}
      {visible.length > 0 && <ul className="student-list">{visible.map((student) => <li key={student.id}><strong>{student.display_name}</strong><small>{student.username}</small><span className="chip-row">{student.courses.map((course) => <span className="chip" key={course.id}>{course.name}</span>)}</span></li>)}</ul>}
    </section>
  </div>;
}

// Today's classes in order, marking the one running now or next. Only real batches; nothing is shown before they load.
