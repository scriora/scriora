import { createServer, type RequestListener, type Server } from 'node:http';

export function createWorkerHttpServer(inngestHandler: RequestListener): Server {
  return createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://worker.local').pathname;
    if (request.method === 'GET' && pathname === '/health') {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ status: 'ok', service: 'scriora-worker' }));
      return;
    }

    inngestHandler(request, response);
  });
}
