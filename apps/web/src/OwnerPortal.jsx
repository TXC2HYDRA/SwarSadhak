import React, { useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUp, ArrowUpDown, BookOpen, CalendarRange, LayoutDashboard, Plus, Settings as SettingsIcon, UserCheck, Users } from 'lucide-react';
import { useUrlPage } from './router.js';
import { LoadState, PortalShell, Sheet, TableSearch, Toast, matches, useApi } from './PortalShell.jsx';
import { apiErrorKey } from './auth.js';
import { TodayPanel, modeLabel, timeRange } from './ClassViews.jsx';
import { addDays, classKey, formatDate, nowIn, todayIn } from './schedule.js';

const ROLES = ['owner', 'teacher', 'student'];
const emptyForm = { id: null, username: '', display_name: '', password: '', roles: [] };

const noMessage = { text: '', error: false };

export function OwnerPortal({ shell, client, user }) {
  const { t } = shell; const p = t.portal;
  const nav = [['overview', p.nav.overview, LayoutDashboard], ['users', p.nav.users, Users], ['courses', p.nav.courses, BookOpen], ['enrollments', p.nav.enrollments, UserCheck], ['batches', p.nav.batches, CalendarRange], ['settings', p.nav.settings, SettingsIcon]];
  const [page, setPage] = useUrlPage('owner', nav.map(([key]) => key), 'overview');
  return <PortalShell {...shell} kicker={p.roles.owner} nav={nav} page={page} onPage={setPage}>
    {page === 'overview' && <OverviewPage t={t} locale={shell.locale} client={client} onNavigate={setPage} />}
    {page === 'users' && <UsersPage t={t} client={client} me={user} />}
    {page === 'courses' && <CoursesPage t={t} client={client} />}
    {page === 'enrollments' && <EnrollmentsPage t={t} client={client} />}
    {page === 'batches' && <BatchesPage t={t} locale={shell.locale} client={client} />}
    {page === 'settings' && <SettingsPage t={t} client={client} />}
  </PortalShell>;
}

// Exceptions the Owner can act on, derived only from academy records.
export function ownerAttention({ courses = [], students = [], enrollments = [], batches = [] }) {
  const active = enrollments.filter((item) => item.status === 'active');
  const enrolled = new Set(active.map((item) => item.student_id));
  const seated = new Set(batches.filter((batch) => batch.status === 'active').flatMap((batch) => batch.student_ids.map((id) => `${id}:${batch.course_id}`)));
  const pair = (item) => `${item.student_name} · ${item.course_name}`;
  return [
    ['noTeacher', 'courses', courses.filter((course) => course.active && !course.teachers.length).map((course) => course.name)],
    ['notEnrolled', 'enrollments', students.filter((student) => student.active && !enrolled.has(student.id)).map((student) => student.display_name)],
    ['noBatch', 'batches', active.filter((item) => !seated.has(`${item.student_id}:${item.course_id}`)).map(pair)],
    ['pausedBatches', 'batches', batches.filter((batch) => batch.status === 'paused').map((batch) => batch.name)],
    ['pausedEnrollments', 'enrollments', enrollments.filter((item) => item.status === 'paused').map(pair)],
  ].filter(([, , names]) => names.length).map(([key, page, names]) => ({ key, page, names }));
}

