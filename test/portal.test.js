import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { createApiClient, toApiSession } from '@swarsadhak/api-client';
import { getTranslations, supportedLocales } from '@swarsadhak/localization';
import { apiErrorKey, choosePortal, clearSession, loginErrorKey, readSession, writeSession } from '../apps/web/src/auth.js';
import { addDays, batchFormErrors, formatTime, mondayOf, slotForm, todayIn, visibleRange, weekDates, weekOccurrences } from '../apps/web/src/schedule.js';

const memoryStorage = () => { const values = new Map(); return { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)), removeItem: (k) => values.delete(k) }; };

let server, web;
before(async () => {
  server = await createServer({ root: fileURLToPath(new URL('../apps/web', import.meta.url)), server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: 'custom', logLevel: 'silent' });
  web = {
    ...(await server.ssrLoadModule('/src/AccountRoot.jsx')),
    ...(await server.ssrLoadModule('/src/OwnerPortal.jsx')),
    ...(await server.ssrLoadModule('/src/optionalSync.js')),
    ...(await server.ssrLoadModule('/src/TeacherPortal.jsx')),
    ...(await server.ssrLoadModule('/src/BatchCalendar.jsx')),
    ...(await server.ssrLoadModule('/src/StudentTimetable.jsx')),
    App: (await server.ssrLoadModule('/src/main.jsx')).App,
  };
});
after(async () => { await server?.close(); });

test('sessions round-trip through storage and reject malformed data', () => {
  const storage = memoryStorage();
  assert.equal(readSession(storage), null);
  assert.equal(writeSession({ token: 'tok', user: { id: 'u1', roles: ['student'] } }, storage), true);
  assert.deepEqual(readSession(storage), { token: 'tok', user: { id: 'u1', roles: ['student'] } });
  storage.setItem('swar-account-v1', '{broken');
  assert.equal(readSession(storage), null);
  clearSession(storage);
  assert.equal(storage.getItem('swar-access-token'), null);
});

test('portal choice honours the saved preference only when the role is held', () => {
  assert.equal(choosePortal(['student', 'teacher'], 'student'), 'student');
  assert.equal(choosePortal(['student', 'teacher'], 'owner'), 'teacher');
  assert.equal(choosePortal(['student', 'owner', 'teacher']), 'owner');
  assert.equal(choosePortal([]), null);
  assert.equal(choosePortal(undefined), null);
});

test('API failures map to translated error keys', () => {
  assert.equal(loginErrorKey({ status: 401 }), 'invalidCredentials');
  assert.equal(loginErrorKey({ status: 403 }), 'deactivated');
  assert.equal(loginErrorKey({ status: 429 }), 'tooManyAttempts');
  assert.equal(loginErrorKey({ offline: true, status: 0 }), 'network');
  assert.equal(apiErrorKey({ status: 409 }), 'conflict');
  assert.equal(apiErrorKey({ status: 500 }), 'generic');
  for (const locale of supportedLocales) {
    const { errors } = getTranslations(locale).portal;
    for (const key of ['invalidCredentials', 'deactivated', 'tooManyAttempts', 'network', 'conflict', 'generic', 'sessionExpired', 'forbidden', 'notFound', 'invalid']) assert.equal(typeof errors[key], 'string', `${locale}.${key}`);
  }
});

test('the brand is NadoPasana in English and नादोपासना in Marathi and Hindi', () => {
  assert.equal(getTranslations('en').brand.name, 'NadoPasana');
  assert.equal(getTranslations('mr').brand.name, 'नादोपासना');
  assert.equal(getTranslations('hi').brand.first + getTranslations('hi').brand.second, 'नादोपासना');
});

