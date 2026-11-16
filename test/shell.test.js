import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { Home, Users } from 'lucide-react';
import { getTranslations, supportedLocales } from '@swarsadhak/localization';
import { pageFromPath, pagePath, roleFromPath, showPath } from '../apps/web/src/router.js';

let server, AppShell;
before(async () => {
  server = await createServer({ root: fileURLToPath(new URL('../apps/web', import.meta.url)), server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: 'custom', logLevel: 'silent' });
  ({ AppShell } = await server.ssrLoadModule('/src/AppShell.jsx'));
});
after(async () => { await server?.close(); });

test('page keys map to URLs and back; foreign or unknown paths fall back to home', () => {
  const keys = ['overview', 'users', 'courses'];
  assert.equal(pagePath('owner', 'overview', 'overview'), '/owner');
  assert.equal(pagePath('owner', 'users', 'overview'), '/owner/users');
  assert.equal(pageFromPath('/owner/users', 'owner', keys, 'overview'), 'users');
  assert.equal(pageFromPath('/owner', 'owner', keys, 'overview'), 'overview');
  assert.equal(pageFromPath('/owner/nope', 'owner', keys, 'overview'), 'overview');
  assert.equal(pageFromPath('/teacher/users', 'owner', keys, 'overview'), 'overview'); // another role's URL
  assert.equal(pageFromPath(undefined, 'owner', keys, 'overview'), 'overview');
  assert.equal(roleFromPath('/teacher/assignments'), 'teacher');
  assert.equal(roleFromPath('/studio/library'), null);
  assert.equal(roleFromPath('/'), null);
});

test('showPath pushes new paths, replaces when asked, and skips the current one', () => {
  const calls = [];
  const saved = [globalThis.history, globalThis.location];
  globalThis.history = { pushState: (_, __, path) => calls.push(['push', path]), replaceState: (_, __, path) => calls.push(['replace', path]) };
  globalThis.location = { pathname: '/owner' };
  try {
    showPath('/owner');
    showPath('/owner/users');
    showPath('/owner/courses', { replace: true });
    assert.deepEqual(calls, [['push', '/owner/users'], ['replace', '/owner/courses']]);
  } finally { [globalThis.history, globalThis.location] = saved; }
});

test('shell renders sidebar, skip link, account and a phone bottom nav of four pages plus More', () => {
  for (const locale of supportedLocales) {
    const t = getTranslations(locale);
    const items = ['a', 'b', 'c', 'd', 'e'].map((key, index) => ({ key, label: `Page ${key}`, Icon: index ? Users : Home }));
    const html = renderToStaticMarkup(React.createElement(AppShell, { t, items, active: 'b', onNavigate() {}, title: 'Page b', tools: null, account: React.createElement('span', null, 'ACCOUNT') }, React.createElement('h1', null, 'Body')));
    assert.match(html, new RegExp(`class="skip-link" href="#main-content">${t.portal.skipToContent}`), locale);
    assert.match(html, /<main id="main-content"/);
    assert.equal((html.match(/class="nav-item/g) || []).length, 5);
    assert.equal((html.match(/class="bottom-nav-item/g) || []).length, 5); // a-d + More
    assert.ok(html.includes(`<span>${t.portal.more}</span>`), locale);
    assert.equal((html.match(/aria-current="page"/g) || []).length, 2); // sidebar + bottom nav
    assert.match(html, /class="sidebar-account"><span>ACCOUNT<\/span>/);
    assert.ok(!html.slice(html.indexOf('class="bottom-nav"')).includes('Page e'), 'fifth page lives in More');
  }
});
