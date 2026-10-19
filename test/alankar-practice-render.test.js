import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { getTranslations } from '../packages/localization/src/index.js';
import { ALANKARS, alankarDisplayGroups, alankarGroups } from '../packages/exercises/src/index.js';
import { createAlankarTimeline, getAlankarBeatAt } from '../packages/practice-domain/src/index.js';

let server;
let AlankarPracticeDisplay;
before(async () => {
  server = await createServer({
    root: fileURLToPath(new URL('../apps/web', import.meta.url)),
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    appType: 'custom',
  });
  ({ AlankarPracticeDisplay } = await server.ssrLoadModule('/src/AlankarPracticeDisplay.jsx'));
});
after(async () => { await server?.close(); });

const devanagari = { Sa: 'सा', Re: 'रे', Ga: 'ग', Ma: 'म', Pa: 'प', Dha: 'ध', Ni: 'नि' };
const canonicalSwaras = Object.keys(devanagari);
const freezeDeep = (value) => {
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') freezeDeep(child);
  }
  return Object.freeze(value);
};
const render = (props) => renderToStaticMarkup(React.createElement(AlankarPracticeDisplay, props));
const visibleText = (html) => html.replace(/<[^>]*>/g, '');

for (const locale of ['en', 'mr', 'hi']) {
  for (const direction of ['full', 'avaroha']) {
    test(`active practice renders canonical-driven swara, groups and highlight in ${locale}, ${direction}`, () => {
      const t = getTranslations(locale);
      const label = (swara) => locale === 'en' ? swara : devanagari[swara];
      for (const pattern of ALANKARS) {
        const groups = freezeDeep(alankarGroups(pattern, direction));
        const timeline = freezeDeep(createAlankarTimeline({ groups, bpm: 90, loops: 2 }));
        const beforeRender = structuredClone({ groups, timeline });
        const expectedChips = groups.map((group) => group.map(label).join(' · '));
        // Check every beat, including sustained swaras, descending groups and the second loop.
        for (let practiceIndex = 0; practiceIndex < timeline.practiceBeats; practiceIndex += 1) {
          const beat = freezeDeep(getAlankarBeatAt((timeline.countInBeats + practiceIndex) * timeline.beatDurationMs + 1, timeline));
          const beatBeforeRender = structuredClone(beat);
          assert.ok(canonicalSwaras.includes(beat.swara));
          const html = render({ t, beat, groups, timeline, progress: 37, phase: 'running', groupKey: `${pattern.id}-${direction}` });
           assert.ok(visibleText(html).includes(label(beat.swara)));
           assert.equal((html.match(/class="active"/g) || []).length, 1);
           expectedChips.forEach((text) => assert.ok(visibleText(html).includes(text)));
          assert.ok(html.includes(`<small>${t.progress}</small><strong>37%</strong>`));
          assert.ok(html.includes(`${t.activeGroup}: ${beat.groupIndex + 1} · ${beat.groupBeatIndex + 1}/${beat.groupLength} · ${t.loops}: ${beat.loopIndex + 1}/2`));
          assert.deepEqual(beat, beatBeforeRender);
        }
        assert.deepEqual({ groups, timeline }, beforeRender);
        assert.deepEqual(timeline.groups, groups);
        assert.ok(groups.flat().every((swara) => canonicalSwaras.includes(swara)));
      }
    });
  }
}

test('live display falls back to canonical IDs for missing swara translations', () => {
  const groups = freezeDeep([['Sa', 'Re', 'Unknown']]);
  const timeline = freezeDeep(createAlankarTimeline({ groups }));
  for (const practiceIndex of [1, 2]) {
    const beat = freezeDeep(getAlankarBeatAt((timeline.countInBeats + practiceIndex) * timeline.beatDurationMs, timeline));
    const expectedSwara = practiceIndex === 1 ? 'Re' : 'Unknown';
    for (const swaras of [undefined, { Sa: 'सा' }]) {
      const t = { ...getTranslations('mr'), swaras };
      const html = render({ t, beat, groups, timeline, progress: 12, phase: 'running' });
       assert.ok(visibleText(html).includes(expectedSwara));
       assert.equal((html.match(/class="active"/g) || []).length, 1);
      assert.equal(beat.swara, expectedSwara);
    }
  }
  assert.deepEqual(groups, [['Sa', 'Re', 'Unknown']]);
});

test('idle and count-in retain placeholder and unhighlighted groups', () => {
  const t = getTranslations('hi');
  const groups = alankarGroups(ALANKARS[2], 'avaroha');
  const timeline = createAlankarTimeline({ groups });
  for (const phase of ['idle', 'count-in']) {
    const beat = phase === 'idle' ? { phase: 'idle' } : getAlankarBeatAt(timeline.beatDurationMs, timeline);
    const html = render({ t, beat, groups, timeline, progress: 0, phase });
    assert.ok(html.includes(`<small>${t.currentSwara}</small><strong>—</strong>`));
     groups.flat().forEach((swara) => assert.ok(visibleText(html).includes(devanagari[swara])));
    assert.ok(!html.includes(`${t.activeGroup}:`));
    if (phase === 'count-in') assert.ok(html.includes(`${t.countInBeat} 2 / 4`));
  }
});

test('Marathi display keeps swaras plain at octave boundaries', () => {
  const t = getTranslations('mr');
  const pattern = ALANKARS[0];
  for (const direction of ['aaroha', 'avaroha']) {
    const groups = alankarGroups(pattern, direction);
    const octaveGroups = alankarDisplayGroups(pattern, direction);
    const timeline = createAlankarTimeline({ groups });
    const firstSa = getAlankarBeatAt((timeline.countInBeats + 0) * timeline.beatDurationMs + 1, timeline);
    const lastSa = getAlankarBeatAt((timeline.countInBeats + timeline.practiceBeats - 1) * timeline.beatDurationMs + 1, timeline);
    const firstHtml = render({ t, beat: firstSa, groups, octaveGroups, timeline, progress: 0, phase: 'running' });
    const lastHtml = render({ t, beat: lastSa, groups, octaveGroups, timeline, progress: 0, phase: 'running' });
    assert.ok(!firstHtml.includes('swara-mark-'));
    assert.ok(!lastHtml.includes('swara-mark-'));
  }
});
