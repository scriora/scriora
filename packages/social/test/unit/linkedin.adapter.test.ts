import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LinkedInAdapter } from '../../src/platforms/linkedin/linkedin.adapter.js';
import { LinkedInOAuth } from '../../src/platforms/linkedin/linkedin.oauth.js';

vi.mock('axios');
const mockedAxios = vi.mocked(axios, true);

describe('LinkedIn Full Behavioral & Unit Test Suite', () => {
  const clientId = 'test_li_client_id';
  const clientSecret = 'test_li_client_secret';
  let adapter: LinkedInAdapter;
  let oauth: LinkedInOAuth;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new LinkedInAdapter(clientId, clientSecret);
    oauth = new LinkedInOAuth(clientId, clientSecret);
  });

  describe('Capabilities', () => {
    it('declares exact enterprise LinkedIn capabilities', () => {
      const caps = adapter.getCapabilities();
      expect(caps.supportsText).toBe(true);
      expect(caps.supportsImage).toBe(true);
      expect(caps.supportsVideo).toBe(true);
      expect(caps.supportsCarousel).toBe(true);
      expect(caps.supportsThreads).toBe(false);
      expect(caps.maxTextLength).toBe(3000);
    });
  });

  describe('OAuth 2.0 Flow', () => {
    it('generates valid high-entropy PKCE codeVerifier and codeChallenge', () => {
      const pkce = LinkedInOAuth.generatePKCE();
      expect(pkce.codeVerifier).toBeDefined();
      expect(pkce.codeVerifier.length).toBeGreaterThanOrEqual(43);
      expect(pkce.codeChallenge).toBeDefined();
    });

    it('builds canonical LinkedIn authorization URL with PKCE and scopes', () => {
      const auth = oauth.getAuthorizationUrl({
        workspaceId: 'ws-123',
        redirectUri: 'http://localhost:4000/v1/connect/linkedin/callback',
        state: 'jwt_state_token_123',
        codeVerifier: 'verifier_string_456',
      });

      expect(auth.authorizationUrl).toContain('https://www.linkedin.com/oauth/v2/authorization');
      expect(auth.authorizationUrl).toContain('client_id=test_li_client_id');
      expect(auth.authorizationUrl).toContain('response_type=code');
      expect(auth.authorizationUrl).toContain('code_challenge_method=S256');
      expect(auth.authorizationUrl).toContain('w_member_social');
    });

    it('throws descriptive error if clientId is missing', () => {
      const emptyOAuth = new LinkedInOAuth('', '');
      expect(() =>
        emptyOAuth.getAuthorizationUrl({
          workspaceId: 'ws-123',
          redirectUri: 'http://localhost:4000/callback',
          state: 'state',
          codeVerifier: 'verifier',
        })
      ).toThrow('LINKEDIN_CLIENT_ID is not configured');
    });

    it('exchanges authorization code for access and refresh tokens', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          access_token: 'li_access_token_abc',
          expires_in: 5184000,
          refresh_token: 'li_refresh_token_xyz',
          refresh_token_expires_in: 31536000,
        },
      });

      mockedAxios.get.mockResolvedValueOnce({
        data: {
          sub: 'urn:li:person:person_123',
          name: 'Amir Engineer',
        },
      });

      const tokens = await oauth.exchangeCodeForTokens({
        code: 'auth_code_789',
        codeVerifier: 'verifier_string_456',
        redirectUri: 'http://localhost:4000/callback',
      });

      expect(tokens.accessToken).toBe('li_access_token_abc');
      expect(tokens.refreshToken).toBe('li_refresh_token_xyz');
      expect(tokens.externalAccountId).toBe('urn:li:person:person_123');
      expect(tokens.accountName).toBe('Amir Engineer');
    });

    it('refreshes expired access token successfully', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          access_token: 'new_refreshed_access_token',
          expires_in: 5184000,
          refresh_token: 'new_refresh_token',
        },
      });

      const refreshed = await oauth.refreshAccessToken('old_refresh_token');
      expect(refreshed.accessToken).toBe('new_refreshed_access_token');
      expect(refreshed.expiresIn).toBe(5184000);
    });
  });

  describe('Publishing UGC Posts', () => {
    it('throws MISSING_ACCESS_TOKEN if metadata is empty', async () => {
      await expect(
        adapter.publish({
          workspaceId: 'ws-123',
          accountId: 'person_123',
          text: 'Hello LinkedIn!',
          mediaUrls: [],
          idempotencyKey: 'idemp-1',
          fingerprint: 'fp-1',
          metadata: {},
        })
      ).rejects.toThrow('Missing LinkedIn access token');
    });

    it('publishes text post and returns canonical URN and post URL', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        status: 201,
        data: {
          id: 'urn:li:share:1234567890',
        },
        headers: {
          'x-restli-id': 'urn:li:share:1234567890',
        },
      });

      const result = await adapter.publish({
        workspaceId: 'ws-123',
        accountId: 'person_123',
        text: 'Building Scriora with clean architecture!',
        mediaUrls: [],
        idempotencyKey: 'idemp-2',
        fingerprint: 'fp-2',
        metadata: {
          accessToken: 'valid_access_token',
          authorUrn: 'urn:li:person:person_123',
        },
      });

      expect(result.status).toBe('SUCCEEDED');
      expect(result.externalPostId).toBe('urn:li:share:1234567890');
      expect(result.externalPostUrl).toBe(
        'https://www.linkedin.com/feed/update/urn%3Ali%3Ashare%3A1234567890'
      );
      expect(result.operationId).toBe('idemp-2');
    });

    it('handles 429 Rate Limit error gracefully with retryAfterMs', async () => {
      const axiosError = new Error('Request failed with status code 429') as any;
      axiosError.isAxiosError = true;
      axiosError.response = {
        status: 429,
        data: { message: 'Throttle limit reached' },
        headers: { 'retry-after': '60' },
      };
      mockedAxios.isAxiosError.mockReturnValue(true);
      mockedAxios.post.mockRejectedValueOnce(axiosError);

      try {
        await adapter.publish({
          workspaceId: 'ws-123',
          accountId: 'person_123',
          text: 'Test rate limit',
          mediaUrls: [],
          idempotencyKey: 'idemp-3',
          fingerprint: 'fp-3',
          metadata: { accessToken: 'valid_access_token' },
        });
        expect.unreachable();
      } catch (e: any) {
        expect(e.code).toBe('RATE_LIMITED');
        expect(e.retryable).toBe(true);
        expect(e.retryAfterMs).toBe(60000);
      }
    });

    it('handles 401 Unauthorized token expired error', async () => {
      const axiosError = new Error('Unauthorized') as any;
      axiosError.isAxiosError = true;
      axiosError.response = {
        status: 401,
        data: { message: 'Token expired' },
        headers: {},
      };
      mockedAxios.isAxiosError.mockReturnValue(true);
      mockedAxios.post.mockRejectedValueOnce(axiosError);

      try {
        await adapter.publish({
          workspaceId: 'ws-123',
          accountId: 'person_123',
          text: 'Test 401',
          mediaUrls: [],
          idempotencyKey: 'idemp-4',
          fingerprint: 'fp-4',
          metadata: { accessToken: 'expired_token' },
        });
        expect.unreachable();
      } catch (e: any) {
        expect(e.code).toBe('TOKEN_EXPIRED');
        expect(e.retryable).toBe(false);
      }
    });
  });

  describe('Post Verification', () => {
    it('verifies valid LinkedIn URNs', async () => {
      expect(await adapter.verify('urn:li:share:12345')).toBe(true);
      expect(await adapter.verify('urn:li:ugcPost:67890')).toBe(true);
      expect(await adapter.verify('x_tweet_123')).toBe(false);
      expect(await adapter.verify('')).toBe(false);
    });
  });
});