export function OverviewPage({ t, locale = 'en', client, now, onNavigate = () => {} }) {
  const o = t.portal.overview;
  const summary = useApi(t, () => client.owner.summary());
  const batches = useApi(t, () => client.owner.batches());
  const courses = useApi(t, () => client.owner.courses.list());
  const students = useApi(t, () => client.owner.users.list('student'));
  const enrollments = useApi(t, () => client.owner.enrollments.list());
  const academy = useApi(t, () => client.academy());
  const timezone = academy.data?.timezone || 'Asia/Kolkata';
  const today = todayIn(timezone, now);
  const classes = useApi(t, () => client.owner.classes(today, addDays(today, 7)), [today]);
  const stats = [['teachers', o.teachers, 'users'], ['students', o.students, 'users'], ['courses', o.courses, 'courses'], ['active_enrollments', o.enrollments, 'enrollments'], ['active_batches', o.batches, 'batches']];
  const loaded = [batches, courses, students, enrollments].every((state) => state.data);
  const attention = loaded ? ownerAttention({ courses: courses.data, students: students.data, enrollments: enrollments.data, batches: batches.data }) : [];
  return <div className="page portal-page">
    <h1>{o.title}</h1><p className="page-lede">{o.lede}</p>
    <LoadState t={t} state={summary} />
    {summary.data && <div className="summary-row"><dl className="metric-strip">{stats.map(([key, label, page]) => <div key={key}><dt>{label}</dt><dd><button type="button" className="metric-link" onClick={() => onNavigate(page)} aria-label={`${label}: ${summary.data[key]}`}>{summary.data[key]}<ArrowRight size={16} aria-hidden="true" /></button></dd></div>)}</dl></div>}
    <div className="workspace-grid owner-grid">
      <TodayPanel t={t} locale={locale} classes={classes.data} today={today} clock={nowIn(timezone, now)} onClass={() => onNavigate('batches')} />
      <section className="panel attention-panel" aria-labelledby="attention-title">
        <h2 id="attention-title">{o.attention}</h2>
        {!loaded ? <div className="skeleton" role="status"><span className="sr-only">{t.portal.users.loading}</span>{[0, 1].map((row) => <span key={row} className="skeleton-row" aria-hidden="true" />)}</div> : !attention.length ? <p>{o.allClear}</p>
          : <ul className="attention-list">{attention.map(({ key, page, names }) => <li key={key}><button type="button" onClick={() => onNavigate(page)}>
            <strong>{names.length}</strong><span><span className="attention-label">{o[key]}</span><small>{names.slice(0, 3).join(', ')}{names.length > 3 ? ` ${o.more.replace('{count}', names.length - 3)}` : ''}</small></span><ArrowRight size={16} aria-hidden="true" />
          </button></li>)}</ul>}
      </section>
    </div>
  </div>;
}

const Notice = ({ message }) => (message.text ? <p className={`notice ${message.error ? 'error' : 'success'}`} role={message.error ? 'alert' : 'status'}>{message.text}</p> : null);

const Heading = ({ title, lede, action, onAction }) => <div className="page-heading-row"><div><h1>{title}</h1><p className="page-lede">{lede}</p></div>
  {action && <button className="button primary" type="button" onClick={onAction}><Plus size={18} aria-hidden="true" />{action}</button>}</div>;

