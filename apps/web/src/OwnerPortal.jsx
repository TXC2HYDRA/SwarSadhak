import React, { useState } from 'react';
import { BookOpen, CalendarRange, LayoutDashboard, UserCheck, Users } from 'lucide-react';
import { useUrlPage } from './router.js';
import { LoadState, PortalShell, useApi } from './PortalShell.jsx';
import { apiErrorKey } from './auth.js';
import { timeRange } from './BatchCalendar.jsx';

const ROLES = ['owner', 'teacher', 'student'];
const emptyForm = { id: null, username: '', display_name: '', password: '', roles: [] };

const noMessage = { text: '', error: false };

export function OwnerPortal({ shell, client, user }) {
  const { t } = shell; const p = t.portal;
  const nav = [['overview', p.nav.overview, LayoutDashboard], ['users', p.nav.users, Users], ['courses', p.nav.courses, BookOpen], ['enrollments', p.nav.enrollments, UserCheck], ['batches', p.nav.batches, CalendarRange]];
  const [page, setPage] = useUrlPage('owner', nav.map(([key]) => key), 'overview');
  return <PortalShell {...shell} kicker={p.roles.owner} nav={nav} page={page} onPage={setPage}>
    {page === 'overview' && <OverviewPage t={t} client={client} />}
    {page === 'users' && <UsersPage t={t} client={client} me={user} />}
    {page === 'courses' && <CoursesPage t={t} client={client} />}
    {page === 'enrollments' && <EnrollmentsPage t={t} client={client} />}
    {page === 'batches' && <BatchesPage t={t} locale={shell.locale} client={client} />}
  </PortalShell>;
}

export function OverviewPage({ t, client }) {
  const o = t.portal.overview;
  const summary = useApi(t, () => client.owner.summary());
  const stats = [['teachers', o.teachers], ['students', o.students], ['courses', o.courses], ['active_enrollments', o.enrollments], ['active_batches', o.batches]];
  return <div className="page portal-page">
    <h1>{o.title}</h1><p className="page-lede">{o.lede}</p>
    <LoadState t={t} state={summary} />
    {summary.data && <section className="stats-grid portal-stats">{stats.map(([key, label]) => <div className="stat-card" key={key}><strong>{summary.data[key]}</strong><small>{label}</small></div>)}</section>}
  </div>;
}

