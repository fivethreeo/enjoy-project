import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';
import { WebSocket } from 'ws';
import { createBackend } from '../dist/server.js';

async function listen(t, server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `127.0.0.1:${server.address().port}`;
}

async function backend(t, options) {
  const { server, sockets } = createBackend('template_staging', options);
  t.after(async () => {
    for (const socket of sockets.clients) socket.terminate();
    await new Promise((resolve) => sockets.close(resolve));
  });
  const address = await listen(t, server);
  return { address, sockets };
}

test('serves health and echoes text/binary frames over WebSockets', async (t) => {
  const calls = [];
  const django = await listen(t, createServer((request, response) => {
    calls.push({ path: request.url, ...request.headers });
    response.end(JSON.stringify({ user_id: 42 }));
  }));
  const { address, sockets } = await backend(t, {
    djangoUrl: `http://${django}/django/`,
    serviceToken: 'test-only-service-token',
    allowedOrigins: ['https://app.example'],
  });
  const health = await fetch(`http://${address}/healthz`);
  assert.deepEqual(await health.json(), {
    app: 'template_staging', service: 'typescript-ws-backend', status: 'ok',
  });
  assert.equal(calls.length, 0);
  assert.equal((await fetch(`http://${address}/`)).status, 426);
  const connection = once(sockets, 'connection');
  const socket = new WebSocket(`ws://${address}/`, {
    origin: 'https://app.example',
    headers: { Cookie: 'tracking=private; sessionid=valid-session', Authorization: 'Bearer browser-token' },
  });
  await once(socket, 'open');
  const [accepted] = await connection;
  assert.equal(accepted.userId, 42);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '/django/internal/auth/');
  assert.equal(calls[0].cookie, 'sessionid=valid-session');
  assert.equal(calls[0].authorization, 'Bearer test-only-service-token');
  for (const [value, binary] of [['hello', false], [Buffer.from([0, 1, 255]), true]]) {
    const message = once(socket, 'message');
    socket.send(value, { binary });
    const [received, receivedBinary] = await message;
    assert.equal(receivedBinary, binary);
    assert.deepEqual(received, Buffer.from(value));
  }
  socket.close();
  await once(socket, 'close');
});

test('rejects untrusted origins and unknown upgrade paths before contacting Django', async (t) => {
  let calls = 0;
  const django = await listen(t, createServer((request, response) => {
    calls++;
    response.writeHead(request.headers.cookie === 'sessionid=expired' ? 401 : 500);
    response.end('{}');
  }));
  const { address, sockets } = await backend(t, {
    djangoUrl: `http://${django}/`,
    serviceToken: 'test-only-service-token',
    allowedOrigins: ['https://app.example'],
  });
  for (const [path, origin, cookie, status, expectedCalls] of [
    ['/', undefined, 'valid', 403, 0],
    ['/', 'https://untrusted.example', 'valid', 403, 0],
    ['/missing', 'https://app.example', 'valid', 404, 0],
  ]) {
    const socket = new WebSocket(`ws://${address}${path}`, {
      ...(origin ? { origin } : {}),
      headers: cookie ? { Cookie: `sessionid=${cookie}` } : {},
    });
    socket.on('error', () => {});
    const [, response] = await once(socket, 'unexpected-response');
    assert.equal(response.statusCode, status);
    response.resume();
    socket.terminate();
    assert.equal(calls, expectedCalls);
    assert.equal(sockets.clients.size, 0);
  }
});

test('accepts anonymous sockets with missing sessions, invalid sessions, or unavailable authentication', async (t) => {
  let calls = 0;
  const django = await listen(t, createServer((request, response) => {
    calls++;
    response.writeHead(request.headers.cookie === 'sessionid=expired' ? 401 : 500);
    response.end('{}');
  }));
  for (const [serviceToken, cookie, expectedCalls] of [
    ['test-only-service-token', undefined, 0],
    ['test-only-service-token', 'expired', 1],
    ['test-only-service-token', 'unavailable', 2],
    ['', 'unconfigured', 2],
  ]) {
    const { address, sockets } = await backend(t, {
      djangoUrl: `http://${django}/`,
      serviceToken,
      allowedOrigins: ['https://app.example'],
    });
    const connection = once(sockets, 'connection');
    const socket = new WebSocket(`ws://${address}/`, {
      origin: 'https://app.example',
      headers: cookie ? { Cookie: `sessionid=${cookie}` } : {},
    });
    await once(socket, 'open');
    const [accepted] = await connection;
    assert.equal(accepted.userId, null);
    assert.equal(calls, expectedCalls);
    const message = once(socket, 'message');
    socket.send('anonymous');
    const [data] = await message;
    assert.equal(data.toString(), 'anonymous');
    socket.close();
    await once(socket, 'close');
  }
});

