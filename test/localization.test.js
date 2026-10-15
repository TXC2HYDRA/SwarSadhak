import test from 'node:test';
import assert from 'node:assert/strict';
import { requiredTranslationKeys, supportedLocales } from '../packages/localization/src/index.js';

test('the foundation declares all required locales and translation keys', () => {
  assert.deepEqual(supportedLocales, ['en', 'mr', 'hi']);
  assert.ok(requiredTranslationKeys.includes('greeting'));
  assert.ok(requiredTranslationKeys.includes('warmupDesc'));
  assert.ok(requiredTranslationKeys.length >= 25);
});
