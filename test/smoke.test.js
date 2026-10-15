import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('the topic-neutral scaffold has a project manifest', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));

  assert.equal(packageJson.name, 'buildathon-project');
  assert.equal(packageJson.engines.node, '22.19.0');
  assert.equal(packageJson.scripts.start, 'node src/index.js');
  assert.equal(packageJson.scripts.test, 'node --test');
});
