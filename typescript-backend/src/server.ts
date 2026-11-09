import { createServer, type IncomingMessage } from 'node:http';
import { authenticate, type AuthOptions } from './auth.js';

export interface SessionRequest extends IncomingMessage {
  userId?: string | number | null;
}

export function createBackend(appName = 'template', authOptions: AuthOptions = {}) {
  const auth = {
    djangoUrl: authOptions.djangoUrl ?? process.env.DJANGO_INTERNAL_URL,
    serviceToken: authOptions.serviceToken ?? process.env.DJANGO_INTERNAL_AUTH_TOKEN,
    sessionCookieName: authOptions.sessionCookieName ?? process.env.DJANGO_SESSION_COOKIE_NAME,
  };
  if (!auth.serviceToken) {
    console.warn('DJANGO_INTERNAL_AUTH_TOKEN is not set; Django session authentication is disabled. Requests remain anonymous.');
  } else if (!auth.djangoUrl) {
    console.warn('DJANGO_INTERNAL_URL is not set; Django session authentication is disabled. Requests remain anonymous.');
  }
  return createServer(async (request: SessionRequest, response) => {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (request.method !== 'GET') {
      response.writeHead(405, { Allow: 'GET' });
      response.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (path !== '/' && path !== '/healthz') {
      response.writeHead(404);
      response.end(JSON.stringify({ error: 'Not found' }));
      return;
    }
    if (path === '/') {
      response.setHeader('Cache-Control', 'no-store');
      request.userId = await authenticate(request, auth);
    }
    response.end(JSON.stringify({ app: appName, service: 'typescript-backend', status: 'ok' }));
  });
}