export function CoursesPage({ t, client }) {
  const p = t.portal; const c = p.courses; const u = p.users;
  const courses = useApi(t, () => client.owner.courses.list());
  const teachers = useApi(t, () => client.owner.users.list('teacher'));
  const empty = { id: null, name: '', description: '', teacherIds: [] };
  const [form, setForm] = useState(empty);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState(noMessage);
  const [busy, setBusy] = useState(false);
  const fail = (result, conflictText) => { const key = apiErrorKey(result); setMessage({ text: key === 'conflict' ? conflictText : p.errors[key], error: true }); };
  const toggleTeacher = (id) => setForm({ ...form, teacherIds: form.teacherIds.includes(id) ? form.teacherIds.filter((item) => item !== id) : [...form.teacherIds, id] });
  const show = (next) => { setForm(next); setMessage(noMessage); setOpen(true); };
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    const body = { name: form.name.trim(), description: form.description.trim() };
    const saved = form.id ? await client.owner.courses.update(form.id, body) : await client.owner.courses.create(body);
    const assigned = saved.ok ? await client.owner.courses.setTeachers(saved.data.id, form.teacherIds) : null;
    setBusy(false);
    if (!saved.ok) fail(saved, c.nameTaken);
    else if (!assigned.ok) { fail(assigned, c.teacherInUse); setForm({ ...form, id: saved.data.id }); } // retry updates instead of re-creating
    else { setMessage({ text: form.id ? c.saved : c.created, error: false }); setOpen(false); }
    courses.reload();
  };
  const setActive = async (course, active) => { const result = await client.owner.courses.update(course.id, { active }); if (result.ok) { setMessage({ text: c.saved, error: false }); courses.reload(); } else fail(result, c.nameTaken); };
  const teacherOptions = (teachers.data || []).filter((item) => item.active || form.teacherIds.includes(item.id));
  const rows = (courses.data || []).filter((course) => matches(query, course.name, course.description, ...course.teachers.map((item) => item.display_name)));

  return <div className="page portal-page">
    <Heading title={c.title} lede={c.lede} action={c.create} onAction={() => show(empty)} />
    {!open && <Notice message={message} />}
    <section className="table-section" aria-label={c.title}>
      <TableSearch t={t} value={query} onChange={setQuery} />
      <LoadState t={t} state={courses} empty={c.empty} />
      {courses.data?.length > 0 && !rows.length && <p>{p.noMatches}</p>}
      {rows.length > 0 && <div className="table-wrap"><table className="data-table">
        <thead><tr><th scope="col">{c.name}</th><th scope="col">{c.teachers}</th><th scope="col">{c.enrolled}</th><th scope="col">{u.status}</th><th scope="col">{u.actions}</th></tr></thead>
        <tbody>{rows.map((course) => <tr key={course.id}>
          <td><strong>{course.name}</strong>{course.description && <small>{course.description}</small>}</td>
          <td data-label={c.teachers}>{course.teachers.length ? course.teachers.map((item) => item.display_name).join(', ') : <small>{c.unassigned}</small>}</td>
          <td data-label={c.enrolled}>{course.active_enrollments}</td>
          <td data-label={u.status}><span className={`status-badge ${course.active ? 'success' : 'neutral'}`}>{course.active ? u.active : u.inactive}</span></td>
          <td className="row-actions"><button className="button quiet" onClick={() => show({ id: course.id, name: course.name, description: course.description, teacherIds: course.teachers.map((item) => item.id) })} aria-label={`${u.editAction}: ${course.name}`}>{u.editAction}</button><button className="button quiet" onClick={() => setActive(course, !course.active)} aria-label={`${course.active ? u.deactivate : u.reactivate}: ${course.name}`}>{course.active ? u.deactivate : u.reactivate}</button></td>
        </tr>)}</tbody>
      </table></div>}
    </section>
    <Sheet open={open} title={form.id ? c.edit : c.create} onClose={() => setOpen(false)}>
      <form className="portal-form" onSubmit={submit}>
        <h2>{form.id ? c.edit : c.create}</h2>
        <label className="field-label">{c.name}<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required maxLength={120} /></label>
        <label className="field-label">{c.description}<textarea className="portal-input" rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} maxLength={1000} /></label>
        <fieldset className="role-options"><legend>{c.teachers}</legend>
          {teacherOptions.length ? teacherOptions.map((teacher) => <label key={teacher.id}><input type="checkbox" checked={form.teacherIds.includes(teacher.id)} onChange={() => toggleTeacher(teacher.id)} />{teacher.display_name}</label>) : <small>{teachers.data ? c.noTeachers : u.loading}</small>}
        </fieldset>
        {open && <Notice message={message} />}
        <div className="form-actions"><button className="button primary" type="submit" disabled={busy}>{form.id ? u.save : c.create}</button><button className="button quiet" type="button" onClick={() => setOpen(false)}>{u.cancel}</button></div>
      </form>
    </Sheet>
  </div>;
}

