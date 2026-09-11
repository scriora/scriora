import { prisma } from 'scriora-core';
import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/app.js';

describe('Security & Gateway Robustness Tests', () => {
  it('enforces JWT_SECRET rules in production and development', () => {
    const originalEnv = process.env.NODE_ENV;
    const originalSecret = process.env.JWT_SECRET;

    try {
      // 1. Missing secret in production throws
      process.env.NODE_ENV = 'production';
      delete process.env.JWT_SECRET;
      expect(() => buildApp()).toThrow(/JWT_SECRET environment variable is required in production/);

      // 2. Secret < 32 chars in production throws
      process.env.JWT_SECRET = 'short_secret';
      expect(() => buildApp()).toThrow(
        /JWT_SECRET must be at least 32 characters long in production/
      );

      // 3. Missing or < 32 chars in development throws
      process.env.NODE_ENV = 'development';
      delete process.env.JWT_SECRET;
      expect(() => buildApp()).toThrow(
        /JWT_SECRET environment variable is required and must be at least 32 characters long/
      );

      process.env.JWT_SECRET = 'too_short';
      expect(() => buildApp()).toThrow(
        /JWT_SECRET environment variable is required and must be at least 32 characters long/
      );
    } finally {
      process.env.NODE_ENV = originalEnv;
      process.env.JWT_SECRET = originalSecret;
    }
  });

  it('sanitizes x-request-id: accepts valid characters and length, replaces malicious/long IDs', async () => {
    const app = buildApp();

    // Valid header preserved
    const validRes = await app.inject({
      method: 'GET',
      url: '/health',
      headers: {
        'x-request-id': 'req_valid-123_test',
      },
    });
    expect(validRes.headers['x-request-id']).toBe('req_valid-123_test');

    // Header with invalid characters replaced
    const invalidCharRes = await app.inject({
      method: 'GET',
      url: '/health',
      headers: {
        'x-request-id': '<script>alert(1)</script>',
      },
    });
    expect(invalidCharRes.headers['x-request-id']).toMatch(/^req_[a-zA-Z0-9]{16}$/);

    // Header exceeding 64 chars replaced
    const tooLongRes = await app.inject({
      method: 'GET',
      url: '/health',
      headers: {
        'x-request-id': 'a'.repeat(65),
      },
    });
    expect(tooLongRes.headers['x-request-id']).toMatch(/^req_[a-zA-Z0-9]{16}$/);
  });

  it('verifies CORS lockdown behavior', async () => {
    const originalOrigins = process.env.CORS_ORIGINS;
    const originalEnv = process.env.NODE_ENV;

    try {
      process.env.NODE_ENV = 'production';
      process.env.CORS_ORIGINS = 'https://app.scriora.com, https://admin.scriora.com';
      process.env.JWT_SECRET = 'production_super_secret_32_chars_minimum_ok!';
      const prodApp = buildApp();

      // Allowed origin
      const allowedRes = await prodApp.inject({
        method: 'OPTIONS',
        url: '/health',
        headers: {
          origin: 'https://app.scriora.com',
          'access-control-request-method': 'GET',
        },
      });
      expect(allowedRes.headers['access-control-allow-origin']).toBe('https://app.scriora.com');

      // Disallowed origin should not be reflected
      const disallowedRes = await prodApp.inject({
        method: 'OPTIONS',
        url: '/health',
        headers: {
          origin: 'https://evil.attacker.com',
          'access-control-request-method': 'GET',
        },
      });
      expect(disallowedRes.headers['access-control-allow-origin']).toBeUndefined();
    } finally {
      process.env.CORS_ORIGINS = originalOrigins;
      process.env.NODE_ENV = originalEnv;
      delete process.env.JWT_SECRET;
    }
  });

  it('validates argon2 password hashing and verification in auth/register and auth/login', async () => {
    const app = buildApp();

    let savedUser: any = null;
    (vi.spyOn(prisma.user, 'findUnique') as any).mockImplementation(async ({ where }: any) => {
      if (where.email === 'new@scriora.io') return savedUser;
      return null;
    });

    (vi.spyOn(prisma, '$transaction') as any).mockImplementation(async (callback: any) => {
      return callback({
        user: {
          create: vi.fn().mockImplementation(async ({ data }: any) => {
            savedUser = {
              id: '11111111-1111-4111-8111-111111111111',
              email: data.email,
              name: data.name,
              passwordHash: data.passwordHash,
              authProvider: data.authProvider,
            };
            return savedUser;
          }),
        },
        workspace: {
          create: vi.fn().mockResolvedValue({
            id: '22222222-2222-4222-8222-222222222222',
            slug: 'test-ws',
          }),
        },
        workspaceMember: {
          create: vi.fn().mockResolvedValue({}),
        },
      });
    });

    // 1. Register with password
    const regRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: 'new@scriora.io',
        name: 'New User',
        password: 'SuperSecurePassword123!',
      },
    });

    expect(regRes.statusCode).toBe(201);
    const regBody = JSON.parse(regRes.body);
    expect(regBody.success).toBe(true);
    expect(savedUser.passwordHash).toMatch(/^\$argon2id\$/);

    // 2. Successful Login with argon2
    vi.spyOn(prisma.user, 'update').mockResolvedValue(savedUser);
    const loginRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: {
        email: 'new@scriora.io',
        password: 'SuperSecurePassword123!',
      },
    });

    expect(loginRes.statusCode).toBe(200);
    const loginBody = JSON.parse(loginRes.body);
    expect(loginBody.success).toBe(true);
    expect(loginBody.data.accessToken).toBeDefined();

    // 3. Failed Login with wrong password
    const failedLoginRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: {
        email: 'new@scriora.io',
        password: 'WrongPassword999!',
      },
    });

    expect(failedLoginRes.statusCode).toBe(401);
    expect(JSON.parse(failedLoginRes.body).error.code).toBe('INVALID_CREDENTIALS');
  });

  it('validates refresh token payload and verify query parameters with Zod', async () => {
    const app = buildApp();

    // 1. POST /v1/auth/refresh without cookie and invalid body returns 400
    const invalidBodyRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: {
        refreshToken: '',
      },
    });
    expect(invalidBodyRes.statusCode).toBe(400);
    expect(JSON.parse(invalidBodyRes.body).error.code).toBe('VALIDATION_ERROR');

    // 2. GET /v1/auth/verify with missing token returns 400
    const invalidQueryRes = await app.inject({
      method: 'GET',
      url: '/v1/auth/verify?token=',
    });
    expect(invalidQueryRes.statusCode).toBe(400);
    expect(JSON.parse(invalidQueryRes.body).error.code).toBe('MISSING_TOKEN');
  });

  it('validates UUID route parameters across workspaces, posts, and social-accounts', async () => {
    const app = buildApp();
    await app.ready();
    const token = app.jwt.sign({ sub: 'user-123' });

    // Mock workspace membership
    vi.spyOn(prisma.workspaceMember, 'findUnique').mockResolvedValue({
      workspaceId: '11111111-1111-4111-8111-111111111111',
      userId: 'user-123',
      workspaceRole: 'OWNER',
      joinedAt: new Date(),
      workspace: {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'WS',
        requiresApproval: false,
        settings: {},
      },
    } as any);

    // 1. Invalid wsId returns 400
    const badWsRes = await app.inject({
      method: 'GET',
      url: '/v1/workspaces/not-a-valid-uuid',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    expect(badWsRes.statusCode).toBe(400);
    expect(JSON.parse(badWsRes.body).error.code).toBe('VALIDATION_ERROR');

    // 2. Invalid postId returns 400
    const badPostRes = await app.inject({
      method: 'GET',
      url: '/v1/posts/invalid-post-uuid',
      headers: {
        authorization: `Bearer ${token}`,
        'x-workspace-id': '11111111-1111-4111-8111-111111111111',
      },
    });
    expect(badPostRes.statusCode).toBe(400);
    expect(JSON.parse(badPostRes.body).error.code).toBe('VALIDATION_ERROR');

    // 3. Invalid accountId returns 400
    const badAccountRes = await app.inject({
      method: 'GET',
      url: '/v1/social-accounts/invalid-account-uuid',
      headers: {
        authorization: `Bearer ${token}`,
        'x-workspace-id': '11111111-1111-4111-8111-111111111111',
      },
    });
    expect(badAccountRes.statusCode).toBe(400);
    expect(JSON.parse(badAccountRes.body).error.code).toBe('VALIDATION_ERROR');
  });

  it('tests connect OAuth security, open redirect protection, and envelope formatting', async () => {
    const app = buildApp();
    await app.ready();

    // 1. Missing workspaceId in /v1/connect/:platform returns 400
    const resNoWs = await app.inject({
      method: 'GET',
      url: '/v1/connect/linkedin',
    });
    expect(resNoWs.statusCode).toBe(400);
    expect(JSON.parse(resNoWs.body).error.code).toBe('MISSING_WORKSPACE_ID');

    // 2. Invalid state token in callback returns 400
    const resBadState = await app.inject({
      method: 'GET',
      url: '/v1/connect/linkedin/callback?code=test-code&state=invalid.jwt.token',
    });
    expect(resBadState.statusCode).toBe(400);
    expect(JSON.parse(resBadState.body).error.code).toBe('INVALID_STATE');

    // 3. Open redirect prevention: state with evil redirectUri redirects to default dashboard
    const evilState = app.jwt.sign({
      workspaceId: '11111111-1111-4111-8111-111111111111',
      platform: 'LINKEDIN',
      codeVerifier: 'verifier123',
      postRedirectUri: 'https://evil.com/phishing',
    });

    const { platformRegistry } = await import('scriora-social');
    const mockAdapter = {
      platform: 'LINKEDIN',
      getCapabilities: () => ({ publishing: true }),
      exchangeCodeForTokens: vi.fn().mockResolvedValue({
        accessToken: 'access-123',
        refreshToken: 'refresh-123',
        expiresIn: 3600,
        accountName: 'Test LinkedIn',
        externalAccountId: 'ext-123',
      }),
    };
    vi.spyOn(platformRegistry, 'get').mockReturnValue(mockAdapter as any);

    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
      return cb({
        socialAccount: {
          upsert: vi.fn().mockResolvedValue({
            id: '33333333-3333-4333-8333-333333333333',
            platform: 'LINKEDIN',
            accountName: 'Test LinkedIn',
          }),
        },
        secretEnvelope: {
          deleteMany: vi.fn().mockResolvedValue({}),
          create: vi.fn().mockResolvedValue({}),
        },
      });
    });

    const originalKey = process.env.MASTER_ENCRYPTION_KEY;
    try {
      // 64-char hex key (32 bytes)
      process.env.MASTER_ENCRYPTION_KEY =
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

      const callbackRes = await app.inject({
        method: 'GET',
        url: `/v1/connect/linkedin/callback?code=valid-code&state=${evilState}`,
      });

      expect(callbackRes.statusCode).toBe(302);
      const location = callbackRes.headers.location;
      expect(location).toBeDefined();
      const redirectUrl = new URL(location!);
      // MUST NOT redirect to evil.com
      expect(redirectUrl.origin).not.toBe('https://evil.com');
      expect(redirectUrl.pathname).toBe('/dashboard');
      expect(redirectUrl.searchParams.get('connected')).toBe('1');
    } finally {
      process.env.MASTER_ENCRYPTION_KEY = originalKey;
    }
  });
});
