import { timingSafeEqual } from 'node:crypto';
import { createServer, STATUS_CODES, type IncomingMessage, type ServerResponse } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { authenticate, type AuthOptions } from './auth.js';

interface BackendOptions extends AuthOptions {
  allowedOrigins?: string[];
  notifyToken?: string;
}

export type SessionWebSocket = WebSocket & { userId: string | number | null };

async function notify(
  request: IncomingMessage,
  response: ServerResponse,
  sockets: WebSocketServer,
  token: string | undefined,
) {
  const reply = (status: number, body: unknown) => {
    response.writeHead(status, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    });
    response.end(JSON.stringify(body));
  };

  if (!token) return reply(503, { error: 'Unavailable' });
  const expected = Buffer.from(`Bearer ${token}`);
  const supplied = Buffer.from(request.headers.authorization ?? '');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return reply(403, { error: 'Forbidden' });
  }

  let notification: { user_id?: unknown; event?: unknown; result?: unknown };
  let message: string;
  try {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request.iterator({ destroyOnReturn: false })) {
      const buffer = Buffer.from(chunk);
      size += buffer.length;
      if (size > 64 * 1024) {
        request.resume();
        return reply(413, { error: 'Payload too large' });
      }
      chunks.push(buffer);
    }
    notification = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const userId = notification.user_id;
    const validId = (typeof userId === 'string' && userId.length > 0)
      || (typeof userId === 'number' && Number.isSafeInteger(userId) && userId > 0);
    if (!validId || typeof notification.event !== 'string' || !notification.event) {
      return reply(400, { error: 'Invalid notification' });
    }
    message = JSON.stringify({ event: notification.event, result: notification.result });
  } catch {
    if (!response.destroyed) reply(400, { error: 'Invalid JSON' });
    return;
  }

  let matched = 0;
  for (const socket of sockets.clients) {
    const client = socket as SessionWebSocket;
    if (client.userId === notification.user_id && client.readyState === WebSocket.OPEN) {
      client.send(message, (error) => {
        if (error) client.terminate();
      });
      matched++;
    }
  }
  reply(202, { matched_connections: matched });
}

export function createBackend(appName = 'template', options: BackendOptions = {}) {
  const auth = {
    djangoUrl: options.djangoUrl ?? process.env.DJANGO_INTERNAL_URL,
    serviceToken: options.serviceToken ?? process.env.DJANGO_INTERNAL_AUTH_TOKEN,
    sessionCookieName: options.sessionCookieName ?? process.env.DJANGO_SESSION_COOKIE_NAME,
  };
  if (!auth.serviceToken) {
    console.warn('DJANGO_INTERNAL_AUTH_TOKEN is not set; Django session authentication is disabled. Connections remain anonymous.');
  } else if (!auth.djangoUrl) {
    console.warn('DJANGO_INTERNAL_URL is not set; Django session authentication is disabled. Connections remain anonymous.');
  }
  const notifyToken = options.notifyToken ?? process.env.WS_INTERNAL_NOTIFY_TOKEN;
  if (!notifyToken) {
    console.warn('WS_INTERNAL_NOTIFY_TOKEN is not set; internal WebSocket notifications are disabled.');
  }
  const allowedOrigins = options.allowedOrigins
    ?? (process.env.WS_ALLOWED_ORIGINS || '').split(',').map((origin) => origin.trim()).filter(Boolean);
  const server = createServer(async (request, response) => {
    if (request.url === '/internal/notify/') {
      if (request.method !== 'POST') {
        response.writeHead(405, {
          Allow: 'POST',
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        });
        response.end(JSON.stringify({ error: 'Method not allowed' }));
      } else {
        await notify(request, response, sockets, notifyToken);
      }
      return;
    }
    if (request.method === 'GET' && request.url === '/healthz') {
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.end(JSON.stringify({ app: appName, service: 'typescript-ws-backend', status: 'ok' }));
    } else {
      response.writeHead(426, { Upgrade: 'websocket' });
      response.end('WebSocket connection required');
    }
  });
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
  server.on('upgrade', async (request, socket, head) => {
    socket.on('error', () => socket.destroy());
    const reject = (status: number) => {
      socket.end(
        `HTTP/1.1 ${status} ${STATUS_CODES[status]}\r\n`
        + 'Connection: close\r\nCache-Control: no-store\r\nContent-Length: 0\r\n\r\n',
      );
    };
    if (new URL(request.url ?? '/', 'http://localhost').pathname !== '/') {
      reject(404);
      return;
    }
    if (!request.headers.origin || !allowedOrigins.includes(request.headers.origin)) {
      reject(403);
      return;
    }
    const userId = await authenticate(request, auth);
    if (socket.destroyed || !socket.writable) return;
    sockets.handleUpgrade(request, socket, head, (socket) => {
      const sessionSocket = socket as SessionWebSocket;
      sessionSocket.userId = userId;
      sockets.emit('connection', sessionSocket, request);
    });
  });
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