export function EnrollmentsPage({ t, client }) {
  const p = t.portal; const e = p.enrollments; const u = p.users;
  const enrollments = useApi(t, () => client.owner.enrollments.list());
  const students = useApi(t, () => client.owner.users.list('student'));
  const courses = useApi(t, () => client.owner.courses.list());
  const empty = { student_id: '', course_id: '', teacher_id: '' };
  const [form, setForm] = useState(empty);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
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
    if (ok) setOpen(false);
  };
  const remove = async (enrollment) => {
    if (!globalThis.confirm?.(e.confirmRemove)) return;
    report(await client.owner.enrollments.remove(enrollment.id), e.removed);
  };
  const select = (label, value, onChange, options) => <label className="field-label">{label}<select required value={value} onChange={(event) => onChange(event.target.value)}><option value="">{e.choose}</option>{options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>;
  const rows = (enrollments.data || []).filter((item) => matches(query, item.student_name, item.course_name, item.teacher_name, e.statuses[item.status]));

  return <div className="page portal-page">
    <Heading title={e.title} lede={e.lede} action={e.create} onAction={() => { setForm(empty); setMessage(noMessage); setOpen(true); }} />
    {!open && <Notice message={message} />}
    <section className="table-section" aria-label={e.title}>
      <TableSearch t={t} value={query} onChange={setQuery} />
      <LoadState t={t} state={enrollments} empty={e.empty} />
      {enrollments.data?.length > 0 && !rows.length && <p>{p.noMatches}</p>}
      {rows.length > 0 && <div className="table-wrap"><table className="data-table">
        <thead><tr><th scope="col">{e.student}</th><th scope="col">{e.course}</th><th scope="col">{e.teacher}</th><th scope="col">{e.status}</th><th scope="col">{u.actions}</th></tr></thead>
        <tbody>{rows.map((item) => <tr key={item.id}>
          <td><strong>{item.student_name}</strong></td><td data-label={e.course}>{item.course_name}</td><td data-label={e.teacher}>{item.teacher_name}</td>
          <td data-label={e.status}><select aria-label={`${e.status}: ${item.student_name}, ${item.course_name}`} value={item.status} onChange={async (event) => report(await client.owner.enrollments.update(item.id, { status: event.target.value }), e.saved)}>{['active', 'paused', 'ended'].map((status) => <option key={status} value={status}>{e.statuses[status]}</option>)}</select></td>
          <td className="row-actions"><button className="button quiet" onClick={() => remove(item)} aria-label={`${e.remove}: ${item.student_name}, ${item.course_name}`}>{e.remove}</button></td>
        </tr>)}</tbody>
      </table></div>}
    </section>
    <Sheet open={open} title={e.create} onClose={() => setOpen(false)}>
      <form className="portal-form" onSubmit={submit}>
        <h2>{e.create}</h2>
        {select(e.student, form.student_id, (value) => setForm({ ...form, student_id: value }), (students.data || []).filter((item) => item.active).map((item) => [item.id, `${item.display_name} (${item.username})`]))}
        {select(e.course, form.course_id, chooseCourse, (courses.data || []).filter((item) => item.active).map((item) => [item.id, item.name]))}
        {course && !course.teachers.length && <p className="notice" role="status">{e.needTeacher}</p>}
        {select(e.teacher, form.teacher_id, (value) => setForm({ ...form, teacher_id: value }), (course?.teachers || []).map((item) => [item.id, item.display_name]))}
        {open && <Notice message={message} />}
        <div className="form-actions"><button className="button primary" type="submit" disabled={busy}>{e.create}</button><button className="button quiet" type="button" onClick={() => setOpen(false)}>{u.cancel}</button></div>
      </form>
    </Sheet>
  </div>;
}

// Accounts after search, role and status filters, sorted by one column (name by default).
export function accountRows(accounts, { query = '', role = '', status = '', sort = { key: 'name', dir: 1 } }, p) {
  const value = { name: (a) => a.display_name, roles: (a) => a.roles.map((item) => p.roles[item]).join(', '), status: (a) => (a.active ? 0 : 1) };
  return accounts
    .filter((a) => matches(query, a.display_name, a.username, ...a.roles.map((item) => p.roles[item])) && (!role || a.roles.includes(role)) && (!status || (status === 'active') === a.active))
    .sort((a, b) => sort.dir * (String(value[sort.key](a)).localeCompare(String(value[sort.key](b)), undefined, { numeric: true, sensitivity: 'base' }) || a.display_name.localeCompare(b.display_name)));
}

const SortHeader = ({ label, column, sort, onSort }) => {
  const on = sort.key === column;
  const Icon = on ? (sort.dir > 0 ? ArrowUp : ArrowDown) : ArrowUpDown;
  return <th scope="col" aria-sort={on ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}><button type="button" className={`sort-button${on ? ' is-on' : ''}`} onClick={() => onSort({ key: column, dir: on ? -sort.dir : 1 })}>{label}<Icon size={14} aria-hidden="true" /></button></th>;
};

