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
    expect(body.data.devMagicLink).toMatch(
      /^http:\/\/localhost:4000\/v1\/auth\/verify\?token=/
    );
    expect(body.data.delivery).toBe('note');
  });

  it('POST /v1/auth/magic-link fails before persistence when production API_URL is missing', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalApiUrl = process.env.API_URL;
    process.env.NODE_ENV = 'production';
    delete process.env.API_URL;
    const findUser = vi.spyOn(prisma.user, 'findUnique');

    try {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/auth/magic-link',
        payload: { email: 'test@scriora.io', name: 'Test User' },
      });

      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.body).error.code).toBe('INTERNAL_SERVER_ERROR');
      expect(findUser).not.toHaveBeenCalled();
    } finally {
      if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = originalNodeEnv;
      if (originalApiUrl === undefined) delete process.env.API_URL;
      else process.env.API_URL = originalApiUrl;
    }
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

  it('GET /v1/auth/verify consumes a valid link and creates a session', async () => {
    vi.spyOn(prisma.user, 'findFirst').mockResolvedValue({
      id: 'u-123',
      email: 'test@scriora.io',
      name: 'Test User',
      emailVerifiedAt: null,
    } as never);
    const claimLink = vi.spyOn(prisma.user, 'updateMany').mockResolvedValue({ count: 1 } as never);
    const createSession = vi
      .spyOn(prisma.refreshSession, 'create')
      .mockResolvedValue({ id: 'sess-1' } as never);

    const res = await app.inject({
      method: 'GET',
      url: '/v1/auth/verify?token=one-time-link',
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.accessToken).toBeDefined();
    expect(claimLink).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'u-123', magicLinkTokenHash: expect.any(String) }),
      })
    );
    expect(createSession).toHaveBeenCalledOnce();
    expect(res.headers['set-cookie']).toContain('refreshToken=');
  });

  it('GET /v1/auth/verify rejects the request when another verifier consumes the link first', async () => {
    vi.spyOn(prisma.user, 'findFirst').mockResolvedValue({
      id: 'u-123',
      email: 'test@scriora.io',
      name: 'Test User',
      emailVerifiedAt: null,
    } as never);
    const legacyUpdate = vi.spyOn(prisma.user, 'update').mockResolvedValue({ id: 'u-123' } as never);
    const claimLink = vi.spyOn(prisma.user, 'updateMany').mockResolvedValue({ count: 0 } as never);
    const createSession = vi
      .spyOn(prisma.refreshSession, 'create')
      .mockResolvedValue({ id: 'sess-1' } as never);

    const res = await app.inject({
      method: 'GET',
      url: '/v1/auth/verify?token=one-time-link',
    });

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error.code).toBe('INVALID_OR_EXPIRED_TOKEN');
    expect(claimLink).toHaveBeenCalledOnce();
    expect(legacyUpdate).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
    expect(res.headers['set-cookie']).toBeUndefined();
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

  it('POST /v1/auth/refresh atomically rotates an active session', async () => {
    const refreshToken = app.jwt.sign(
      { sub: 'u-123', type: 'refresh', jti: 'presented-token' },
      { expiresIn: '30d' }
    );
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
      id: 'u-123',
      email: 'test@scriora.io',
      name: 'Test User',
    } as never);
    vi.spyOn(prisma.refreshSession, 'findUnique').mockResolvedValue({
      id: 'sess-1',
      userId: 'u-123',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    } as never);

    const claimPresented = vi.fn().mockResolvedValue({ count: 1 });
    const createReplacement = vi.fn().mockResolvedValue({ id: 'sess-2' });
    const linkReplacement = vi.fn().mockResolvedValue({ id: 'sess-1' });
    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) =>
      callback({
        refreshSession: {
          updateMany: claimPresented,
          create: createReplacement,
          update: linkReplacement,
        },
      })
    );

    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      cookies: { refreshToken },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.accessToken).toBeDefined();
    expect(claimPresented).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'sess-1', userId: 'u-123', revokedAt: null }),
      })
    );
    expect(createReplacement).toHaveBeenCalledOnce();
    expect(linkReplacement).toHaveBeenCalledWith({
      where: { id: 'sess-1' },
      data: { replacedBy: 'sess-2' },
    });
    expect(res.headers['set-cookie']).toContain('refreshToken=');
  });

  it('POST /v1/auth/refresh rejects the request when another rotation wins the CAS', async () => {
    const refreshToken = app.jwt.sign(
      { sub: 'u-123', type: 'refresh', jti: 'presented-token' },
      { expiresIn: '30d' }
    );
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
      id: 'u-123',
      email: 'test@scriora.io',
      name: 'Test User',
    } as never);
    vi.spyOn(prisma.refreshSession, 'findUnique').mockResolvedValue({
      id: 'sess-1',
      userId: 'u-123',
      tokenHash: 'presented-hash',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    } as never);
    const legacyCreate = vi
      .spyOn(prisma.refreshSession, 'create')
      .mockResolvedValue({ id: 'sess-2' } as never);
    const legacyUpdate = vi
      .spyOn(prisma.refreshSession, 'update')
      .mockResolvedValue({ id: 'sess-1' } as never);

    const createReplacement = vi.fn();
    const linkReplacement = vi.fn();
    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) =>
      callback({
        refreshSession: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          create: createReplacement,
          update: linkReplacement,
        },
      })
    );

    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      cookies: { refreshToken },
    });

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error.code).toBe('INVALID_REFRESH_TOKEN');
    expect(createReplacement).not.toHaveBeenCalled();
    expect(linkReplacement).not.toHaveBeenCalled();
    expect(legacyCreate).not.toHaveBeenCalled();
    expect(legacyUpdate).not.toHaveBeenCalled();
    expect(res.headers['set-cookie']).toBeUndefined();
  });
});
