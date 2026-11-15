import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { createApiClient, toApiSession } from '@swarsadhak/api-client';
import { getTranslations, supportedLocales } from '@swarsadhak/localization';
import { apiErrorKey, choosePortal, clearSession, loginErrorKey, readSession, writeSession } from '../apps/web/src/auth.js';

const memoryStorage = () => { const values = new Map(); return { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)), removeItem: (k) => values.delete(k) }; };

let server, web;
before(async () => {
  server = await createServer({ root: fileURLToPath(new URL('../apps/web', import.meta.url)), server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: 'custom', logLevel: 'silent' });
  web = {
    ...(await server.ssrLoadModule('/src/AccountRoot.jsx')),
    ...(await server.ssrLoadModule('/src/OwnerPortal.jsx')),
    ...(await server.ssrLoadModule('/src/optionalSync.js')),
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