export function UsersPage({ t, client, me }) {
  const p = t.portal; const u = p.users;
  const users = useApi(t, () => client.owner.users.list());
  const [form, setForm] = useState(emptyForm);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState(noMessage);
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState({ key: 'name', dir: 1 });
  const [toast, setToast] = useState(null);
  const field = (name) => ({ value: form[name], onChange: (event) => setForm({ ...form, [name]: event.target.value }) });
  const toggleRole = (role) => setForm({ ...form, roles: form.roles.includes(role) ? form.roles.filter((item) => item !== role) : [...form.roles, role] });
  const show = (next) => { setForm(next); setMessage(noMessage); setOpen(true); };
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
    if (!form.id && result.ok) {
      const account = result.data;
      setOpen(false); users.reload(); setMessage(noMessage);
      setToast({ text: u.created, action: account?.id ? { label: u.viewAccount, run: () => { setToast(null); show({ id: account.id, username: account.username, display_name: account.display_name, password: '', roles: account.roles }); } } : null });
      return;
    }
    if (report(result, form.id ? u.saved : u.created)) { setOpen(false); users.reload(); }
  };
  const setActive = async (account, active) => {
    if (!active && !globalThis.confirm?.(u.confirmDeactivate.replace('{name}', account.display_name))) return;
    if (report(await client.owner.users.update(account.id, { active }), u.saved)) users.reload(); };
  const rows = accountRows(users.data || [], { query, role, status, sort }, p);

  return <div className="page portal-page">
    <Heading title={u.title} lede={u.lede} action={u.create} onAction={() => show(emptyForm)} />
    {!open && <Notice message={message} />}
    <section className="table-section" aria-label={u.title}>
      <div className="table-toolbar">
        <TableSearch t={t} value={query} onChange={setQuery} />
        <label><span className="sr-only">{u.roleFilter}</span><select aria-label={u.roleFilter} value={role} onChange={(event) => setRole(event.target.value)}><option value="">{u.allRoles}</option>{ROLES.map((item) => <option key={item} value={item}>{p.roles[item]}</option>)}</select></label>
        <label><span className="sr-only">{u.statusFilter}</span><select aria-label={u.statusFilter} value={status} onChange={(event) => setStatus(event.target.value)}><option value="">{u.allStatuses}</option><option value="active">{u.active}</option><option value="inactive">{u.inactive}</option></select></label>
      </div>
      <LoadState t={t} state={users} empty={u.empty} />
      {users.data?.length > 0 && !rows.length && <p>{p.noMatches}</p>}
      {rows.length > 0 && <div className="table-wrap"><table className="data-table">
        <thead><tr><SortHeader label={u.displayName} column="name" sort={sort} onSort={setSort} /><SortHeader label={u.roles} column="roles" sort={sort} onSort={setSort} /><SortHeader label={u.status} column="status" sort={sort} onSort={setSort} /><th scope="col">{u.actions}</th></tr></thead>
        <tbody>{rows.map((account) => <tr key={account.id}>
          <td><strong>{account.display_name}</strong><small>{account.username}{account.id === me.id ? ` · ${u.you}` : ''}</small></td>
          <td data-label={u.roles}>{account.roles.map((role) => p.roles[role]).join(', ')}</td>
          <td data-label={u.status}><span className={`status-badge ${account.active ? 'success' : 'neutral'}`}>{account.active ? u.active : u.inactive}</span></td>
          <td className="row-actions"><button className="button quiet" onClick={() => show({ id: account.id, username: account.username, display_name: account.display_name, password: '', roles: account.roles })} aria-label={`${u.editAction}: ${account.display_name}`}>{u.editAction}</button>{account.id !== me.id && <button className={`button quiet${account.active ? ' danger' : ''}`} onClick={() => setActive(account, !account.active)} aria-label={`${account.active ? u.deactivate : u.reactivate}: ${account.display_name}`}>{account.active ? u.deactivate : u.reactivate}</button>}</td>
        </tr>)}</tbody>
      </table></div>}
    </section>
    <Sheet open={open} title={form.id ? u.edit : u.create} onClose={() => setOpen(false)}>
      <form className="portal-form" onSubmit={submit}>
        <h2>{form.id ? u.edit : u.create}</h2>
        <label className="field-label">{p.username}<input {...field('username')} required disabled={Boolean(form.id)} minLength={2} maxLength={80} pattern="[A-Za-z0-9._\-]+" aria-describedby="username-help" autoComplete="off" /><small id="username-help">{u.usernameHelp}</small></label>
        <label className="field-label">{u.displayName}<input {...field('display_name')} required maxLength={120} autoComplete="off" /></label>
        <label className="field-label">{form.id ? u.newPassword : u.initialPassword}<input {...field('password')} type="password" required={!form.id} minLength={8} maxLength={200} aria-describedby="password-help" autoComplete="new-password" /><small id="password-help">{u.passwordHelp}</small></label>
        <fieldset className="role-options"><legend>{u.roles}</legend>{ROLES.map((role) => <label key={role}><input type="checkbox" checked={form.roles.includes(role)} onChange={() => toggleRole(role)} />{p.roles[role]}</label>)}</fieldset>
        {open && <Notice message={message} />}
        <div className="form-actions"><button className="button primary" type="submit" disabled={busy}>{form.id ? u.save : u.create}</button><button className="button quiet" type="button" onClick={() => setOpen(false)}>{u.cancel}</button></div>
      </form>
    </Sheet>
    <Toast toast={toast} dismiss={u.dismiss} onClose={() => setToast(null)} />
  </div>;
}

