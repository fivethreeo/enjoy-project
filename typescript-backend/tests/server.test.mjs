import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { createBackend } from '../dist/server.js';

test('serves health/JSON and rejects unknown paths and methods', async (t) => {
  const server = createBackend('prosango_staging');
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const path of ['/', '/healthz']) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      app: 'prosango_staging', service: 'typescript-backend', status: 'ok',
    });
  }
  assert.equal((await fetch(base + '/missing')).status, 404);
  const response = await fetch(base, { method: 'POST' });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET');
});