export function CoursesPage({ t, client }) {
  const p = t.portal; const c = p.courses; const u = p.users;
  const courses = useApi(t, () => client.owner.courses.list());
  const teachers = useApi(t, () => client.owner.users.list('teacher'));
  const empty = { id: null, name: '', description: '', teacherIds: [] };
  const [form, setForm] = useState(empty);
  const [message, setMessage] = useState(noMessage);
  const [busy, setBusy] = useState(false);
  const fail = (result, conflictText) => { const key = apiErrorKey(result); setMessage({ text: key === 'conflict' ? conflictText : p.errors[key], error: true }); };
  const toggleTeacher = (id) => setForm({ ...form, teacherIds: form.teacherIds.includes(id) ? form.teacherIds.filter((item) => item !== id) : [...form.teacherIds, id] });
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    const body = { name: form.name.trim(), description: form.description.trim() };
    const saved = form.id ? await client.owner.courses.update(form.id, body) : await client.owner.courses.create(body);
    const assigned = saved.ok ? await client.owner.courses.setTeachers(saved.data.id, form.teacherIds) : null;
    setBusy(false);
    if (!saved.ok) fail(saved, c.nameTaken);
    else if (!assigned.ok) { fail(assigned, c.teacherInUse); setForm({ ...form, id: saved.data.id }); } // retry updates instead of re-creating
    else { setMessage({ text: form.id ? c.saved : c.created, error: false }); setForm(empty); }
    courses.reload();
  };
  const setActive = async (course, active) => { const result = await client.owner.courses.update(course.id, { active }); if (result.ok) { setMessage({ text: c.saved, error: false }); courses.reload(); } else fail(result, c.nameTaken); };
  const edit = (course) => { setForm({ id: course.id, name: course.name, description: course.description, teacherIds: course.teachers.map((item) => item.id) }); setMessage(noMessage); };
  const teacherOptions = (teachers.data || []).filter((item) => item.active || form.teacherIds.includes(item.id));

  return <div className="page portal-page">
    <h1>{c.title}</h1><p className="page-lede">{c.lede}</p>
    <div className="portal-columns">
      <section className="panel" aria-labelledby="course-form-title">
        <h2 id="course-form-title">{form.id ? c.edit : c.create}</h2>
        <form className="portal-form" onSubmit={submit}>
          <label className="field-label">{c.name}<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required maxLength={120} /></label>
          <label className="field-label">{c.description}<textarea className="portal-input" rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} maxLength={1000} /></label>
          <fieldset className="role-options"><legend>{c.teachers}</legend>
            {teacherOptions.length ? teacherOptions.map((teacher) => <label key={teacher.id}><input type="checkbox" checked={form.teacherIds.includes(teacher.id)} onChange={() => toggleTeacher(teacher.id)} />{teacher.display_name}</label>) : <small>{teachers.data ? c.noTeachers : u.loading}</small>}
          </fieldset>
          {message.text && <p className={`notice ${message.error ? 'error' : 'success'}`} role={message.error ? 'alert' : 'status'}>{message.text}</p>}
          <div className="form-actions"><button className="button primary" type="submit" disabled={busy}>{form.id ? u.save : c.create}</button>{form.id && <button className="button quiet" type="button" onClick={() => { setForm(empty); setMessage(noMessage); }}>{u.cancel}</button>}</div>
        </form>
      </section>
      <section className="panel" aria-labelledby="course-list-title">
        <h2 id="course-list-title">{c.title}</h2>
        <LoadState t={t} state={courses} empty={c.empty} />
        {courses.data?.length > 0 && <div className="table-wrap"><table className="data-table">
          <thead><tr><th scope="col">{c.name}</th><th scope="col">{c.teachers}</th><th scope="col">{c.enrolled}</th><th scope="col">{u.status}</th><th scope="col">{u.actions}</th></tr></thead>
          <tbody>{courses.data.map((course) => <tr key={course.id}>
            <td><strong>{course.name}</strong>{course.description && <small>{course.description}</small>}</td>
            <td>{course.teachers.length ? course.teachers.map((item) => item.display_name).join(', ') : <small>{c.unassigned}</small>}</td>
            <td>{course.active_enrollments}</td>
            <td><span className={`status-badge ${course.active ? 'success' : 'neutral'}`}>{course.active ? u.active : u.inactive}</span></td>
            <td className="row-actions"><button className="button quiet" onClick={() => edit(course)} aria-label={`${u.editAction}: ${course.name}`}>{u.editAction}</button><button className="button quiet" onClick={() => setActive(course, !course.active)} aria-label={`${course.active ? u.deactivate : u.reactivate}: ${course.name}`}>{course.active ? u.deactivate : u.reactivate}</button></td>
          </tr>)}</tbody>
        </table></div>}
      </section>
    </div>
  </div>;
}

