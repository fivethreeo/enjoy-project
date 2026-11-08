import { createBackend } from './server.js';

const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? '8002');
if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('HOST must be nonempty and PORT must be between 1 and 65535');
}
const { server, sockets } = createBackend(process.env.APP_NAME);
server.listen(port, host, () => console.log(`WebSocket backend listening on ${host}:${port}`));
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    for (const socket of sockets.clients) socket.close(1001, 'Server shutting down');
    sockets.close();
    server.close();
    const timeout = setTimeout(() => process.exit(1), 10000);
    timeout.unref();
  });
}
