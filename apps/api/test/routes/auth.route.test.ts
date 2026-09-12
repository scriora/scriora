import { prisma } from 'scriora-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
    expect(body.data.delivery).toBe('note');
  });

  it('POST /v1/auth/register requires a password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: 'nopass@scriora.io',
        name: 'No Pass',
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('VALIDATION_ERROR');
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

  it('DELETE /v1/auth/logout revokes the refresh session and returns 200', async () => {
    const refreshToken = app.jwt.sign({ sub: 'u-123', type: 'refresh' }, { expiresIn: '30d' });
    const revokeSpy = vi.spyOn(prisma.refreshSession, 'updateMany').mockResolvedValue({ count: 1 } as never);

    const res = await app.inject({
      method: 'DELETE',
      url: '/v1/auth/logout',
      cookies: { refreshToken },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(revokeSpy).toHaveBeenCalled();
  });

  it('POST /v1/auth/refresh rejects a rotated/revoked session', async () => {
    const refreshToken = app.jwt.sign({ sub: 'u-123', type: 'refresh' }, { expiresIn: '30d' });
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
      id: 'u-123',
      email: 'test@scriora.io',
      name: 'Test User',
    } as never);
    vi.spyOn(prisma.refreshSession, 'findUnique').mockResolvedValue({
      id: 'sess-1',
      userId: 'u-123',
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    } as never);

    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      cookies: { refreshToken },
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('INVALID_REFRESH_TOKEN');
  });
});