export function EnrollmentsPage({ t, client }) {
  const p = t.portal; const e = p.enrollments; const u = p.users;
  const enrollments = useApi(t, () => client.owner.enrollments.list());
  const students = useApi(t, () => client.owner.users.list('student'));
  const courses = useApi(t, () => client.owner.courses.list());
  const empty = { student_id: '', course_id: '', teacher_id: '' };
  const [form, setForm] = useState(empty);
  const [message, setMessage] = useState(noMessage);
  const [busy, setBusy] = useState(false);
  const course = courses.data?.find((item) => item.id === form.course_id);
  const report = (result, success, conflictText = p.errors.conflict) => {
    const key = apiErrorKey(result);
    setMessage(result.ok ? { text: success, error: false } : { text: key === 'conflict' ? conflictText : p.errors[key], error: true });
    if (result.ok) enrollments.reload();
    return result.ok;
  };
  const chooseCourse = (courseId) => {
    const teachers = courses.data?.find((item) => item.id === courseId)?.teachers || [];
    setForm({ ...form, course_id: courseId, teacher_id: teachers.length === 1 ? teachers[0].id : '' });
  };
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    const ok = report(await client.owner.enrollments.create(form), e.created, e.duplicate);
    setBusy(false);
    if (ok) setForm(empty);
  };
  const remove = async (enrollment) => {
    if (!globalThis.confirm?.(e.confirmRemove)) return;
    report(await client.owner.enrollments.remove(enrollment.id), e.removed);
  };
  const select = (label, value, onChange, options) => <label className="field-label">{label}<select required value={value} onChange={(event) => onChange(event.target.value)}><option value="">{e.choose}</option>{options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>;

  return <div className="page portal-page">
    <h1>{e.title}</h1><p className="page-lede">{e.lede}</p>
    <div className="portal-columns">
      <section className="panel" aria-labelledby="enroll-form-title">
        <h2 id="enroll-form-title">{e.create}</h2>
        <form className="portal-form" onSubmit={submit}>
          {select(e.student, form.student_id, (value) => setForm({ ...form, student_id: value }), (students.data || []).filter((item) => item.active).map((item) => [item.id, `${item.display_name} (${item.username})`]))}
          {select(e.course, form.course_id, chooseCourse, (courses.data || []).filter((item) => item.active).map((item) => [item.id, item.name]))}
          {course && !course.teachers.length && <p className="notice" role="status">{e.needTeacher}</p>}
          {select(e.teacher, form.teacher_id, (value) => setForm({ ...form, teacher_id: value }), (course?.teachers || []).map((item) => [item.id, item.display_name]))}
          {message.text && <p className={`notice ${message.error ? 'error' : 'success'}`} role={message.error ? 'alert' : 'status'}>{message.text}</p>}
          <div className="form-actions"><button className="button primary" type="submit" disabled={busy}>{e.create}</button></div>
        </form>
      </section>
      <section className="panel" aria-labelledby="enroll-list-title">
        <h2 id="enroll-list-title">{e.title}</h2>
        <LoadState t={t} state={enrollments} empty={e.empty} />
        {enrollments.data?.length > 0 && <div className="table-wrap"><table className="data-table">
          <thead><tr><th scope="col">{e.student}</th><th scope="col">{e.course}</th><th scope="col">{e.teacher}</th><th scope="col">{e.status}</th><th scope="col">{u.actions}</th></tr></thead>
          <tbody>{enrollments.data.map((item) => <tr key={item.id}>
            <td><strong>{item.student_name}</strong></td><td>{item.course_name}</td><td>{item.teacher_name}</td>
            <td><select aria-label={`${e.status}: ${item.student_name}, ${item.course_name}`} value={item.status} onChange={async (event) => report(await client.owner.enrollments.update(item.id, { status: event.target.value }), e.saved)}>{['active', 'paused', 'ended'].map((status) => <option key={status} value={status}>{e.statuses[status]}</option>)}</select></td>
            <td className="row-actions"><button className="button quiet" onClick={() => remove(item)} aria-label={`${e.remove}: ${item.student_name}, ${item.course_name}`}>{e.remove}</button></td>
          </tr>)}</tbody>
        </table></div>}
      </section>
    </div>
  </div>;
}