test('local sessions are converted to the flat API summary shape', () => {
  const summary = toApiSession({ id: 's1', exerciseId: 'sa-sustain', tonicFrequency: 261.63, startedAt: '2026-01-01T00:00:00Z', endedAt: '2026-01-01T00:00:30Z', durationSeconds: 30, accountId: 'u1', metrics: { reliableFrameCount: 40, totalFrameCount: 50, reliablePitchMatchPercent: 90, medianAbsoluteCents: 8, quality: { reliableRatio: 0.8 } }, completion: { completed: true } });
  assert.deepEqual(summary, { id: 's1', exercise_id: 'sa-sustain', tonic_frequency: 261.63, started_at: '2026-01-01T00:00:00Z', ended_at: '2026-01-01T00:00:30Z', duration_seconds: 30, reliable_frame_count: 40, total_frame_count: 50, reliable_pitch_match_percent: 90, median_absolute_cents: 8, pitch_stability_cents: null, min_frequency_hz: null, max_frequency_hz: null, quality: { reliableRatio: 0.8 }, completion: { completed: true } });
});

test('sync uploads only this account’s sessions and only teachers’ own routines', () => {
  const sessions = [{ id: 'mine', accountId: 'u1', metrics: {} }, { id: 'theirs', accountId: 'u2', metrics: {} }, { id: 'offline', metrics: {} }];
  const routines = [{ id: 'routine-morning-foundation' }, { id: 'routine-custom-1' }];
  const asStudent = web.syncPayload({ sessions, routines, account: { id: 'u1', roles: ['student'] } });
  assert.deepEqual(asStudent.sessions.map((s) => s.id), ['mine']);
  assert.deepEqual(asStudent.routines, []);
  const asTeacher = web.syncPayload({ sessions, routines, account: { id: 'u1', roles: ['teacher'] } });
  assert.deepEqual(asTeacher.routines.map((r) => r.id), ['routine-custom-1']);
});

test('the API client signs out on 401 only for authenticated calls and calls owner endpoints', async () => {
  let signedOut = 0; const calls = [];
  const fetchImpl = async (url, options) => { calls.push([url, options.method || 'GET']); return new Response('{"detail":"x"}', { status: 401 }); };
  await createApiClient({ baseUrl: 'http://api.test', fetchImpl, onUnauthorized: () => signedOut++ }).auth.login({});
  assert.equal(signedOut, 0);
  const client = createApiClient({ baseUrl: 'http://api.test', token: 't', fetchImpl, onUnauthorized: () => signedOut++ });
  await client.owner.users.list('teacher'); await client.owner.users.create({}); await client.owner.users.update('a b', {});
  assert.equal(signedOut, 3);
  assert.deepEqual(calls.slice(1), [['http://api.test/api/owner/users?role=teacher', 'GET'], ['http://api.test/api/owner/users', 'POST'], ['http://api.test/api/owner/users/a%20b', 'PATCH']]);
});

test('without a configured backend the app opens the offline studio, not a sign-in screen', () => {
  const html = renderToStaticMarkup(React.createElement(web.AccountRoot, { apiUrl: '' }));
  assert.doesNotMatch(html, /Sign in to NadoPasana/);
  assert.match(html, /Nado<span>Pasana<\/span>/);
});

test('with a backend and no session the sign-in screen is shown with an offline option', () => {
  const html = renderToStaticMarkup(React.createElement(web.AccountRoot, { apiUrl: 'http://api.test' }));
  assert.match(html, /Sign in to NadoPasana/);
  assert.match(html, /autoComplete="current-password"|autocomplete="current-password"/);
  assert.match(html, /Practise without an account/);
});

test('sign-in and owner account screens render in every locale', () => {
  for (const locale of supportedLocales) {
    const t = getTranslations(locale);
    const login = renderToStaticMarkup(React.createElement(web.LoginPage, { t, locale, onLocale() {}, onSubmit() {}, onGuest() {} }));
    assert.match(login, new RegExp(t.portal.signInTitle));
    const users = renderToStaticMarkup(React.createElement(web.UsersPage, { t, client: { owner: { users: { list: async () => ({ ok: true, data: [] }) } } }, me: { id: 'u1' } }));
    assert.match(users, new RegExp(t.portal.users.loading));
    for (const role of ['owner', 'teacher', 'student']) assert.match(users, new RegExp(t.portal.roles[role]));
  }
});

