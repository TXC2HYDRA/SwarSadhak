import test from 'node:test';
import assert from 'node:assert/strict';
import { createTanpuraPlayer, TANPURA_RECORDINGS, tanpuraRecordingsFor } from '../apps/web/src/tanpura.js';
import { TONICS } from '../apps/web/src/tonics.js';

test('real Cloudinary tanpura recordings cover every tonic', () => {
  TONICS.forEach(({ pitch }) => {
    const recordings = tanpuraRecordingsFor(pitch);
    assert.ok(recordings.length > 0, `${pitch} has no recording`);
    recordings.forEach((recording) => {
      assert.match(recording.url, /^https:\/\/res\.cloudinary\.com\/v2luwkfe\/video\/upload\//);
      assert.match(recording.file, /^tanpura_[a-z-]+_(low|medium)(_(male|female))?\.mp3$/);
    });
  });
  assert.equal(Object.keys(TANPURA_RECORDINGS).length, TONICS.length);
  assert.equal(tanpuraRecordingsFor('B3').length, 2);
});

test('HTML audio tanpura loops and fades independently', async () => {
  const calls = [];
  class FakeAudio {
    constructor() { this.src = ''; this.volume = 0; this.paused = true; this.loop = false; }
    load() { calls.push('load'); }
    play() { this.paused = false; calls.push('play'); return Promise.resolve(); }
    pause() { this.paused = true; calls.push('pause'); }
  }
  const player = createTanpuraPlayer({ Audio: FakeAudio, fadeSeconds: 0.01, targetVolume: 0.5 });
  const recording = tanpuraRecordingsFor('C4')[0];
  assert.equal((await player.start(recording)).ok, true);
  assert.equal(player.playing, true);
  assert.equal(player.source, recording.url);
  await player.stop();
  assert.equal(player.playing, false);
  assert.ok(calls.includes('play'));
  assert.ok(calls.includes('pause'));
});