export function UsersPage({ t, client, me }) {
  const p = t.portal; const u = p.users;
  const users = useApi(t, () => client.owner.users.list());
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState({ text: '', error: false });
  const [busy, setBusy] = useState(false);
  const field = (name) => ({ value: form[name], onChange: (event) => setForm({ ...form, [name]: event.target.value }) });
  const toggleRole = (role) => setForm({ ...form, roles: form.roles.includes(role) ? form.roles.filter((item) => item !== role) : [...form.roles, role] });
  const report = (result, success) => {
    const key = apiErrorKey(result);
    setMessage(result.ok ? { text: success, error: false } : { text: key === 'conflict' ? u.usernameTaken : p.errors[key], error: true });
    return result.ok;
  };
  const submit = async (event) => {
    event.preventDefault();
    if (!form.roles.length) { setMessage({ text: u.rolesRequired, error: true }); return; }
    setBusy(true);
    const result = form.id
      ? await client.owner.users.update(form.id, { display_name: form.display_name.trim(), roles: form.roles, ...(form.password ? { password: form.password } : {}) })
      : await client.owner.users.create({ username: form.username.trim(), display_name: form.display_name.trim(), password: form.password, roles: form.roles });
    setBusy(false);
    if (report(result, form.id ? u.saved : u.created)) { setForm(emptyForm); users.reload(); }
  };
  const setActive = async (account, active) => { if (report(await client.owner.users.update(account.id, { active }), u.saved)) users.reload(); };
  const edit = (account) => { setForm({ id: account.id, username: account.username, display_name: account.display_name, password: '', roles: account.roles }); setMessage({ text: '', error: false }); };

  return <div className="page portal-page">
    <h1>{u.title}</h1>
    <p className="page-lede">{u.lede}</p>
    <div className="portal-columns">
      <section className="panel" aria-labelledby="account-form-title">
        <h2 id="account-form-title">{form.id ? u.edit : u.create}</h2>
        <form className="portal-form" onSubmit={submit}>
          <label className="field-label">{p.username}<input {...field('username')} required disabled={Boolean(form.id)} minLength={2} maxLength={80} pattern="[A-Za-z0-9._\-]+" aria-describedby="username-help" autoComplete="off" /><small id="username-help">{u.usernameHelp}</small></label>
          <label className="field-label">{u.displayName}<input {...field('display_name')} required maxLength={120} autoComplete="off" /></label>
          <label className="field-label">{form.id ? u.newPassword : u.initialPassword}<input {...field('password')} type="password" required={!form.id} minLength={8} maxLength={200} aria-describedby="password-help" autoComplete="new-password" /><small id="password-help">{u.passwordHelp}</small></label>
          <fieldset className="role-options"><legend>{u.roles}</legend>{ROLES.map((role) => <label key={role}><input type="checkbox" checked={form.roles.includes(role)} onChange={() => toggleRole(role)} />{p.roles[role]}</label>)}</fieldset>
          {message.text && <p className={`notice ${message.error ? 'error' : 'success'}`} role={message.error ? 'alert' : 'status'}>{message.text}</p>}
          <div className="form-actions"><button className="button primary" type="submit" disabled={busy}>{form.id ? u.save : u.create}</button>{form.id && <button className="button quiet" type="button" onClick={() => { setForm(emptyForm); setMessage({ text: '', error: false }); }}>{u.cancel}</button>}</div>
        </form>
      </section>
      <section className="panel" aria-labelledby="account-list-title">
        <h2 id="account-list-title">{u.title}</h2>
        <LoadState t={t} state={users} empty={u.empty} />
        {users.data?.length > 0 && <div className="table-wrap"><table className="data-table">
          <thead><tr><th scope="col">{u.displayName}</th><th scope="col">{u.roles}</th><th scope="col">{u.status}</th><th scope="col">{u.actions}</th></tr></thead>
          <tbody>{users.data.map((account) => <tr key={account.id}>
            <td><strong>{account.display_name}</strong><small>{account.username}{account.id === me.id ? ` · ${u.you}` : ''}</small></td>
            <td>{account.roles.map((role) => p.roles[role]).join(', ')}</td>
            <td><span className={`status-badge ${account.active ? 'success' : 'neutral'}`}>{account.active ? u.active : u.inactive}</span></td>
            <td className="row-actions"><button className="button quiet" onClick={() => edit(account)} aria-label={`${u.editAction}: ${account.display_name}`}>{u.editAction}</button>{account.id !== me.id && <button className="button quiet" onClick={() => setActive(account, !account.active)} aria-label={`${account.active ? u.deactivate : u.reactivate}: ${account.display_name}`}>{account.active ? u.deactivate : u.reactivate}</button>}</td>
          </tr>)}</tbody>
        </table></div>}
      </section>
    </div>
  </div>;
}

export function BatchesPage({ t, locale = 'en', client }) {
  const b = t.portal.batches;
  const batches = useApi(t, () => client.owner.batches());
  return <div className="page portal-page">
    <h1>{b.ownerTitle}</h1><p className="page-lede">{b.ownerLede}</p>
    <section className="panel">
      <LoadState t={t} state={batches} empty={b.empty} />
      {batches.data?.length > 0 && <div className="table-wrap"><table className="data-table">
        <thead><tr><th scope="col">{b.name}</th><th scope="col">{b.teacher}</th><th scope="col">{b.course}</th><th scope="col">{b.schedule}</th><th scope="col">{b.students}</th><th scope="col">{b.status}</th></tr></thead>
        <tbody>{batches.data.map((batch) => <tr key={batch.id}>
          <td><strong>{batch.name}</strong></td><td>{batch.teacher_name}</td><td>{batch.course_name}</td>
          <td>{batch.days.map((day) => b.dayShort[day]).join(', ')}<small>{timeRange(batch, locale)}</small></td>
          <td>{batch.student_count}</td>
          <td><span className={`status-badge ${batch.status === 'active' ? 'success' : 'neutral'}`}>{batch.status === 'active' ? b.active : b.paused}</span></td>
        </tr>)}</tbody>
      </table></div>}
    </section>
  </div>;
}
