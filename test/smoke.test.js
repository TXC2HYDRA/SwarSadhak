import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('the SwarSadhak workspace has a pinned project manifest', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));

  assert.equal(packageJson.name, 'swar-sadhak');
  assert.equal(packageJson.engines.node, '22.19.0');
  assert.ok(packageJson.workspaces.includes('packages/*'));
  assert.equal(packageJson.scripts.build, 'npm run build --workspace @swarsadhak/web');
  assert.equal(packageJson.scripts.test, 'node --test');
});