export function BatchesPage({ t, locale = 'en', client, now }) {
  const b = t.portal.batches;
  const batches = useApi(t, () => client.owner.batches());
  const [query, setQuery] = useState('');
  const rows = (batches.data || []).filter((batch) => matches(query, batch.name, batch.teacher_name, batch.course_name));
  return <div className="page portal-page">
    <h1>{b.ownerTitle}</h1><p className="page-lede">{b.ownerLede}</p>
    {batches.data && <p className="calendar-note">{onlineSummary(b, batches.data)}</p>}
    <section className="table-section" aria-label={b.ownerTitle}>
      <TableSearch t={t} value={query} onChange={setQuery} />
      <LoadState t={t} state={batches} empty={b.empty} />
      {batches.data?.length > 0 && !rows.length && <p>{t.portal.noMatches}</p>}
      {rows.length > 0 && <div className="table-wrap"><table className="data-table">
        <thead><tr><th scope="col">{b.name}</th><th scope="col">{b.teacher}</th><th scope="col">{b.course}</th><th scope="col">{b.schedule}</th><th scope="col">{b.mode}</th><th scope="col">{b.students}</th><th scope="col">{b.status}</th></tr></thead>
        <tbody>{rows.map((batch) => <tr key={batch.id}>
          <td><strong>{batch.name}</strong></td><td data-label={b.teacher}>{batch.teacher_name}</td><td data-label={b.course}>{batch.course_name}</td>
          <td data-label={b.schedule}><span>{batch.days.map((day) => b.dayShort[day]).join(', ')}<small>{timeRange(batch, locale)}</small></span></td>
          <td data-label={b.mode}><span>{modeLabel(b, batch)}{batch.class_mode !== 'offline' && <small>{batch.has_meeting_link ? b.linkAdded : b.noLink}</small>}</span></td>
          <td data-label={b.students}>{batch.student_count}</td>
          <td data-label={b.status}><span className={`status-badge ${batch.status === 'active' ? 'success' : 'neutral'}`}>{batch.status === 'active' ? b.active : b.paused}</span></td>
        </tr>)}</tbody>
      </table></div>}
    </section>
    <OwnerClasses t={t} locale={locale} client={client} now={now} />
  </div>;
}

// "Online or hybrid batches: 3. Teachers teaching online: 2." Active batches only.
export const onlineSummary = (b, batches) => {
  const online = batches.filter((batch) => batch.status === 'active' && batch.class_mode && batch.class_mode !== 'offline');
  return b.classes.onlineSummary.replace('{batches}', online.length).replace('{teachers}', new Set(online.map((batch) => batch.teacher_id)).size);
};