const pending = () => new Promise(() => {});
const stubClient = { owner: { summary: pending, users: { list: pending }, courses: { list: pending }, enrollments: { list: pending } }, teacher: { summary: pending, courses: pending, students: pending } };

test('owner academy pages and the teacher dashboard render in every locale', () => {
  for (const locale of supportedLocales) {
    const t = getTranslations(locale); const p = t.portal;
    const render = (Component) => renderToStaticMarkup(React.createElement(Component, { t, client: stubClient }));
    assert.match(render(web.OverviewPage), new RegExp(p.overview.title));
    assert.match(render(web.CoursesPage), new RegExp(p.courses.create));
    const enrollments = render(web.EnrollmentsPage);
    assert.match(enrollments, new RegExp(p.enrollments.create));
    assert.match(enrollments, new RegExp(p.enrollments.choose));
    const dashboard = render(web.TeacherDashboard);
    assert.match(dashboard, new RegExp(p.teacher.studentCount));
    assert.match(dashboard, new RegExp(p.teacher.allCourses));
  }
});

test('teacher student filter matches name or username within a course', () => {
  const students = [
    { id: 'a', display_name: 'Asha Patil', username: 'asha', courses: [{ id: 'vocal' }] },
    { id: 'b', display_name: 'Bilal', username: 'b.khan', courses: [{ id: 'tabla' }, { id: 'vocal' }] },
  ];
  assert.deepEqual(web.filterStudents(students, 'pat').map((s) => s.id), ['a']);
  assert.deepEqual(web.filterStudents(students, 'KHAN').map((s) => s.id), ['b']);
  assert.deepEqual(web.filterStudents(students, '', 'tabla').map((s) => s.id), ['b']);
  assert.deepEqual(web.filterStudents(students, 'asha', 'tabla'), []);
});

test('API client builds course, enrollment and teacher requests', async () => {
  const calls = [];
  const client = createApiClient({ baseUrl: 'http://api.test', token: 't', fetchImpl: async (url, options) => { calls.push([url, options.method || 'GET', options.body]); return new Response('{}'); } });
  await client.owner.courses.setTeachers('c1', ['t1']);
  await client.owner.enrollments.remove('e1');
  await client.teacher.students({ q: 'a b', courseId: 'c1' });
  await client.teacher.students();
  assert.deepEqual(calls, [
    ['http://api.test/api/owner/courses/c1/teachers', 'PUT', '{"teacher_ids":["t1"]}'],
    ['http://api.test/api/owner/enrollments/e1', 'DELETE', undefined],
    ['http://api.test/api/teacher/students?q=a+b&course_id=c1', 'GET', undefined],
    ['http://api.test/api/teacher/students?q=', 'GET', undefined],
  ]);
});

