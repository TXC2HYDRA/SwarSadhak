import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { getTranslations, supportedLocales } from '@swarsadhak/localization';

const web = (path) => readFileSync(new URL(`../apps/web/${path}`, import.meta.url), 'utf8');
let server, theme, shell;
before(async () => {
  server = await createServer({ root: fileURLToPath(new URL('../apps/web', import.meta.url)), server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: 'custom', logLevel: 'silent' });
  theme = await server.ssrLoadModule('/src/theme.jsx');
  shell = await server.ssrLoadModule('/src/PortalShell.jsx');
});
after(async () => { await server?.close(); });

test('theme toggle offers the other theme, labelled in every locale', () => {
  for (const locale of supportedLocales) {
    const t = getTranslations(locale);
    assert.ok(t.portal.theme.light && t.portal.theme.dark, locale);
    const html = renderToStaticMarkup(React.createElement(theme.ThemeToggle, { t }));
    assert.match(html, new RegExp(`aria-label="${t.portal.theme.dark}"`), locale); // no stored choice, no system dark: light now, offer dark
  }
  const t = getTranslations('en');
  const html = renderToStaticMarkup(React.createElement(shell.PortalShell, { t, locale: 'en', onLocale() {}, nav: [], accountBar: null }, 'x'));
  assert.match(html, /theme-toggle/);
});

test('stored theme only accepts light or dark', () => {
  const original = globalThis.localStorage;
  try {
    for (const [value, expected] of [['dark', 'dark'], ['light', 'light'], ['blue', null], [null, null]]) {
      globalThis.localStorage = { getItem: () => value };
      assert.equal(theme.storedTheme(), expected);
    }
    globalThis.localStorage = { getItem() { throw new Error('blocked'); } };
    assert.equal(theme.storedTheme(), null);
  } finally { globalThis.localStorage = original; }
});

test('index.html picks the theme before the app script runs', () => {
  const html = web('index.html');
  const boot = html.indexOf("localStorage.getItem('nadopasana-theme')");
  assert.ok(boot > 0 && boot < html.indexOf('src="/src/index.jsx"'));
  assert.equal(theme.THEME_KEY, 'nadopasana-theme');
});

test('colours come from tokens, and dark overrides every light colour token', () => {
  const css = web('src/styles.css');
  const [light, dark] = [css.match(/^:root \{([\s\S]*?)^\}/m)[1], css.match(/^:root\[data-theme="dark"\] \{([\s\S]*?)^\}/m)[1]];
  const colourTokens = (block) => new Set([...block.matchAll(/(--[\w-]+):\s*(#|rgb)/g)].map((m) => m[1]));
  assert.deepEqual([...colourTokens(light)].filter((name) => !colourTokens(dark).has(name)), []);
  const rules = css.slice(css.indexOf('}', css.indexOf(':root[data-theme="dark"]')) + 1);
  for (const [name, text] of [['styles.css', rules], ['portal.css', web('src/portal.css')], ['SaSustainFeedback.css', web('src/SaSustainFeedback.css')], ['practiceStudio.css', web('src/practiceStudio.css')]]) {
    assert.deepEqual(text.match(/#[0-9a-f]{3,8}\b|rgba?\(/gi) || [], [], name);
  }
});
