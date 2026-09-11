import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from 'scriora-core';
import { buildApp } from '../../src/app.js';

describe('API Routes — Auth', () => {
  const app = buildApp();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('POST /v1/auth/magic-link generates a login link', async () => {
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(null);
    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
      return callback({
        user: {
          create: vi.fn().mockResolvedValue({
            id: 'u-123',
            email: 'test@scriora.io',
            name: 'Test User',
          }),
        },
        workspace: {
          create: vi.fn().mockResolvedValue({
            id: 'ws-123',
            slug: 'test-ws',
          }),
        },
        workspaceMember: {
          create: vi.fn().mockResolvedValue({}),
        },
      });
    });

    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/magic-link',
      payload: {
        email: 'test@scriora.io',
        name: 'Test User',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.email).toBe('test@scriora.io');
    expect(body.data.devMagicLink).toBeDefined();
  });

  it('GET /v1/auth/verify returns 400 when token is missing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/auth/verify',
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('MISSING_TOKEN');
  });

  it('DELETE /v1/auth/logout clears cookie and returns 200', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/v1/auth/logout',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });
});
