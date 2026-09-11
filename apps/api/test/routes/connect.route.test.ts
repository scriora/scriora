import { beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';

describe('API Routes — Connect & OAuth (LinkedIn & X)', () => {
  beforeAll(() => {
    process.env.LINKEDIN_CLIENT_ID = 'test_li_client_id';
    process.env.LINKEDIN_CLIENT_SECRET = 'test_li_client_secret';
    process.env.X_CLIENT_ID = 'test_x_client_id';
    process.env.X_CLIENT_SECRET = 'test_x_client_secret';
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
    expect(location).toContain('code_challenge_method=S256');
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
});
