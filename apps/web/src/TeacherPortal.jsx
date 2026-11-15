import React, { useState } from 'react';
import { Search } from 'lucide-react';
import { LoadState, PortalShell, useApi } from './PortalShell.jsx';

export function TeacherPortal({ shell, client }) {
  const [page, setPage] = useState('dashboard');
  const { t } = shell;
  return <PortalShell {...shell} nav={[['dashboard', t.portal.nav.dashboard]]} page={page} onPage={setPage}>
    <TeacherDashboard t={t} client={client} />
  </PortalShell>;
}

export function filterStudents(students = [], query = '', courseId = '') {
  const needle = query.trim().toLocaleLowerCase();
  return students.filter((student) => (!courseId || student.courses.some((course) => course.id === courseId))
    && (!needle || student.display_name.toLocaleLowerCase().includes(needle) || student.username.toLocaleLowerCase().includes(needle)));
}

export function TeacherDashboard({ t, client }) {
  const p = t.portal.teacher;
  const summary = useApi(t, () => client.teacher.summary());
  const courses = useApi(t, () => client.teacher.courses());
  const students = useApi(t, () => client.teacher.students());
  const [query, setQuery] = useState('');
  const [courseId, setCourseId] = useState('');
  const visible = filterStudents(students.data || [], query, courseId);
  return <div className="page portal-page">
    <h1>{p.title}</h1><p className="page-lede">{p.lede}</p>
    <section className="stats-grid portal-stats"><div className="stat-card"><strong>{summary.data?.student_count ?? '–'}</strong><small>{p.studentCount}</small></div></section>
    <section className="panel" aria-labelledby="my-students-title">
      <h2 id="my-students-title">{p.students}</h2>
      <div className="filter-controls">
        <label className="search-field"><Search size={16} aria-hidden="true" /><span className="sr-only">{p.search}</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={p.search} aria-label={p.search} /></label>
        <label><span className="sr-only">{p.courseFilter}</span><select aria-label={p.courseFilter} value={courseId} onChange={(event) => setCourseId(event.target.value)}><option value="">{p.allCourses}</option>{(courses.data || []).map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}</select></label>
      </div>
      <LoadState t={t} state={students} empty={p.noStudents} />
      {students.data?.length > 0 && !visible.length && <p>{p.noMatches}</p>}
      {visible.length > 0 && <ul className="student-list">{visible.map((student) => <li key={student.id}><strong>{student.display_name}</strong><small>{student.username}</small><span className="chip-row">{student.courses.map((course) => <span className="chip" key={course.id}>{course.name}</span>)}</span></li>)}</ul>}
    </section>
  </div>;
}
