import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { createApiClient, toApiSession } from '@swarsadhak/api-client';
import { getTranslations, supportedLocales } from '@swarsadhak/localization';
import { apiErrorKey, choosePortal, clearSession, loginErrorKey, readSession, writeSession } from '../apps/web/src/auth.js';
import { ACCEPT, checkFile, fileErrorKey, fileType, formatSize, uploadFile } from '../apps/web/src/files.js';
import { addDays, batchFormErrors, classesOn, formatTime, mondayOf, nextClass, nowIn, slotForm, todayIn, visibleRange, weekDates, weekOccurrences } from '../apps/web/src/schedule.js';

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
    ...(await server.ssrLoadModule('/src/Assignments.jsx')),
    App: (await server.ssrLoadModule('/src/main.jsx')).App,
    LandingPage: (await server.ssrLoadModule('/src/main.jsx')).LandingPage,
    LoadState: (await server.ssrLoadModule('/src/PortalShell.jsx')).LoadState,
    withTransition: (await server.ssrLoadModule('/src/router.js')).withTransition,
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

test('batch occurrences start on the batch start date and the visible range fits the batches', () => {
  const batch = { id: 'b1', days: ['mon', 'wed'], starts_on: '2026-11-18', start_time: '05:30', end_time: '23:15' };
  assert.deepEqual(weekOccurrences([batch], '2026-11-16').map((item) => [item.dayIndex, item.date]), [[2, '2026-11-18']]);
  assert.deepEqual(weekOccurrences([batch], '2026-11-23').map((item) => item.date), ['2026-11-23', '2026-11-25']);
  assert.deepEqual(visibleRange([]), { start: 360, end: 1320 });
  assert.deepEqual(visibleRange([batch]), { start: 240, end: 1440 }); // an hour of air, clamped to midnight
  assert.deepEqual(visibleRange([{ ...batch, start_time: '18:00', end_time: '19:00' }]), { start: 900, end: 1380 }); // at least 8 hours
  assert.deepEqual(visibleRange([{ ...batch, start_time: '07:00', end_time: '08:00' }, { ...batch, start_time: '18:00', end_time: '19:00' }]), { start: 360, end: 1200 });
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

test('today and next class come from active batches in academy time', () => {
  const evening = { ...sampleBatch, id: 'eve', days: ['mon', 'wed'] };
  const morning = { ...sampleBatch, id: 'mor', start_time: '07:00', end_time: '08:00', days: ['wed'] };
  const paused = { ...sampleBatch, id: 'off', days: ['wed'], start_time: '12:00', end_time: '13:00', status: 'paused' };
  const all = [evening, paused, morning];
  assert.deepEqual(classesOn(all, '2026-11-18').map((item) => item.batch.id), ['mor', 'eve']); // sorted, paused left out
  assert.equal(nextClass(all, '2026-11-18', '07:30').batch.id, 'mor'); // running now
  assert.equal(nextClass(all, '2026-11-18', '08:00').batch.id, 'eve');
  assert.deepEqual([nextClass(all, '2026-11-18', '19:00').date, nextClass(all, '2026-11-18', '19:00').batch.id], ['2026-11-23', 'eve']); // next Monday
  assert.equal(nextClass([paused], '2026-11-18', '00:00'), null);
  assert.equal(nowIn('Asia/Kolkata', new Date('2026-11-18T12:45:00Z')), '18:15');
  const t = getTranslations('en');
  const html = renderToStaticMarkup(React.createElement(web.TodayPanel, { t, locale: 'en', batches: all, today: '2026-11-18', clock: '07:30', onBatch() {} }));
  assert.match(html, /class="is-live"/);
  assert.match(html, /class="is-upNext"/);
  assert.ok(html.includes(t.portal.teacher.live) && html.includes(t.portal.teacher.upNext));
  const empty = renderToStaticMarkup(React.createElement(web.TodayPanel, { t, locale: 'en', batches: [evening], today: '2026-11-17', clock: '09:00', onBatch() {} }));
  assert.ok(empty.includes(t.portal.teacher.todayEmpty) && empty.includes(`${t.portal.teacher.nextClass}:`));
  assert.ok(!renderToStaticMarkup(React.createElement(web.TodayPanel, { t, locale: 'en', batches: null, today: '2026-11-17', clock: '09:00', onBatch() {} })).includes(t.portal.teacher.todayEmpty)); // nothing claimed before data loads
});

test('owner attention lists only real exceptions, and owner tables search and open forms in sheets', () => {
  const courses = [{ id: 'c1', name: 'Vocal', active: true, teachers: [{ id: 't1' }] }, { id: 'c2', name: 'Tabla', active: true, teachers: [] }, { id: 'c3', name: 'Old', active: false, teachers: [] }];
  const students = [{ id: 's1', display_name: 'Asha', active: true }, { id: 's2', display_name: 'Ravi', active: true }, { id: 's3', display_name: 'Gone', active: false }];
  const enrollments = [{ id: 'e1', student_id: 's1', course_id: 'c1', student_name: 'Asha', course_name: 'Vocal', status: 'active' }, { id: 'e2', student_id: 's2', course_id: 'c1', student_name: 'Ravi', course_name: 'Vocal', status: 'paused' }];
  const batches = [{ id: 'b1', name: 'Evening', course_id: 'c1', status: 'active', student_ids: ['s2'] }];
  const found = Object.fromEntries(web.ownerAttention({ courses, students, enrollments, batches }).map((item) => [item.key, item.names]));
  assert.deepEqual(found, { noTeacher: ['Tabla'], notEnrolled: ['Ravi'], noBatch: ['Asha · Vocal'], pausedEnrollments: ['Ravi · Vocal'] });
  assert.deepEqual(web.ownerAttention({ courses: courses.slice(0, 1), students: students.slice(0, 1), enrollments: enrollments.slice(0, 1), batches: [{ ...batches[0], student_ids: ['s1'] }] }), []);
  for (const locale of supportedLocales) {
    const t = getTranslations(locale); const p = t.portal;
    assert.ok(['attention', 'allClear', 'noTeacher', 'notEnrolled', 'noBatch', 'pausedBatches', 'pausedEnrollments', 'more'].every((key) => p.overview[key]) && p.search && p.noMatches, locale);
    const overview = renderToStaticMarkup(React.createElement(web.OverviewPage, { t, locale, client: stubClient }));
    assert.ok(overview.includes(p.overview.attention) && overview.includes(p.teacher.classesToday), locale);
    const users = renderToStaticMarkup(React.createElement(web.UsersPage, { t, client: stubClient, me: { id: 'u1' } }));
    assert.match(users, /<dialog class="sheet-dialog"/);
    assert.match(users, new RegExp(`aria-label="${p.search}"`));
  }
});

test('the batch calendar renders blocks, today and accessible slots in every locale', () => {
  for (const locale of supportedLocales) {
    const t = getTranslations(locale); const b = t.portal.batches;
    const render = (batches) => renderToStaticMarkup(React.createElement(web.BatchCalendar, { t, locale, batches, timezone: 'Asia/Kolkata', today: '2026-11-18', selected: null, onSlot() {}, onBatch() {} }));
    const html = render([sampleBatch, { ...sampleBatch, id: 'b2', name: 'Morning', start_time: '07:00', end_time: '07:30', days: ['fri'], status: 'paused' }]);
    assert.equal(html.match(/class="cal-block/g).length, 3);
    assert.equal(html.match(/class="cal-block is-paused/g).length, 1);
    assert.equal(html.match(/class="cal-agenda-item/g).length, 3); // list view / phone agenda has the same classes
    assert.equal(html.match(/class="cal-agenda-item is-paused/g).length, 1);
    assert.equal(html.match(new RegExp(`<p class="calendar-note">${b.noClasses}</p>`, 'g')).length, 4); // tue, thu, sat, sun
    assert.match(html, new RegExp(`class="cal-legend" aria-label="${b.legend}"`));
    assert.ok(!html.includes('cal-now'));
    assert.equal(renderToStaticMarkup(React.createElement(web.BatchCalendar, { t, locale, batches: [sampleBatch], timezone: 'Asia/Kolkata', today: '2026-11-18', now: '18:30', selected: null, onSlot() {}, onBatch() {} })).match(/class="cal-now"/g).length, 1);
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

test('student home shows today and work still to hand in; Home puts the next step first, then the academy sections', () => {
  const items = [{ id: 'a1', title: 'Yaman', submission: null }, { id: 'a2', title: 'Bhairav', submission: { status: 'draft' } }, { id: 'a3', title: 'Done', submission: { status: 'submitted' } }, { id: 'a4', title: 'Seen', submission: { status: 'reviewed' } }];
  assert.deepEqual(web.openAssignments(items).map((item) => item.id), ['a1', 'a2']);
  const t = getTranslations('en');
  // Students get no member list, so the today panel shows course and teacher only.
  const own = { id: 'b1', name: 'Evening', course_name: 'Vocal', teacher_name: 'Guru', start_time: '18:00', end_time: '19:00', days: ['wed'], status: 'active' };
  const today = renderToStaticMarkup(React.createElement(web.TodayPanel, { t, locale: 'en', batches: [own], today: '2026-11-18', clock: '09:00', onBatch() {} }));
  assert.ok(today.includes('Vocal · Guru</small>'));
  for (const locale of supportedLocales) {
    const lt = getTranslations(locale);
    assert.ok(lt.portal.student.openWork && lt.portal.student.noOpenWork && lt.portal.student.allWork, locale);
    const html = renderToStaticMarkup(React.createElement(web.StudentToday, { t: lt, locale, client: { student: { batches: pending, assignments: { list: pending } }, academy: pending } }));
    assert.ok(html.includes(lt.portal.student.openWork) && html.includes(lt.portal.teacher.classesToday), locale);
  }
  const home = renderToStaticMarkup(React.createElement(web.App, { account: { id: 'u1', roles: ['student'] }, home: () => React.createElement('p', null, 'ACADEMY-PANEL') }));
  assert.ok(home.indexOf('ACADEMY-PANEL') > home.indexOf('class="home-next"'));
  assert.doesNotMatch(home, /hero-panel|is-offline/);
  assert.match(renderToStaticMarkup(React.createElement(web.App, {})), /class="page home-page"|landing-shell/);
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
  const withTimetable = renderToStaticMarkup(React.createElement(web.App, { account: { id: 'u1', roles: ['student'] }, pages: [{ key: 'timetable', Icon: () => null, label: (appT) => appT.portal.student.nav, render: () => null }] }));
  assert.match(withTimetable, new RegExp(`<span>${t.portal.student.nav}</span>`));
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(web.App, { account: { id: 'u1', roles: ['student'] } })), new RegExp(`<span>${t.portal.student.nav}</span>`));
});

test('API client calls the student timetable endpoint', async () => {
  const calls = [];
  const client = createApiClient({ baseUrl: 'http://api.test', token: 't', fetchImpl: async (url) => { calls.push(url); return new Response('[]'); } });
  assert.deepEqual((await client.student.batches()).data, []);
  assert.deepEqual(calls, ['http://api.test/api/student/batches']);
});

test('file types fall back to the extension and limits match the API', () => {
  const file = (name, type, size = 1024) => ({ name, type, size });
  assert.equal(fileType(file('take1.m4a', '')), 'audio/mp4');
  assert.equal(fileType(file('take1.webm', 'audio/webm;codecs=opus')), 'audio/webm');
  assert.equal(fileType(file('class.MOV', '')), 'video/quicktime');
  assert.equal(checkFile(file('page.html', 'text/html')), 'type');
  assert.equal(checkFile(file('class.mp4', 'video/mp4', 300 * 1024 * 1024)), null);
  assert.equal(checkFile(file('class.mp4', 'video/mp4', 300 * 1024 * 1024 + 1)), 'size');
  assert.equal(checkFile(file('notes.pdf', 'application/pdf', 21 * 1024 * 1024)), 'size');
  assert.equal(checkFile(file('take.mp3', 'audio/mpeg', 25 * 1024 * 1024)), null);
  assert.ok(ACCEPT.includes('video/mp4') && ACCEPT.includes('.m4a'));
  assert.equal(formatSize(3 * 1024 * 1024, 'en'), '3 MB');
  assert.equal(formatSize(1536, 'en'), '1.5 kB');
  assert.deepEqual([413, 415, 503, 502, 409, 0].map((status) => fileErrorKey({ status })), ['size', 'type', 'storageOff', 'storage', 'limit', 'upload']);
});

test('uploads go straight to storage with the signed headers, and a failed upload is cleaned up', async () => {
  const calls = [];
  const client = { files: {
    startUpload: async (body) => { calls.push(['start', body]); return { ok: true, data: { attachment: { id: 'f1' }, upload: { method: 'PUT', url: 'https://r2.test/put', headers: { 'Content-Type': 'audio/mp4' } } } }; },
    complete: async (id) => { calls.push(['complete', id]); return { ok: true, data: { id } }; },
    remove: async (id) => { calls.push(['remove', id]); return { ok: true }; },
  } };
  const xhr = (status) => () => ({ upload: {}, headers: {}, open(method, url) { calls.push(['open', method, url]); }, setRequestHeader(name, value) { this.headers[name] = value; },
    send(body) { calls.push(['send', body.name, this.headers]); this.upload.onprogress?.({ lengthComputable: true, loaded: 1, total: 2 }); this.status = status; status ? this.onload() : this.onerror(); } });
  const file = { name: 'take1.m4a', type: '', size: 2048 };
  const progress = [];
  assert.equal((await uploadFile(client, { submission_id: 's1' }, file, (value) => progress.push(value), xhr(200))).ok, true);
  assert.deepEqual(calls, [
    ['start', { submission_id: 's1', name: 'take1.m4a', content_type: 'audio/mp4', size: 2048 }],
    ['open', 'PUT', 'https://r2.test/put'], ['send', 'take1.m4a', { 'Content-Type': 'audio/mp4' }], ['complete', 'f1'],
  ]);
  assert.deepEqual(progress, [0.5]);
  calls.length = 0;
  assert.equal((await uploadFile(client, { submission_id: 's1' }, file, null, xhr(0))).ok, false);
  assert.deepEqual(calls.at(-1), ['remove', 'f1']);
});

test('assignment pages, attachments and the teacher nav render in every locale', () => {
  const client = { teacher: { assignments: { list: pending }, courses: pending, students: pending, batches: { list: pending }, summary: pending }, student: { assignments: { list: pending } }, academy: pending };
  const attachments = [
    { id: 'l1', kind: 'link', name: 'www.youtube.com', url: 'https://www.youtube.com/watch?v=abc', owner_id: 'u1' },
    { id: 'f1', kind: 'file', name: 'Yaman.pdf', content_type: 'application/pdf', size: 2 * 1024 * 1024, owner_id: 'u2' },
  ];
  for (const locale of supportedLocales) {
    const t = getTranslations(locale); const a = t.portal.assignments;
    const render = (Component, props = {}) => renderToStaticMarkup(React.createElement(Component, { t, locale, client, ...props }));
    assert.match(render(web.TeacherAssignments), new RegExp(a.create));
    assert.match(render(web.StudentAssignments), new RegExp(a.studentTitle));
    const list = render(web.AttachmentList, { attachments, userId: 'u1', onChange() {} });
    assert.match(list, /href="https:\/\/www.youtube.com\/watch\?v=abc" target="_blank" rel="noopener noreferrer"/);
    assert.match(list, /Yaman.pdf/);
    assert.equal(list.match(new RegExp(`aria-label="${a.removeFile}`, 'g')).length, 1); // only the uploader's own item
    assert.equal(render(web.AttachmentList, { attachments: [] }), '');
    assert.match(render(web.AttachmentPicker, { parent: { assignment_id: 'a1' }, onChange() {} }), /accept="[^"]*video\/mp4/);
    const fresh = render(web.StudentAssignment, { user: { id: 's1' }, item: { id: 'a1', title: 'Yaman', instructions: '', course_name: 'Vocal', teacher_name: 'Guru', due_on: null, attachments: [], submission: null }, onChange() {} });
    assert.ok(fresh.includes(a.addFile) && fresh.includes(a.add)); // students can attach before saving anything
    const portal = renderToStaticMarkup(React.createElement(web.TeacherPortal, { shell: { t, locale, onLocale() {}, accountBar: null }, client, user: { id: 'u1' } }));
    assert.match(portal, new RegExp(a.nav));
  }
});

test('API client builds assignment and file requests', async () => {
  const calls = [];
  const client = createApiClient({ baseUrl: 'http://api.test', token: 't', fetchImpl: async (url, options) => { calls.push([url.replace('http://api.test', ''), options.method || 'GET', options.body]); return new Response('{}'); } });
  await client.teacher.assignments.create({ title: 'A' });
  await client.teacher.assignments.update('a/1', { title: 'B' });
  await client.teacher.assignments.remove('a1');
  await client.teacher.assignments.submissions('a1');
  await client.teacher.assignments.review('s1', { feedback: 'ok', reviewed: true });
  await client.student.assignments.list();
  await client.student.assignments.saveSubmission('a1', { note: '', status: 'draft' });
  await client.files.startUpload({ submission_id: 's1' });
  await client.files.complete('f1');
  await client.files.addLink({ assignment_id: 'a1', url: 'https://x.test' });
  await client.files.open('f1');
  await client.files.remove('f1');
  assert.deepEqual(calls, [
    ['/api/teacher/assignments', 'POST', '{"title":"A"}'],
    ['/api/teacher/assignments/a%2F1', 'PATCH', '{"title":"B"}'],
    ['/api/teacher/assignments/a1', 'DELETE', undefined],
    ['/api/teacher/assignments/a1/submissions', 'GET', undefined],
    ['/api/teacher/submissions/s1', 'PATCH', '{"feedback":"ok","reviewed":true}'],
    ['/api/student/assignments', 'GET', undefined],
    ['/api/student/assignments/a1/submission', 'PUT', '{"note":"","status":"draft"}'],
    ['/api/files/uploads', 'POST', '{"submission_id":"s1"}'],
    ['/api/files/f1/complete', 'POST', undefined],
    ['/api/files/links', 'POST', '{"assignment_id":"a1","url":"https://x.test"}'],
    ['/api/files/f1', 'GET', undefined],
    ['/api/files/f1', 'DELETE', undefined],
  ]);
});

test('answer history shows only the stored states and dates of a submission', () => {
  const t = getTranslations('en'); const a = t.portal.assignments;
  const trail = (submission) => renderToStaticMarkup(React.createElement(web.AnswerTrail, { t, locale: 'en', submission }));
  assert.equal(trail(null), '');
  assert.equal(trail({ status: 'draft', submitted_at: null, reviewed_at: null }), '');
  const sent = trail({ status: 'submitted', submitted_at: '2026-11-10T09:00:00Z', reviewed_at: null });
  assert.match(sent, new RegExp(`${a.status.submitted}</span><small>Nov 10</small>`));
  assert.match(sent, new RegExp(`aria-current="step"><span>${a.trail.awaiting}</span></li></ol>`));
  const reviewed = trail({ status: 'reviewed', submitted_at: '2026-11-10T09:00:00Z', reviewed_at: '2026-11-12T09:00:00Z' });
  assert.match(reviewed, new RegExp(`${a.status.reviewed}</span><small>Nov 12</small>`));
  assert.match(reviewed, new RegExp(`class="is-next"><span>${a.trail.tryAgain}</span></li>`));
  const again = trail({ status: 'submitted', submitted_at: '2026-11-14T09:00:00Z', reviewed_at: '2026-11-12T09:00:00Z' });
  assert.match(again, new RegExp(`${a.trail.sentAgain}</span><small>Nov 14</small>`));
  assert.ok(!again.includes(a.trail.tryAgain));
});

test('sign-in offers a labelled password toggle and the landing page carries no ornament or fake audio', () => {
  for (const locale of supportedLocales) {
    const t = getTranslations(locale);
    const login = renderToStaticMarkup(React.createElement(web.LoginPage, { t, locale, onLocale() {}, onSubmit() {}, onGuest() {} }));
    assert.match(login, new RegExp(`aria-label="${t.portal.showPassword}" aria-pressed="false"`));
    assert.match(login, /id="login-password" type="password"/);
    const landing = renderToStaticMarkup(React.createElement(web.LandingPage, { t, locale, onLocaleChange() {}, onStart() {}, onExplore() {}, onNavigate() {} }));
    assert.match(landing, new RegExp(t.landing.heroTitle));
    for (const pattern of ['orbit', 'sound-wave', 'eyebrow', 'preview-pitch-line', 'empty-progress-visual', 'feature-card']) assert.ok(!landing.includes(pattern), pattern);
  }
});

test('accounts filter by role and status and sort by any column', () => {
  const p = getTranslations('en').portal;
  const accounts = [
    { id: '1', display_name: 'Meera', username: 'meera', roles: ['teacher'], active: true },
    { id: '2', display_name: 'aarav', username: 'aarav', roles: ['student'], active: false },
    { id: '3', display_name: 'Kabir', username: 'kabir', roles: ['student'], active: true },
  ];
  const names = (options) => web.accountRows(accounts, options, p).map((a) => a.display_name);
  assert.deepEqual(names({}), ['aarav', 'Kabir', 'Meera']);
  assert.deepEqual(names({ sort: { key: 'name', dir: -1 } }), ['Meera', 'Kabir', 'aarav']);
  assert.deepEqual(names({ role: 'student' }), ['aarav', 'Kabir']);
  assert.deepEqual(names({ status: 'inactive' }), ['aarav']);
  assert.deepEqual(names({ role: 'student', status: 'active' }), ['Kabir']);
  assert.deepEqual(names({ sort: { key: 'status', dir: 1 } }), ['Kabir', 'Meera', 'aarav']);
  assert.deepEqual(names({ query: 'teach' }), ['Meera']);
});

test('loading shows placeholder rows with screen-reader text, and page changes apply without the transition API', () => {
  const t = getTranslations('en');
  const html = renderToStaticMarkup(React.createElement(web.LoadState, { t, state: { data: null } }));
  assert.match(html, new RegExp(`^<div class="skeleton" role="status"><span class="sr-only">${t.portal.users.loading}</span>`));
  assert.equal((html.match(/class="skeleton-row" aria-hidden="true"/g) || []).length, 3);
  let changed = false;
  web.withTransition(() => { changed = true; });
  assert.ok(changed);
});
