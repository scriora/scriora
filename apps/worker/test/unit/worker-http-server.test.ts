import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWorkerHttpServer } from '../../src/worker-http-server.js';

describe('worker HTTP server', () => {
  const servers: ReturnType<typeof createWorkerHttpServer>[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(
        (server) => new Promise<void>((resolve) => server.close(() => resolve()))
      )
    );
  });

  it('serves health checks and delegates other requests to Inngest', async () => {
    const inngestHandler = vi.fn((_request, response) => {
      response.writeHead(202, { 'content-type': 'text/plain' });
      response.end('inngest');
    });
    const server = createWorkerHttpServer(inngestHandler);
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;

    const health = await fetch(`http://127.0.0.1:${port}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: 'ok', service: 'scriora-worker' });
    expect(inngestHandler).not.toHaveBeenCalled();

    const inngest = await fetch(`http://127.0.0.1:${port}/api/inngest`);
    expect(inngest.status).toBe(202);
    expect(await inngest.text()).toBe('inngest');
    expect(inngestHandler).toHaveBeenCalledOnce();
  });
});
