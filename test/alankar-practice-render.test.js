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
let AlankarPracticeDisplay, TALAS, talaMatras;
before(async () => {
  server = await createServer({
    root: fileURLToPath(new URL('../apps/web', import.meta.url)),
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    appType: 'custom',
  });
  ({ AlankarPracticeDisplay, TALAS, talaMatras } = await server.ssrLoadModule('/src/AlankarPracticeDisplay.jsx'));
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

test('the held-Sa trace draws only real readings and shows the beat ruler on the current beat', async () => {
  const { PitchTrace } = await server.ssrLoadModule('/src/PracticeStudio.jsx');
  const t = getTranslations('en');
  const target = { swara: 'Sa', octave: 0 };
  const reading = { timestamp: 1000, targetNote: 'Sa', octave: 0, frequencyHz: 262, centsError: 20, confidence: .9, voiced: true, clipped: false, valid: true };
  const idle = renderToStaticMarkup(React.createElement(PitchTrace, { t, state: { phase: 'idle', elapsedMs: 0 }, target }));
  assert.ok(!idle.includes('trace-line') && !idle.includes('trace-now') && idle.includes('class="pitch-trace"'));
  const live = renderToStaticMarkup(React.createElement(PitchTrace, { t, state: { phase: 'running', startedAt: 1, elapsedMs: 1100, observation: reading }, target }));
  assert.match(live, /class="pitch-trace is-live"/);
  assert.match(live, /class="trace-now" style="top:41\.33/); // 20 cents sharp sits above the Sa line
  const silent = renderToStaticMarkup(React.createElement(PitchTrace, { t, state: { phase: 'running', startedAt: 1, elapsedMs: 1100, observation: { ...reading, voiced: false } }, target }));
  assert.ok(!silent.includes('trace-now') && !silent.includes('trace-line'));
  const groups = [['Sa', 'Re', 'Ga']];
  const timeline = createAlankarTimeline({ groups, bpm: 60, loops: 1 });
  const beat = getAlankarBeatAt(timeline.countInBeats * timeline.beatDurationMs + timeline.beatDurationMs * 2, timeline);
  const html = renderToStaticMarkup(React.createElement(AlankarPracticeDisplay, { beat, timeline, groups, progress: 50, phase: 'running', t, groupKey: 'g' }));
  assert.match(html, /<ol class="beat-ruler" aria-hidden="true"><li>1<\/li><li>2<\/li><li class="is-on">3<\/li><li>4<\/li><\/ol>/);
});

test('the opt-in tala ruler counts practice beats around the chosen cycle with that tala\'s claps and waves', () => {
  const t = getTranslations('en');
  const lengths = { keherwa: 8, dadra: 6, rupak: 7, jhaptaal: 10, ektaal: 12, teentaal: 16 };
  for (const [id, tala] of Object.entries(TALAS)) {
    assert.equal(tala.vibhag.reduce((sum, n) => sum + n, 0), lengths[id], id);
    assert.equal(tala.marks.length, tala.vibhag.length, id);
    assert.ok(t.studioUi.talas[id], id);
  }
  assert.deepEqual(talaMatras('jhaptaal').filter((m) => m.mark).map((m) => [m.n, m.mark]), [[1, 'X'], [3, '2'], [6, '0'], [8, '3']]);
  assert.equal(talaMatras(''), null);
  const groups = [['Sa', 'Re', 'Ga']];
  const timeline = createAlankarTimeline({ groups, bpm: 60, loops: 6 });
  // Practice beat 18 (0-based) in Teentaal is matra 3 of the second cycle.
  const beat = getAlankarBeatAt((timeline.countInBeats + 18) * timeline.beatDurationMs, timeline);
  const html = renderToStaticMarkup(React.createElement(AlankarPracticeDisplay, { beat, timeline, groups, progress: 50, phase: 'running', t, groupKey: 'g', tala: 'teentaal' }));
  assert.match(html, /<ol class="beat-ruler is-tala" style="--matras:16" aria-hidden="true"><li class="is-sam"><span class="tala-mark">X<\/span>1<\/li><li>2<\/li><li class="is-on">3<\/li>/);
  assert.match(html, /<li class="is-vibhag"><span class="tala-mark is-khali">0<\/span>9<\/li>/);
  assert.match(html, /Matra 3 \/ 16/);
  const countIn = getAlankarBeatAt(0, timeline);
  const lead = renderToStaticMarkup(React.createElement(AlankarPracticeDisplay, { beat: countIn, timeline, groups, progress: 0, phase: 'count-in', t, groupKey: 'g', tala: 'teentaal' }));
  assert.ok(!lead.includes('is-on') && !lead.includes('Matra'));
});
