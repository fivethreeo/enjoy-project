import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { WebSocket } from 'ws';
import { createBackend } from '../dist/server.js';

test('serves health and echoes text/binary frames over WebSockets', async (t) => {
  const { server, sockets } = createBackend('prosango_staging');
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    for (const socket of sockets.clients) socket.terminate();
    await new Promise((resolve) => sockets.close(resolve));
    await new Promise((resolve) => server.close(resolve));
  });
  const address = `127.0.0.1:${server.address().port}`;
  const health = await fetch(`http://${address}/healthz`);
  assert.deepEqual(await health.json(), {
    app: 'prosango_staging', service: 'typescript-ws-backend', status: 'ok',
  });
  assert.equal((await fetch(`http://${address}/`)).status, 426);
  const socket = new WebSocket(`ws://${address}/`);
  await once(socket, 'open');
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
