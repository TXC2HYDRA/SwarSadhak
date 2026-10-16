import test from 'node:test';
import assert from 'node:assert/strict';
import { requiredTranslationKeys, supportedLocales, translations } from '../packages/localization/src/index.js';
import { EXERCISES } from '../packages/exercises/src/index.js';

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