// Read-only: every dated class in the next 7 days, including teachers' one-off changes. Mode and status, never a link.
export function OwnerClasses({ t, locale, client, now }) {
  const b = t.portal.batches; const c = b.classes; const p = t.portal.teacher;
  const academy = useApi(t, () => client.academy());
  const today = todayIn(academy.data?.timezone || 'Asia/Kolkata', now);
  const classes = useApi(t, () => client.owner.classes(today, addDays(today, 7)), [today]);
  const [teacher, setTeacher] = useState('');
  const [onlineOnly, setOnlineOnly] = useState(false);
  const teachers = [...new Map((classes.data || []).map((k) => [k.teacher_id, k.teacher_name])).entries()].sort((x, y) => x[1].localeCompare(y[1]));
  const rows = (classes.data || []).filter((k) => (!teacher || k.teacher_id === teacher) && (!onlineOnly || k.class_mode !== 'offline'));
  const day = (iso) => formatDate(iso, locale, { weekday: 'short', day: 'numeric', month: 'short' });
  return <section className="table-section owner-classes" aria-labelledby="owner-classes-title">
    <h2 id="owner-classes-title">{c.ownerTitle}</h2><p className="calendar-note">{c.ownerLede}</p>
    <div className="table-toolbar">
      <label><span className="sr-only">{b.teacher}</span><select aria-label={b.teacher} value={teacher} onChange={(event) => setTeacher(event.target.value)}><option value="">{c.allTeachers}</option>{teachers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label className="check-filter"><input type="checkbox" checked={onlineOnly} onChange={(event) => setOnlineOnly(event.target.checked)} />{c.onlineOnly}</label>
    </div>
    <LoadState t={t} state={classes} empty={c.none} />
    {classes.data?.length > 0 && !rows.length && <p>{t.portal.noMatches}</p>}
    {rows.length > 0 && <div className="table-wrap"><table className="data-table">
      <thead><tr><th scope="col">{c.date}</th><th scope="col">{b.name}</th><th scope="col">{b.teacher}</th><th scope="col">{b.mode}</th><th scope="col">{b.status}</th></tr></thead>
      <tbody>{rows.map((k) => <tr key={classKey(k)}>
        <td><span><strong>{day(k.date)}</strong><small>{timeRange(k, locale)}</small></span></td>
        <td data-label={b.name}><span>{k.batch_name}<small>{k.course_name}</small></span></td>
        <td data-label={b.teacher}>{k.teacher_name}</td>
        <td data-label={b.mode}>{modeLabel(b, k)}</td>
        <td data-label={b.status}><span className="status-cell">{k.status === 'cancelled' ? <span className="status-badge danger">{p.cancelled}</span>
          : k.status === 'rescheduled' ? <span className="status-badge warning">{p.movedFrom.replace('{date}', day(k.original_date))}</span>
            : <span className="status-badge neutral">{c.scheduled}</span>}{k.note && <small>{k.note}</small>}</span></td>
      </tr>)}</tbody>
    </table></div>}
  </section>;
}

// Academy integrations. Google credentials are environment variables on the API server; the Owner only decides
// whether teachers may connect their own Google accounts.
export function SettingsPage({ t, client }) {
  const g = t.portal.google;
  const state = useApi(t, () => client.owner.integrations.get());
  const [message, setMessage] = useState(noMessage);
  const [busy, setBusy] = useState(false);
  const meet = state.data?.google;
  const toggle = async (enabled) => {
    setBusy(true);
    const result = await client.owner.integrations.update({ google_enabled: enabled });
    setBusy(false);
    if (!result.ok) return setMessage({ text: t.portal.errors[apiErrorKey(result)], error: true });
    setMessage({ text: g.saved, error: false }); state.reload();
  };
  return <div className="page portal-page">
    <h1>{g.settingsTitle}</h1><p className="page-lede">{g.settingsLede}</p>
    {message.text && <div className={`notice ${message.error ? 'error' : 'success'}`} role={message.error ? 'alert' : 'status'}>{message.text}</div>}
    <LoadState t={t} state={state} />
    {meet && <section className="panel integration-card" aria-labelledby="meet-integration-title">
      <h2 id="meet-integration-title">{g.meetTitle}</h2>
      <p className={meet.configured ? undefined : 'notice warning'}>{meet.configured ? g.configured : g.notConfigured}</p>
      <label className="check-filter"><input type="checkbox" checked={meet.enabled} disabled={!meet.configured || busy} onChange={(event) => toggle(event.target.checked)} />{g.allow}</label>
      <p className="calendar-note">{g.connectedTeachers.replace('{count}', meet.connected_teachers)}</p>
      <p className="calendar-note">{g.testingNote}</p>
    </section>}
  </div>;
}