test('week dates are computed in UTC so month, year and DST changes never shift a day', () => {
  assert.equal(mondayOf('2026-11-22'), '2026-11-16');
  assert.equal(mondayOf('2026-11-16'), '2026-11-16');
  assert.deepEqual(weekDates(mondayOf('2026-11-01')), ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
  assert.equal(mondayOf('2026-10-25'), '2026-10-19'); // Europe/London leaves summer time on this Sunday
  assert.equal(todayIn('Europe/London', new Date('2026-10-24T23:30:00Z')), '2026-10-25');
  assert.equal(todayIn('Europe/London', new Date('2026-10-25T23:30:00Z')), '2026-10-25');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  const lateEvening = new Date('2026-11-15T19:00:00Z');
  assert.equal(todayIn('Asia/Kolkata', lateEvening), '2026-11-16');
  assert.equal(todayIn('America/New_York', lateEvening), '2026-11-15');
});

test('batch occurrences start on the batch start date and the visible range widens to fit', () => {
  const batch = { id: 'b1', days: ['mon', 'wed'], starts_on: '2026-11-18', start_time: '05:30', end_time: '23:15' };
  assert.deepEqual(weekOccurrences([batch], '2026-11-16').map((item) => [item.dayIndex, item.date]), [[2, '2026-11-18']]);
  assert.deepEqual(weekOccurrences([batch], '2026-11-23').map((item) => item.date), ['2026-11-23', '2026-11-25']);
  assert.deepEqual(visibleRange([]), { start: 360, end: 1320 });
  assert.deepEqual(visibleRange([batch]), { start: 300, end: 1440 });
});

test('slot defaults and batch form validation', () => {
  assert.deepEqual(slotForm(0, 18 * 60), { days: ['mon'], start_time: '18:00', end_time: '19:00' });
  assert.deepEqual(slotForm(6, 23 * 60 + 30), { days: ['sun'], start_time: '23:30', end_time: '23:59' });
  assert.deepEqual(batchFormErrors({ name: ' ', course_id: '', days: [], start_time: '19:00', end_time: '18:00' }), ['name', 'course', 'days', 'endAfterStart']);
  assert.deepEqual(batchFormErrors({ name: 'Evening', course_id: 'c1', days: ['mon'], start_time: '18:00', end_time: '19:00' }), []);
  assert.match(formatTime('18:00', 'en'), /^6:00\sPM$/u);
  assert.match(formatTime('07:05', 'en'), /^7:05\sAM$/u);
});

const sampleBatch = { id: 'b1', name: 'Evening Riyaz', course_id: 'c1', course_name: 'Vocal', start_time: '18:00', end_time: '19:00', days: ['mon', 'wed'], starts_on: '2026-11-01', status: 'active', student_ids: ['s1'] };

test('the batch calendar renders blocks, today and accessible slots in every locale', () => {
  for (const locale of supportedLocales) {
    const t = getTranslations(locale); const b = t.portal.batches;
    const render = (batches) => renderToStaticMarkup(React.createElement(web.BatchCalendar, { t, locale, batches, timezone: 'Asia/Kolkata', today: '2026-11-18', selected: null, onSlot() {}, onBatch() {} }));
    const html = render([sampleBatch, { ...sampleBatch, id: 'b2', name: 'Morning', start_time: '07:00', end_time: '07:30', days: ['fri'], status: 'paused' }]);
    assert.equal(html.match(/class="cal-block/g).length, 3);
    assert.equal(html.match(/is-paused/g).length, 1);
    assert.equal(html.match(/class="cal-day[^"]*is-today/g).length, 1);
    assert.equal(html.match(/tabindex="0"/g).length, 1);
    assert.match(html, /Evening Riyaz/);
    assert.ok(html.includes('Asia/Kolkata'));
    assert.ok(html.includes(b.dayLong.mon) && html.includes(b.slotAction));
    assert.equal(render([{ ...sampleBatch, starts_on: '2026-12-01' }]).match(/class="cal-block/g), null);
    assert.ok(render([]).replaceAll('&quot;', '"').includes(b.empty));
  }
});

test('the batch dialog offers only students enrolled in the chosen course', () => {
  const t = getTranslations('en'); const b = t.portal.batches;
  const students = [
    { id: 's1', display_name: 'Asha', username: 'asha', courses: [{ id: 'c1', name: 'Vocal' }] },
    { id: 's2', display_name: 'Bilal', username: 'bilal', courses: [{ id: 'c2', name: 'Tabla' }] },
  ];
  const render = (state) => renderToStaticMarkup(React.createElement(web.BatchDialog, { t, locale: 'en', state, courses: [{ id: 'c1', name: 'Vocal' }], students, onClose() {}, onSave() {}, onRemove() {}, onToggle() {} }));
  assert.doesNotMatch(render(null), /<form/);
  const created = render({ form: { name: '', course_id: 'c1', start_time: '18:00', end_time: '19:00', days: ['mon'], student_ids: [] } });
  assert.match(created, new RegExp(b.create));
  assert.match(created, /Asha/);
  assert.doesNotMatch(created, /Bilal/);
  assert.equal(created.match(/aria-pressed="true"/g).length, 1);
  assert.doesNotMatch(created, new RegExp(b.remove));
  const edited = render({ batch: { ...sampleBatch, status: 'paused' }, form: { ...sampleBatch, student_ids: ['s1'] } });
  assert.match(edited, new RegExp(b.resume));
  assert.match(edited, new RegExp(b.remove));
  assert.match(render({ form: { name: '', course_id: '', start_time: '18:00', end_time: '19:00', days: [], student_ids: [] } }), new RegExp(b.chooseCourseFirst));
});

test('owner batches page and teacher create button render in every locale', () => {
  for (const locale of supportedLocales) {
    const t = getTranslations(locale); const b = t.portal.batches;
    assert.match(renderToStaticMarkup(React.createElement(web.BatchesPage, { t, locale, client: stubClient })), new RegExp(b.ownerTitle));
    const dashboard = renderToStaticMarkup(React.createElement(web.TeacherDashboard, { t, locale, client: stubClient }));
    assert.match(dashboard, new RegExp(b.create));
    assert.match(dashboard, new RegExp(b.activeBatches));
  }
});

test('API client builds batch and academy requests', async () => {
  const calls = [];
  const client = createApiClient({ baseUrl: 'http://api.test', token: 't', fetchImpl: async (url, options) => { calls.push([url, options.method || 'GET', options.body]); return new Response('{}'); } });
  await client.teacher.batches.list();
  await client.teacher.batches.create({ name: 'A' });
  await client.teacher.batches.update('b/1', { status: 'paused' });
  await client.teacher.batches.remove('b1');
  await client.owner.batches();
  await client.academy();
  assert.deepEqual(calls, [
    ['http://api.test/api/teacher/batches', 'GET', undefined],
    ['http://api.test/api/teacher/batches', 'POST', '{"name":"A"}'],
    ['http://api.test/api/teacher/batches/b%2F1', 'PATCH', '{"status":"paused"}'],
    ['http://api.test/api/teacher/batches/b1', 'DELETE', undefined],
    ['http://api.test/api/owner/batches', 'GET', undefined],
    ['http://api.test/api/academy', 'GET', undefined],
  ]);
});

test('the student timetable groups batches by weekday and the student app links to it', () => {
  const batches = [{ id: 'b1', days: ['thu', 'tue'] }, { id: 'b2', days: ['tue'] }];
  assert.deepEqual(web.timetableDays(batches).map(({ day, items }) => [day, items.map((item) => item.id)]), [['tue', ['b1', 'b2']], ['thu', ['b1']]]);
  assert.deepEqual(web.timetableDays([]), []);
  const client = { student: { batches: pending }, academy: pending };
  for (const locale of supportedLocales) {
    const t = getTranslations(locale); const s = t.portal.student;
    const html = renderToStaticMarkup(React.createElement(web.StudentTimetable, { t, locale, client }));
    assert.match(html, new RegExp(s.title));
    assert.match(html, new RegExp(t.portal.users.loading));
  }
  const t = getTranslations('en');
  const withTimetable = renderToStaticMarkup(React.createElement(web.App, { account: { id: 'u1', roles: ['student'] }, timetable: () => null }));
  assert.match(withTimetable, new RegExp(`<span>${t.portal.student.nav}</span>`));
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(web.App, { account: { id: 'u1', roles: ['student'] } })), new RegExp(`<span>${t.portal.student.nav}</span>`));
});

test('API client calls the student timetable endpoint', async () => {
  const calls = [];
  const client = createApiClient({ baseUrl: 'http://api.test', token: 't', fetchImpl: async (url) => { calls.push(url); return new Response('[]'); } });
  assert.deepEqual((await client.student.batches()).data, []);
  assert.deepEqual(calls, ['http://api.test/api/student/batches']);
});