test('internal notifications reach all matching user connections but not other users or anonymous clients', async (t) => {
  const django = await listen(t, createServer((request, response) => {
    const userId = request.headers.cookie === 'sessionid=user-42' ? 42 : 7;
    response.end(JSON.stringify({ user_id: userId }));
  }));
  const { address, sockets } = await backend(t, {
    djangoUrl: `http://${django}/`,
    serviceToken: 'test-only-service-token',
    notifyToken: 'test-only-notify-token',
    allowedOrigins: ['https://app.example'],
  });
  const clients = [];
  for (const [cookie, userId] of [['user-42', 42], ['user-42', 42], ['user-7', 7], [undefined, null]]) {
    const connection = once(sockets, 'connection');
    const client = new WebSocket(`ws://${address}/`, {
      origin: 'https://app.example',
      headers: cookie ? { Cookie: `sessionid=${cookie}` } : {},
    });
    await once(client, 'open');
    const [accepted] = await connection;
    assert.equal(accepted.userId, userId);
    clients.push(client);
  }

  const messages = clients.slice(0, 2).map(client => once(client, 'message'));
  const excludedMessages = clients.slice(2).map(client => {
    const messages = [];
    client.on('message', data => messages.push(data.toString()));
    return messages;
  });
  const response = await fetch(`http://${address}/internal/notify/`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer test-only-notify-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ user_id: 42, event: 'addition.finished', result: 5 }),
  });
  assert.equal(response.status, 202);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { matched_connections: 2 });
  for (const [data] of await Promise.all(messages)) {
    assert.deepEqual(JSON.parse(data.toString()), { event: 'addition.finished', result: 5 });
  }

  for (const [index, client] of clients.slice(2).entries()) {
    const echo = once(client, 'message');
    client.send('echo-barrier');
    const [data] = await echo;
    assert.equal(data.toString(), 'echo-barrier');
    assert.deepEqual(excludedMessages[index], ['echo-barrier']);
  }
});

test('internal notifications require service authentication, valid payloads, and bounded bodies', async (t) => {
  const { address } = await backend(t, { notifyToken: 'test-only-notify-token' });
  const url = `http://${address}/internal/notify/`;
  const headers = {
    Authorization: 'Bearer test-only-notify-token',
    'Content-Type': 'application/json',
  };
  const validBody = JSON.stringify({ user_id: 42, event: 'finished', result: 5 });
  for (const authorization of ['', 'Bearer short', 'Bearer xest-only-notify-token']) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { ...headers, Authorization: authorization },
      body: validBody,
    });
    assert.equal(response.status, 403);
  }
  const method = await fetch(url);
  assert.equal(method.status, 405);
  assert.equal(method.headers.get('allow'), 'POST');
  for (const body of [
    'not-json',
    'null',
    JSON.stringify({ user_id: null, event: 'finished' }),
    JSON.stringify({ user_id: false, event: 'finished' }),
    JSON.stringify({ user_id: 42 }),
  ]) {
    assert.equal((await fetch(url, { method: 'POST', headers, body })).status, 400);
  }
  const oversized = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ user_id: 42, event: 'finished', result: '\u00e9'.repeat(33000) }),
  });
  assert.equal(oversized.status, 413);
  assert.equal((await fetch(`http://${address}/healthz`)).status, 200);
  const offline = await fetch(url, { method: 'POST', headers, body: validBody });
  assert.equal(offline.status, 202);
  assert.deepEqual(await offline.json(), { matched_connections: 0 });
});

test('an unconfigured notification endpoint stays disabled without affecting health', async (t) => {
  const warnings = t.mock.method(console, 'warn', () => {});
  const { address } = await backend(t, { notifyToken: '' });
  const response = await fetch(`http://${address}/internal/notify/`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' },
    body: '{}',
  });
  assert.equal(response.status, 503);
  assert.equal((await fetch(`http://${address}/healthz`)).status, 200);
  assert.equal(warnings.mock.calls.filter(
    call => call.arguments[0].includes('WS_INTERNAL_NOTIFY_TOKEN'),
  ).length, 1);
});

test('missing auth key warns once while anonymous WebSockets remain available', async (t) => {
  const warnings = t.mock.method(console, 'warn', () => {});
  let calls = 0;
  const django = await listen(t, createServer((request, response) => {
    calls++;
    response.end(JSON.stringify({ user_id: 42 }));
  }));
  const { address, sockets } = await backend(t, {
    djangoUrl: `http://${django}/`,
    serviceToken: '',
    notifyToken: 'test-only-notify-token',
    allowedOrigins: ['https://app.example'],
  });

  assert.equal(warnings.mock.callCount(), 1);
  assert.ok(warnings.mock.calls[0].arguments[0].includes('DJANGO_INTERNAL_AUTH_TOKEN'));
  for (let i = 0; i < 2; i++) {
    const connection = once(sockets, 'connection');
    const socket = new WebSocket(`ws://${address}/`, {
      origin: 'https://app.example',
      headers: { Cookie: 'sessionid=valid' },
    });
    await once(socket, 'open');
    const [accepted] = await connection;
    assert.equal(accepted.userId, null);
    socket.close();
    await once(socket, 'close');
  }
  assert.equal(calls, 0);
  assert.equal(warnings.mock.callCount(), 1);
  await backend(t, {
    djangoUrl: `http://${django}/`,
    serviceToken: 'test-only-service-token',
    notifyToken: 'test-only-notify-token',
  });
  assert.equal(warnings.mock.callCount(), 1);
});

test('uses only the configured Django cookie when apps share an origin', async (t) => {
  const cookies = [];
  const django = await listen(t, createServer((request, response) => {
    cookies.push(request.headers.cookie);
    response.end(JSON.stringify({ user_id: 42 }));
  }));
  const { address, sockets } = await backend(t, {
    djangoUrl: `http://${django}/`, serviceToken: 'test-only-service-token',
    sessionCookieName: 'template_sessionid', allowedOrigins: ['https://app.example'],
  });
  const connection = once(sockets, 'connection');
  const socket = new WebSocket(`ws://${address}/`, {
    origin: 'https://app.example',
    headers: { Cookie: 'sessionid=prosango; template_sessionid=template' },
  });
  await once(socket, 'open');
  const [accepted] = await connection;
  assert.equal(accepted.userId, 42);
  assert.deepEqual(cookies, ['template_sessionid=template']);
  socket.close();
  await once(socket, 'close');
});
