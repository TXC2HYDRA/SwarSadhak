import test from 'node:test';
import assert from 'node:assert/strict';
import { TONIC_NOTES, TONICS } from '../apps/web/src/tonics.js';
import { getTranslations } from '../packages/localization/src/index.js';

test('tonic dropdown includes every requested chromatic note', () => {
  assert.deepEqual(TONIC_NOTES.map((note) => note.replace(/\d$/, '')), ['A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#']);
  assert.equal(TONICS.length, 12);
  assert.ok(TONICS.every((tonic) => Number.isFinite(tonic.value) && tonic.labelKey.startsWith('tonics.')));
});

test('tonic dropdown maps chromatic notes to Kali and Pandhari names', () => {
  assert.deepEqual(TONICS.map(({ key }) => key), ['pandhari6', 'kali5', 'pandhari7', 'pandhari1', 'kali1', 'pandhari2', 'kali2', 'pandhari3', 'pandhari4', 'kali3', 'pandhari5', 'kali4']);
  assert.equal(getTranslations('mr').tonics.kali1, 'काळी १');
  assert.equal(getTranslations('mr').tonics.pandhari1, 'पांढरी १');
  assert.equal(getTranslations('hi').tonics.kali4, 'काली ४');
  assert.equal(getTranslations('en').tonics.pandhari7, 'Pandhari 7 (White 7)');
});
