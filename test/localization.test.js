import test from 'node:test';
import assert from 'node:assert/strict';
import { getTranslations, requiredTranslationKeys, supportedLocales, translations } from '../packages/localization/src/index.js';
import { ALANKARS, EXERCISES, SWARAS } from '../packages/exercises/src/index.js';
import { NOTE_TARGETS, frequencyToNote, targetFrequency } from '../packages/musical-core/src/index.js';

const leafKeys = (value, prefix = '') => Object.entries(value).flatMap(([key, child]) => {
  const path = prefix ? `${prefix}.${key}` : key;
  return child && typeof child === 'object' && !Array.isArray(child) ? leafKeys(child, path) : [path];
});

test('the foundation declares all required locales and translation keys', () => {
  assert.deepEqual(supportedLocales, ['en', 'mr', 'hi']);
  assert.ok(requiredTranslationKeys.includes('greeting'));
  assert.ok(requiredTranslationKeys.includes('warmupDesc'));
  assert.ok(requiredTranslationKeys.length >= 25);
});

test('Phase 2 landing, dashboard, and discovery copy is translated in every locale', () => {
  const keys = [
    'landing.heroTitle', 'landing.start', 'landing.features.pitch', 'landing.steps.chooseTitle',
    'landing.privacyItems.rawAudio', 'landing.footerSettings', 'dashboard.newTitle',
    'dashboard.recommendedReason', 'dashboard.smallSample', 'exerciseUi.searchPlaceholder',
    'exerciseUi.goalSequence', 'exerciseUi.noResults', 'accessibility.previewLabel'
  ];
  for (const locale of supportedLocales) {
    const t = getTranslations(locale);
    for (const key of keys) assert.equal(typeof key.split('.').reduce((value, part) => value?.[part], t), 'string', `${locale}.${key}`);
  }
  assert.ok(requiredTranslationKeys.includes('landing.heroTitle'));
  assert.ok(requiredTranslationKeys.includes('dashboard.newTitle'));
  assert.ok(requiredTranslationKeys.includes('exerciseUi.searchPlaceholder'));
});

test('all locale trees have deep key parity for exercise metadata', () => {
  for (const locale of supportedLocales) {
    for (const exercise of EXERCISES) {
      for (const field of ['nameKey', 'descriptionKey', 'instructionKey']) {
        const key = exercise[field].split('.');
        let value = translations[locale];
        for (const part of key) value = value?.[part];
        assert.equal(typeof value, 'string', `${locale}.${exercise[field]}`);
      }
    }
  }
});

test('Marathi and Hindi exercise translations use Devanagari text', () => {
  assert.match(translations.mr.exercises.saSustain.name, /[\u0900-\u097F]/);
  assert.match(translations.hi.exercises.saSustain.name, /[\u0900-\u097F]/);
});

test('all locale resources have identical leaf keys', () => {
  const expected = leafKeys(translations.en).sort();
  for (const locale of supportedLocales) assert.deepEqual(leafKeys(translations[locale]).sort(), expected, `${locale} parity`);
});

test('Alankar pattern names resolve in every locale', () => {
  for (const locale of supportedLocales) {
    for (const pattern of ALANKARS) {
      const value = pattern.nameKey.split('.').reduce((current, part) => current?.[part], translations[locale]);
      assert.equal(typeof value, 'string', `${locale}.${pattern.nameKey}`);
    }
  }
});

test('Alankar UI labels are translated and included in the parity contract', () => {
  const keys = ['alankarListTitle', 'alankarPracticeTitle', 'direction', 'full', 'aaroha', 'avaroha', 'bpm', 'timeSignature', 'timeSignature44', 'timeSignatureValue', 'countIn', 'loops', 'groups', 'activeGroup', 'currentSwara', 'sustain', 'progress', 'start', 'startAlankar', 'stop', 'back', 'backToAlankars', 'results'];
  for (const locale of supportedLocales) {
    const t = getTranslations(locale);
    for (const key of keys) assert.equal(typeof t[key], 'string', `${locale}.${key}`);
  }
  assert.equal(translations.en.timeSignatureValue, '4/4');
  assert.equal(translations.mr.timeSignatureValue, '४/४');
  assert.equal(translations.hi.timeSignatureValue, '४/४');
  assert.ok(requiredTranslationKeys.includes('alankarListTitle'));
  assert.ok(requiredTranslationKeys.includes('timeSignatureValue'));
});

test('swara display labels preserve canonical keys in every locale', () => {
  const roman = { Sa: 'Sa', Re: 'Re', Ga: 'Ga', Ma: 'Ma', Pa: 'Pa', Dha: 'Dha', Ni: 'Ni' };
  const devanagari = { Sa: 'सा', Re: 'रे', Ga: 'ग', Ma: 'म', Pa: 'प', Dha: 'ध', Ni: 'नि' };
  for (const locale of supportedLocales) {
    const expected = locale === 'en' ? roman : devanagari;
    assert.deepEqual(translations[locale].swaras, expected);
    assert.deepEqual(getTranslations(locale).swaras, expected);
    for (const swara of Object.keys(roman)) assert.ok(requiredTranslationKeys.includes(`swaras.${swara}`));
  }
  assert.deepEqual(getTranslations('unknown').swaras, roman);
});

test('Alankar practice breadcrumbs and Marathi bar instructions use localized terminology', () => {
  assert.equal(getTranslations('en').alankarPracticeTitle, 'Alankar practice');
  assert.equal(getTranslations('mr').alankarPracticeTitle, 'अलंकार सराव');
  assert.equal(getTranslations('hi').alankarPracticeTitle, 'अलंकार अभ्यास');
  assert.ok(requiredTranslationKeys.includes('alankarPracticeTitle'));
  assert.match(getTranslations('mr').alankar.instruction, /चार मात्रांचा एक बार/);
  assert.doesNotMatch(getTranslations('mr').alankar.instruction, /एक मात्रा/);
});

test('localizing labels leaves canonical exercises and pitch targets unchanged', () => {
  const canonical = ['Sa', 'Re', 'Ga', 'Ma', 'Pa', 'Dha', 'Ni'];
  const degrees = [0, 2, 4, 5, 7, 9, 11];
  const before = structuredClone({ ALANKARS, EXERCISES, SWARAS, NOTE_TARGETS });
  for (const locale of supportedLocales) {
    const t = getTranslations(locale);
    for (const pattern of ALANKARS) {
      for (const group of [...pattern.aroha, ...pattern.avaroha]) {
        assert.ok(group.every((swara) => canonical.includes(swara)));
        assert.ok(group.map((swara) => t.swaras[swara]).every(Boolean));
      }
    }
    assert.deepEqual(SWARAS, [...canonical, 'Sa']);
    assert.deepEqual(NOTE_TARGETS.map(({ swara }) => swara), canonical);
    assert.deepEqual(NOTE_TARGETS.map(({ degree }) => degree), degrees);
    for (const [index, swara] of canonical.entries()) {
      const frequency = 261.63 * 2 ** (degrees[index] / 12);
      assert.equal(targetFrequency(swara, 261.63), frequency);
      assert.equal(frequencyToNote(frequency, 261.63).swara, swara);
    }
  }
  assert.deepEqual({ ALANKARS, EXERCISES, SWARAS, NOTE_TARGETS }, before);
});
