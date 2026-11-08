import { createServer } from 'node:http';

export function createBackend(appName = 'prosango') {
  return createServer((request, response) => {
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
    response.end(JSON.stringify({ app: appName, service: 'typescript-backend', status: 'ok' }));
  });
}
