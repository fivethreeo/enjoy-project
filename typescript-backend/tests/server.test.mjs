import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';
import { createBackend } from '../dist/server.js';

async function listen(t, server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('serves health/JSON and rejects unknown paths and methods', async (t) => {
  const calls = [];
  const django = await listen(t, createServer((request, response) => {
    calls.push({ path: request.url, ...request.headers });
    response.setHeader('Content-Type', 'application/json');
    if (request.headers.cookie !== 'sessionid=valid-session') {
      response.writeHead(401);
      response.end('{}');
    } else {
      response.end(JSON.stringify({ user_id: 42 }));
    }
  }));
  const server = createBackend('template_staging', {
    djangoUrl: `${django}/django`, serviceToken: 'test-only-service-token',
  });
  const requests = [];
  server.on('request', request => requests.push(request));
  const base = await listen(t, server);
  const health = await fetch(base + '/healthz');
  assert.equal(health.status, 200);
  assert.equal(calls.length, 0);
  assert.equal((await fetch(base)).status, 200);
  assert.equal(requests.at(-1).userId, null);
  assert.equal(calls.length, 0);
  for (const [path, headers] of [
    ['/healthz', {}],
    ['/', { Cookie: 'tracking=private; sessionid=valid-session', Authorization: 'Bearer browser-token' }],
  ]) {
    const response = await fetch(base + path, { headers });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      app: 'template_staging', service: 'typescript-backend', status: 'ok',
    });
  }
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '/django/internal/auth/');
  assert.equal(calls[0].cookie, 'sessionid=valid-session');
  assert.equal(calls[0].authorization, 'Bearer test-only-service-token');
  assert.equal(requests.at(-1).userId, 42);
  const anonymous = await fetch(base, { headers: { Cookie: 'sessionid=expired-session' } });
  assert.equal(anonymous.status, 200);
  assert.equal(anonymous.headers.get('cache-control'), 'no-store');
  assert.equal(requests.at(-1).userId, null);
  assert.equal((await fetch(base + '/missing')).status, 404);
  const response = await fetch(base, { method: 'POST' });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET');
});

test('falls back to anonymous when Django authentication is unconfigured or returns unusable responses', async (t) => {
  const django = await listen(t, createServer((request, response) => {
    if (request.headers.cookie === 'sessionid=redirect') {
      response.writeHead(302, { Location: '/other-auth/' });
      response.end();
    } else if (request.headers.cookie === 'sessionid=invalid-service') {
      response.writeHead(403);
      response.end('{}');
    } else if (request.headers.cookie === 'sessionid=unavailable') {
      response.writeHead(500);
      response.end('{}');
    } else if (request.headers.cookie === 'sessionid=invalid-json') {
      response.end('not json');
    } else {
      response.end(JSON.stringify({ user_id: false }));
    }
  }));
  for (const [serviceToken, cookie] of [
    ['', 'valid-session'],
    ['test-only-service-token', 'redirect'],
    ['test-only-service-token', 'invalid-service'],
    ['test-only-service-token', 'unavailable'],
    ['test-only-service-token', 'invalid-json'],
    ['test-only-service-token', 'invalid-user'],
  ]) {
    await t.test(cookie, async (t) => {
      const server = createBackend('template', { djangoUrl: django, serviceToken });
      let request;
      server.on('request', incoming => { request = incoming; });
      const base = await listen(t, server);
      assert.equal((await fetch(base + '/healthz')).status, 200);
      const response = await fetch(base, { headers: { Cookie: `sessionid=${cookie}` } });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(request.userId, null);
    });
  }
});

test('missing auth configuration warns once and never contacts Django', async (t) => {
  const warnings = t.mock.method(console, 'warn', () => {});
  let calls = 0;
  const django = await listen(t, createServer((request, response) => {
    calls++;
    response.end(JSON.stringify({ user_id: 42 }));
  }));
  for (const [options, missing] of [
    [{ djangoUrl: django, serviceToken: '' }, 'DJANGO_INTERNAL_AUTH_TOKEN'],
    [{ djangoUrl: '', serviceToken: 'test-only-service-token' }, 'DJANGO_INTERNAL_URL'],
  ]) {
    const before = warnings.mock.callCount();
    const server = createBackend('template', options);
    assert.equal(warnings.mock.callCount(), before + 1);
    assert.ok(warnings.mock.calls.at(-1).arguments[0].includes(missing));
    let request;
    server.on('request', incoming => { request = incoming; });
    const base = await listen(t, server);
    for (let i = 0; i < 2; i++) {
      assert.equal((await fetch(base, { headers: { Cookie: 'sessionid=valid' } })).status, 200);
      assert.equal(request.userId, null);
    }
    assert.equal(warnings.mock.callCount(), before + 1);
  }
  assert.equal(calls, 0);
  createBackend('template', { djangoUrl: django, serviceToken: 'test-only-service-token' });
  assert.equal(warnings.mock.callCount(), 2);
});

test('uses the configured session cookie without forwarding another apps session', async (t) => {
  const calls = [];
  const django = await listen(t, createServer((request, response) => {
    calls.push(request.headers.cookie);
    response.end(JSON.stringify({ user_id: 42 }));
  }));
  const server = createBackend('template', {
    djangoUrl: django, serviceToken: 'test-only-service-token',
    sessionCookieName: 'template_sessionid',
  });
  let request;
  server.on('request', incoming => { request = incoming; });
  const base = await listen(t, server);
  await fetch(base, { headers: { Cookie: 'sessionid=prosango; template_sessionid=template' } });
  assert.equal(request.userId, 42);
  assert.deepEqual(calls, ['template_sessionid=template']);
  await fetch(base, { headers: { Cookie: 'sessionid=prosango' } });
  assert.equal(request.userId, null);
  assert.equal(calls.length, 1);
});
