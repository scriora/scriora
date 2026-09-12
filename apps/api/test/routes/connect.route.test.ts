import { prisma } from 'scriora-core';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/app.js';

const validWsId = '11111111-1111-4111-8111-111111111111';
const otherWsId = '22222222-2222-4222-8222-222222222222';
const userId = 'user-123';

function mockWorkspaceMember(workspaceId = validWsId, memberUserId = userId) {
  vi.spyOn(prisma.oAuthConnectNonce, 'create').mockResolvedValue({
    nonce: 'test-nonce',
    userId: memberUserId,
    workspaceId,
  } as never);
  return vi.spyOn(prisma.workspaceMember, 'findUnique').mockResolvedValue({
    workspaceId,
    userId: memberUserId,
    workspaceRole: 'OWNER',
    joinedAt: new Date(),
    workspace: {
      id: workspaceId,
      name: 'Test Workspace',
      slug: 'test-ws',
      purpose: 'WORK',
      defaultOperatingMode: 'MANUAL',
      ownerUserId: memberUserId,
      country: null,
      timezone: 'UTC',
      requiresApproval: false,
      settings: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  } as never);
}

describe('API Routes — Connect & OAuth (LinkedIn & X)', () => {
  beforeAll(() => {
    process.env.LINKEDIN_CLIENT_ID = 'test_li_client_id';
    process.env.LINKEDIN_CLIENT_SECRET = 'test_li_client_secret';
    process.env.X_CLIENT_ID = 'test_x_client_id';
    process.env.X_CLIENT_SECRET = 'test_x_client_secret';
    process.env.INSTAGRAM_APP_ID = 'test_ig_app_id';
    process.env.INSTAGRAM_APP_SECRET = 'test_ig_app_secret';
    process.env.THREADS_APP_ID = 'test_th_app_id';
    process.env.THREADS_APP_SECRET = 'test_th_app_secret';
  });

  const app = buildApp();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function authHeaders(workspaceId = validWsId) {
    return {
      authorization: `Bearer ${app.jwt.sign({ sub: userId })}`,
      'x-workspace-id': workspaceId,
    };
  }

  it('GET /v1/connect/linkedin returns 401 when unauthenticated', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/connect/linkedin?workspaceId=${validWsId}`,
    });

    expect(res.statusCode).toBe(401);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(false);
    expect(json.error.category).toBe('AUTHENTICATION_ERROR');
  });

  it('GET /v1/connect/linkedin returns 403 when caller is not a workspace member', async () => {
    vi.spyOn(prisma.workspaceMember, 'findUnique').mockResolvedValue(null);

    const res = await app.inject({
      method: 'GET',
      url: `/v1/connect/linkedin?workspaceId=${validWsId}`,
      headers: authHeaders(),
    });

    expect(res.statusCode).toBe(403);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('FORBIDDEN_WORKSPACE');
  });

  it('GET /v1/connect/linkedin redirects to LinkedIn OAuth authorization URL', async () => {
    mockWorkspaceMember();

    const res = await app.inject({
      method: 'GET',
      url: `/v1/connect/linkedin?workspaceId=${validWsId}`,
      headers: authHeaders(),
    });

    expect(res.statusCode).toBe(302);
    const location = res.headers.location;
    expect(location).toBeDefined();
    expect(location).toContain('https://www.linkedin.com/oauth/v2/authorization');
    expect(location).toContain('client_id=test_li_client_id');
    expect(location).toContain('response_type=code');
    expect(location).toContain('state=');
  });

  it('GET /v1/connect/x redirects to Twitter/X OAuth authorization URL', async () => {
    mockWorkspaceMember();

    const res = await app.inject({
      method: 'GET',
      url: `/v1/connect/x?workspaceId=${validWsId}`,
      headers: authHeaders(),
    });

    expect(res.statusCode).toBe(302);
    const location = res.headers.location;
    expect(location).toBeDefined();
    expect(location).toContain('https://twitter.com/i/oauth2/authorize');
    expect(location).toContain('client_id=test_x_client_id');
    expect(location).toContain('code_challenge_method=S256');
    expect(location).toContain('state=');
  });

  it('GET /v1/connect/linkedin without workspaceId returns 400 Bad Request', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/connect/linkedin',
      headers: {
        authorization: `Bearer ${app.jwt.sign({ sub: userId })}`,
      },
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('MISSING_WORKSPACE_ID');
    expect(json.error.message).toContain('workspaceId');
  });

  it('GET /v1/connect/unsupported_network returns 400 UNSUPPORTED_PLATFORM', async () => {
    mockWorkspaceMember();

    const res = await app.inject({
      method: 'GET',
      url: `/v1/connect/unsupported_network?workspaceId=${validWsId}`,
      headers: authHeaders(),
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('UNSUPPORTED_PLATFORM');
  });

  it('POST /v1/connect/telegram returns 401 when unauthenticated', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/connect/telegram?workspaceId=${validWsId}`,
      payload: {
        botToken: '123456:ABC-DEF',
        chatId: '@channel',
      },
    });

    expect(res.statusCode).toBe(401);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(false);
    expect(json.error.category).toBe('AUTHENTICATION_ERROR');
  });

  it('POST /v1/connect/discord returns 401 when unauthenticated', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/connect/discord?workspaceId=${validWsId}`,
      payload: {
        mode: 'BOT',
        botToken: 'abcdef12345678901234567890',
        channelId: '123456789012345678',
      },
    });

    expect(res.statusCode).toBe(401);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(false);
    expect(json.error.category).toBe('AUTHENTICATION_ERROR');
  });

  it('POST /v1/connect/discord returns 400 INVALID_PAYLOAD on malformed payload', async () => {
    mockWorkspaceMember();

    const res = await app.inject({
      method: 'POST',
      url: `/v1/connect/discord?workspaceId=${validWsId}`,
      headers: authHeaders(),
      payload: { mode: 'INVALID_MODE' },
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('INVALID_PAYLOAD');
  });

  it('POST /v1/connect/discord returns 400 MISSING_WORKSPACE_ID if no workspace provided', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/connect/discord',
      headers: {
        authorization: `Bearer ${app.jwt.sign({ sub: userId })}`,
      },
      payload: {
        mode: 'BOT',
        botToken: 'abcdef12345678901234567890',
        channelId: '123456789012345678',
      },
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('MISSING_WORKSPACE_ID');
  });

  it('GET /v1/connect/discord/channels returns 401 when unauthenticated', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/connect/discord/channels',
    });

    expect(res.statusCode).toBe(401);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(false);
    expect(json.error.category).toBe('AUTHENTICATION_ERROR');
  });

  it('GET /v1/connect/discord/channels returns 400 MISSING_BOT_TOKEN when token not provided', async () => {
    mockWorkspaceMember();
    const savedToken = process.env.DISCORD_BOT_TOKEN;
    delete process.env.DISCORD_BOT_TOKEN;

    const res = await app.inject({
      method: 'GET',
      url: `/v1/connect/discord/channels?workspaceId=${validWsId}`,
      headers: authHeaders(),
    });

    if (savedToken) process.env.DISCORD_BOT_TOKEN = savedToken;

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('MISSING_BOT_TOKEN');
  });

  it('GET /v1/connect/discord/channels does not decrypt envelopes for non-members', async () => {
    const accountId = '33333333-3333-4333-8333-333333333333';
    vi.spyOn(prisma.socialAccount, 'findUnique').mockResolvedValue({
      id: accountId,
      workspaceId: otherWsId,
    } as never);
    vi.spyOn(prisma.workspaceMember, 'findUnique').mockResolvedValue(null);
    const envelopeSpy = vi.spyOn(prisma.secretEnvelope, 'findFirst');

    const res = await app.inject({
      method: 'GET',
      url: `/v1/connect/discord/channels?socialAccountId=${accountId}`,
      headers: {
        authorization: `Bearer ${app.jwt.sign({ sub: userId })}`,
      },
    });

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error.code).toBe('FORBIDDEN_WORKSPACE');
    expect(envelopeSpy).not.toHaveBeenCalled();
  });

  it('GET /v1/connect/linkedin/callback rejects missing OAuth state', async () => {
    const findFirstSpy = vi.spyOn(prisma.workspace, 'findFirst');
    const txSpy = vi.spyOn(prisma, '$transaction');

    const res = await app.inject({
      method: 'GET',
      url: '/v1/connect/linkedin/callback?code=test-code',
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('MISSING_STATE');
    expect(findFirstSpy).not.toHaveBeenCalled();
    expect(txSpy).not.toHaveBeenCalled();
  });

  it('GET /v1/connect/linkedin/callback rejects state without workspaceId', async () => {
    const state = app.jwt.sign({
      platform: 'LINKEDIN',
      codeVerifier: 'verifier123',
    });
    const findFirstSpy = vi.spyOn(prisma.workspace, 'findFirst');

    const res = await app.inject({
      method: 'GET',
      url: `/v1/connect/linkedin/callback?code=test-code&state=${state}`,
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('INVALID_STATE');
    expect(findFirstSpy).not.toHaveBeenCalled();
  });

  it('GET /v1/connect/linkedin/callback rejects unknown workspaceId without oldest-workspace fallback', async () => {
    const state = app.jwt.sign({
      workspaceId: validWsId,
      platform: 'LINKEDIN',
      codeVerifier: 'verifier123',
      userId,
      nonce: '1234567890abcdef',
    });
    vi.spyOn(prisma.oAuthConnectNonce, 'updateMany').mockResolvedValue({ count: 1 } as never);
    vi.spyOn(prisma.workspaceMember, 'findUnique').mockResolvedValue({
      userId,
    } as never);
    vi.spyOn(prisma.workspace, 'findUnique').mockResolvedValue(null);
    const findFirstSpy = vi.spyOn(prisma.workspace, 'findFirst');
    const txSpy = vi.spyOn(prisma, '$transaction');

    const res = await app.inject({
      method: 'GET',
      url: `/v1/connect/linkedin/callback?code=test-code&state=${state}`,
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('UNKNOWN_WORKSPACE');
    expect(findFirstSpy).not.toHaveBeenCalled();
    expect(txSpy).not.toHaveBeenCalled();
  });

  it('GET /v1/connect/linkedin/callback rejects a reused nonce', async () => {
    const state = app.jwt.sign({
      workspaceId: validWsId,
      platform: 'LINKEDIN',
      codeVerifier: 'verifier123',
      userId,
      nonce: '1234567890abcdef',
    });
    vi.spyOn(prisma.oAuthConnectNonce, 'updateMany').mockResolvedValue({ count: 0 } as never);

    const res = await app.inject({
      method: 'GET',
      url: `/v1/connect/linkedin/callback?code=test-code&state=${state}`,
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('INVALID_STATE');
  });

  it('GET /v1/connect/linkedin/callback rejects when initiator is no longer a member', async () => {
    const state = app.jwt.sign({
      workspaceId: validWsId,
      platform: 'LINKEDIN',
      codeVerifier: 'verifier123',
      userId,
      nonce: '1234567890abcdef',
    });
    vi.spyOn(prisma.oAuthConnectNonce, 'updateMany').mockResolvedValue({ count: 1 } as never);
    vi.spyOn(prisma.workspaceMember, 'findUnique').mockResolvedValue(null);

    const res = await app.inject({
      method: 'GET',
      url: `/v1/connect/linkedin/callback?code=test-code&state=${state}`,
    });

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error.code).toBe('OAUTH_MEMBERSHIP_REVOKED');
  });

  it('GET /v1/connect/instagram redirects to Meta OAuth authorization URL', async () => {
    mockWorkspaceMember();
    process.env.INSTAGRAM_APP_ID = 'test_ig_app_id';
    process.env.INSTAGRAM_APP_SECRET = 'test_ig_app_secret';

    const res = await app.inject({
      method: 'GET',
      url: `/v1/connect/instagram?workspaceId=${validWsId}`,
      headers: authHeaders(),
    });

    expect(res.statusCode).toBe(302);
    const location = res.headers.location;
    expect(location).toBeDefined();
    expect(location).toContain('https://www.facebook.com/v21.0/dialog/oauth');
    expect(location).toContain('client_id=');
    expect(location).toContain('state=');
  });

  it('GET /v1/connect/threads redirects to Threads OAuth authorization URL', async () => {
    mockWorkspaceMember();
    process.env.THREADS_APP_ID = 'test_th_app_id';
    process.env.THREADS_APP_SECRET = 'test_th_app_secret';

    const res = await app.inject({
      method: 'GET',
      url: `/v1/connect/threads?workspaceId=${validWsId}`,
      headers: authHeaders(),
    });

    expect(res.statusCode).toBe(302);
    const location = res.headers.location;
    expect(location).toBeDefined();
    expect(location).toContain('https://threads.net/oauth/authorize');
    expect(location).toContain('client_id=');
    expect(location).toContain('state=');
  });

  it('POST /v1/connect/facebook/deauthorize rejects a missing signed_request', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/connect/facebook/deauthorize',
    });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error.code).toBe('INVALID_SIGNED_REQUEST');
  });

  it('GET /v1/connect/youtube redirects to Google OAuth authorization URL', async () => {
    mockWorkspaceMember();
    process.env.YOUTUBE_CLIENT_ID = 'test_yt_client_id';
    process.env.YOUTUBE_CLIENT_SECRET = 'test_yt_client_secret';

    const res = await app.inject({
      method: 'GET',
      url: `/v1/connect/youtube?workspaceId=${validWsId}`,
      headers: authHeaders(),
    });

    expect(res.statusCode).toBe(302);
    const location = res.headers.location;
    expect(location).toBeDefined();
    expect(location).toContain('https://accounts.google.com/o/oauth2/v2/auth');
    expect(location).toContain('client_id=');
    expect(location).toContain('access_type=offline');
    expect(location).toContain('state=');
  });
});
