import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { getTranslations } from '../packages/localization/src/index.js';
import { ALANKARS, alankarDisplayGroups } from '../packages/exercises/src/index.js';

let server;
let AlankarList;
let listPatterns;
before(async () => {
  server = await createServer({
    root: fileURLToPath(new URL('../apps/web', import.meta.url)),
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    appType: 'custom',
  });
  ({ AlankarList } = await server.ssrLoadModule('/src/AlankarList.jsx'));
  ({ ALANKARS: listPatterns } = await server.ssrLoadModule('@swarsadhak/exercises'));
});
after(async () => { await server?.close(); });

const expectedNames = {
  en: ['Alankar 1', 'Alankar 2', 'Alankar 3', 'Alankar 4'],
  mr: ['अलंकार १', 'अलंकार २', 'अलंकार ३', 'अलंकार ४'],
  hi: ['अलंकार १', 'अलंकार २', 'अलंकार ३', 'अलंकार ४'],
};

const canonicalGroups = [
  [['Sa'], ['Re'], ['Ga'], ['Ma'], ['Pa'], ['Dha'], ['Ni'], ['Sa']],
  [['Sa', 'Sa'], ['Re', 'Re'], ['Ga', 'Ga'], ['Ma', 'Ma'], ['Pa', 'Pa'], ['Dha', 'Dha'], ['Ni', 'Ni'], ['Sa', 'Sa']],
  [['Sa', 'Re'], ['Re', 'Ga'], ['Ga', 'Ma'], ['Ma', 'Pa'], ['Pa', 'Dha'], ['Dha', 'Ni'], ['Ni', 'Sa']],
  [['Sa', 'Re', 'Ga'], ['Re', 'Ga', 'Ma'], ['Ga', 'Ma', 'Pa'], ['Ma', 'Pa', 'Dha'], ['Pa', 'Dha', 'Ni'], ['Dha', 'Ni', 'Sa']],
];
const devanagari = { Sa: 'सा', Re: 'रे', Ga: 'ग', Ma: 'म', Pa: 'प', Dha: 'ध', Ni: 'नि' };
const expectedDisplayPreviews = (locale, swaras, fallbackToLocale = true) => ALANKARS.flatMap((pattern) => {
  return ['aaroha', 'avaroha'].flatMap((direction) => {
    return alankarDisplayGroups(pattern, direction).map((group) => {
      return `[${group.map(({ swara, octave }) => {
        const base = swaras === undefined ? (fallbackToLocale && locale !== 'en' ? devanagari[swara] : swara) : (swaras?.[swara] ?? swara);
        return base;
      }).join(', ')}]`;
    });
  });
});
const visibleText = (html) => html.replace(/<[^>]*>/g, '');

for (const [locale, names] of Object.entries(expectedNames)) {
  test(`AlankarList renders exactly four translated pattern names in ${locale}`, () => {
    const t = getTranslations(locale);
    const html = renderToStaticMarkup(React.createElement(AlankarList, {
      t, onChoose() {}, onBack() {},
    }));
    assert.equal([...html.matchAll(/class="alankar-card"/g)].length, 4);
    assert.deepEqual([...html.matchAll(/<strong>(.*?)<\/strong>/g)].map((match) => match[1]), names);
    const visible = visibleText(html);
    const expectedPreviews = expectedDisplayPreviews(locale);
    expectedPreviews.forEach((preview) => assert.ok(visible.includes(preview)));
    if (locale !== 'en') assert.doesNotMatch(visible, /\b(?:Sa|Re|Ga|Ma|Pa|Dha|Ni)\b/);
    assert.ok(html.endsWith(`<button class="button">${t.back}</button></div>`));
  });
}

test('AlankarList falls back to canonical swaras for absent maps and missing labels', () => {
  for (const swaras of [undefined, null, {}, { Sa: 'सा', Re: null }]) {
    const t = { ...getTranslations('mr'), swaras };
    const html = renderToStaticMarkup(React.createElement(AlankarList, { t, onChoose() {}, onBack() {} }));
    const expectedPreviews = expectedDisplayPreviews('mr', swaras, false);
    const visible = visibleText(html);
    expectedPreviews.forEach((preview) => assert.ok(visible.includes(preview)));
  }
});

test('localized list rendering and selection preserve canonical pattern data', () => {
  const before = structuredClone(listPatterns);
  for (const locale of ['en', 'mr', 'hi']) {
    const chosen = [];
    const props = { t: getTranslations(locale), onChoose(pattern) { chosen.push(pattern); }, onBack() {} };
    renderToStaticMarkup(React.createElement(AlankarList, props));
    const section = React.Children.toArray(AlankarList(props).props.children).find((child) => child.type === 'section');
    const cards = React.Children.toArray(section.props.children);
    for (const card of cards) card.props.onClick();
    assert.equal(chosen.length, 4);
    chosen.forEach((pattern, index) => assert.equal(pattern, listPatterns[index]));
  }
  assert.deepEqual(ALANKARS.map(({ aroha }) => aroha), canonicalGroups);
  assert.deepEqual(listPatterns, before);
  assert.deepEqual(listPatterns, ALANKARS);
});

test('AlankarList back control uses only the supplied callback and generic back label', () => {
  const t = { ...getTranslations('en') };
  Object.defineProperty(t, 'backToAlankars', {
    get() { throw new Error('List must not read the results back label'); },
  });
  let backCalls = 0;
  const onBack = () => { backCalls += 1; };
  const props = { t, onChoose() {}, onBack };
  for (const key of ['session', 'completion', 'alankarId']) {
    Object.defineProperty(props, key, {
      get() { throw new Error(`List must not read results state: ${key}`); },
    });
  }
  // Real React rendering must succeed without any results/session state.
  assert.ok(renderToStaticMarkup(React.createElement(AlankarList, props)).endsWith(`<button class="button">${t.back}</button></div>`));
  // Inspect the stateless component's element to exercise its wired callback without a DOM dependency.
  const back = React.Children.toArray(AlankarList(props).props.children).at(-1);
  assert.equal(back.type, 'button');
  assert.equal(back.props.children, t.back);
  assert.equal(back.props.onClick, onBack);
  back.props.onClick();
  assert.equal(backCalls, 1);
});
