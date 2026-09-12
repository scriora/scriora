import { beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';

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
  const validWsId = '11111111-1111-4111-8111-111111111111';

  it('GET /v1/connect/linkedin redirects to LinkedIn OAuth authorization URL', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/connect/linkedin?workspaceId=${validWsId}`,
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
    const res = await app.inject({
      method: 'GET',
      url: `/v1/connect/x?workspaceId=${validWsId}`,
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
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('MISSING_WORKSPACE_ID');
    expect(json.error.message).toContain('workspaceId');
  });

  it('GET /v1/connect/unsupported_network returns 400 UNSUPPORTED_PLATFORM', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/connect/unsupported_network?workspaceId=${validWsId}`,
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('UNSUPPORTED_PLATFORM');
  });

  it('POST /v1/connect/discord returns 400 INVALID_PAYLOAD on malformed payload', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/connect/discord?workspaceId=${validWsId}`,
      payload: { mode: 'INVALID_MODE' },
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('INVALID_PAYLOAD');
  });

  it('POST /v1/connect/discord returns 400 MISSING_WORKSPACE if no workspace provided', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/connect/discord',
      payload: {
        mode: 'BOT',
        botToken: 'abcdef12345678901234567890',
        channelId: '123456789012345678',
      },
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('MISSING_WORKSPACE');
  });

  it('GET /v1/connect/discord/channels returns 400 MISSING_BOT_TOKEN when token not provided', async () => {
    const savedToken = process.env.DISCORD_BOT_TOKEN;
    delete process.env.DISCORD_BOT_TOKEN;

    const res = await app.inject({
      method: 'GET',
      url: '/v1/connect/discord/channels',
    });

    if (savedToken) process.env.DISCORD_BOT_TOKEN = savedToken;

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('MISSING_BOT_TOKEN');
  });

  it('GET /v1/connect/instagram redirects to Meta OAuth authorization URL', async () => {
    process.env.INSTAGRAM_APP_ID = 'test_ig_app_id';
    process.env.INSTAGRAM_APP_SECRET = 'test_ig_app_secret';

    const res = await app.inject({
      method: 'GET',
      url: `/v1/connect/instagram?workspaceId=${validWsId}`,
    });

    expect(res.statusCode).toBe(302);
    const location = res.headers.location;
    expect(location).toBeDefined();
    expect(location).toContain('https://www.facebook.com/v21.0/dialog/oauth');
    expect(location).toContain('client_id=');
    expect(location).toContain('state=');
  });

  it('GET /v1/connect/threads redirects to Threads OAuth authorization URL', async () => {
    process.env.THREADS_APP_ID = 'test_th_app_id';
    process.env.THREADS_APP_SECRET = 'test_th_app_secret';

    const res = await app.inject({
      method: 'GET',
      url: `/v1/connect/threads?workspaceId=${validWsId}`,
    });

    expect(res.statusCode).toBe(302);
    const location = res.headers.location;
    expect(location).toBeDefined();
    expect(location).toContain('https://threads.net/oauth/authorize');
    expect(location).toContain('client_id=');
    expect(location).toContain('state=');
  });

  it('GET /v1/connect/youtube redirects to Google OAuth authorization URL', async () => {
    process.env.YOUTUBE_CLIENT_ID = 'test_yt_client_id';
    process.env.YOUTUBE_CLIENT_SECRET = 'test_yt_client_secret';

    const res = await app.inject({
      method: 'GET',
      url: `/v1/connect/youtube?workspaceId=${validWsId}`,
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
