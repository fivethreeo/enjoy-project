import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';

export function createBackend(appName = 'prosango') {
  const server = createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/healthz') {
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.end(JSON.stringify({ app: appName, service: 'typescript-ws-backend', status: 'ok' }));
    } else {
      response.writeHead(426, { Upgrade: 'websocket' });
      response.end('WebSocket connection required');
    }
  });
  const sockets = new WebSocketServer({ server, path: '/', maxPayload: 1024 * 1024 });
  sockets.on('connection', (socket) => {
    socket.on('error', () => socket.terminate());
    socket.on('message', (data, binary) => socket.send(data, { binary }));
    let alive = true;
    socket.on('pong', () => { alive = true; });
    const heartbeat = setInterval(() => {
      if (!alive) {
        socket.terminate();
        return;
      }
      alive = false;
      socket.ping();
    }, 30000);
    heartbeat.unref();
    socket.once('close', () => clearInterval(heartbeat));
  });
  return { server, sockets };
}
