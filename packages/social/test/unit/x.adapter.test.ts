import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MockXAdapter } from '../../src/platforms/x/mock.adapter.js';
import { XAdapter } from '../../src/platforms/x/x.adapter.js';
import { XOAuth } from '../../src/platforms/x/x.oauth.js';
import { PlatformError } from '../../src/errors/social.error.js';

vi.mock('axios');
const mockedAxios = vi.mocked(axios, true);

describe('X / Twitter Full Behavioral & Unit Test Suite', () => {
  const clientId = 'test_x_client_id';
  const clientSecret = 'test_x_client_secret';
  let adapter: XAdapter;
  let oauth: XOAuth;
  const mockAdapter = new MockXAdapter();

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new XAdapter(clientId, clientSecret);
    oauth = new XOAuth(clientId, clientSecret);
  });

  describe('Capabilities', () => {
    it('declares valid X capabilities', () => {
      const caps = adapter.getCapabilities();
      expect(caps.supportsText).toBe(true);
      expect(caps.supportsThreads).toBe(true);
      expect(caps.maxTextLength).toBe(280);
      expect(caps.supportsCarousel).toBe(false);
    });
  });

  describe('OAuth 2.0 PKCE Flow', () => {
    it('generates high-entropy codeVerifier and codeChallenge', () => {
      const pkce = XOAuth.generatePKCE();
      expect(pkce.codeVerifier).toBeDefined();
      expect(pkce.codeChallenge).toBeDefined();
      expect(pkce.codeVerifier.length).toBeGreaterThanOrEqual(43);
    });

    it('builds canonical Twitter authorization URL with S256 and tweet scopes', () => {
      const auth = oauth.getAuthorizationUrl({
        workspaceId: 'ws-x-123',
        redirectUri: 'http://localhost:4000/v1/connect/x/callback',
        state: 'jwt_state_x',
        codeVerifier: 'verifier_x_789',
      });

      expect(auth.authorizationUrl).toContain('https://twitter.com/i/oauth2/authorize');
      expect(auth.authorizationUrl).toContain('client_id=test_x_client_id');
      expect(auth.authorizationUrl).toContain('code_challenge_method=S256');
      expect(auth.authorizationUrl).toContain('tweet.write');
    });

    it('exchanges code for tokens and resolves @username via /2/users/me', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          access_token: 'x_access_token_123',
          expires_in: 7200,
          refresh_token: 'x_refresh_token_456',
        },
      });

      mockedAxios.get.mockResolvedValueOnce({
        data: {
          data: {
            id: 'x_user_999',
            name: 'Scriora Bot',
            username: 'scriora_app',
          },
        },
      });

      const tokens = await oauth.exchangeCodeForTokens({
        code: 'auth_code_x',
        codeVerifier: 'verifier_x',
        redirectUri: 'http://localhost:4000/callback',
      });

      expect(tokens.accessToken).toBe('x_access_token_123');
      expect(tokens.refreshToken).toBe('x_refresh_token_456');
      expect(tokens.externalAccountId).toBe('x_user_999');
      expect(tokens.accountName).toBe('@scriora_app');
    });
  });

  describe('Thread Splitting Engine', () => {
    it('does not split text <= 280 characters', () => {
      const shortText = 'This is a short post under 280 characters for X.';
      const threads = XAdapter.splitIntoThread(shortText);
      expect(threads).toHaveLength(1);
      expect(threads[0]).toBe(shortText);
    });

    it('intelligently splits long text > 280 characters into sequential thread chunks with numbering', () => {
      const longText =
        'First paragraph with important insights about autonomous AI workflows and engineering discipline.\n\n' +
        'Second paragraph describing how our durable outbox architecture guarantees zero lost posts even during sudden API downtimes or network partitions.\n\n' +
        'Third paragraph breaking down the mathematics of causal analytics and retention growth loops across multiple social media platforms.\n\n' +
        'Fourth paragraph concluding our product announcement with links and call to action for engineering teams worldwide!';

      const threads = XAdapter.splitIntoThread(longText, 140);
      expect(threads.length).toBeGreaterThan(1);
      for (let i = 0; i < threads.length; i++) {
        expect(threads[i]).toContain(`(${i + 1}/${threads.length})`);
      }
    });
  });

  describe('Publishing Tweets and Threads', () => {
    it('throws MISSING_ACCESS_TOKEN if token is absent in request metadata', async () => {
      await expect(
        adapter.publish({
          workspaceId: 'ws-123',
          accountId: 'x_acc_1',
          text: 'Hello X!',
          mediaUrls: [],
          idempotencyKey: 'idemp-x-1',
          fingerprint: 'fp-x-1',
          metadata: {},
        })
      ).rejects.toThrow('Missing X access token');
    });

    it('publishes single tweet and returns tweet ID and URL', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          data: {
            id: '1832049281928472910',
            text: 'Hello from Scriora on X!',
          },
        },
      });

      const result = await adapter.publish({
        workspaceId: 'ws-123',
        accountId: 'x_acc_1',
        text: 'Hello from Scriora on X!',
        mediaUrls: [],
        idempotencyKey: 'idemp-x-2',
        fingerprint: 'fp-x-2',
        metadata: { accessToken: 'valid_x_token' },
      });

      expect(result.status).toBe('SUCCEEDED');
      expect(result.externalPostId).toBe('1832049281928472910');
      expect(result.externalPostUrl).toBe('https://x.com/i/status/1832049281928472910');
      expect(result.platformMetadata?.threadLength).toBe(1);
    });

    it('publishes multi-tweet thread chaining each reply to previous tweet ID', async () => {
      // Mock two sequential tweet creations
      mockedAxios.post
        .mockResolvedValueOnce({
          data: { data: { id: 'tweet_root_101' } },
        })
        .mockResolvedValueOnce({
          data: { data: { id: 'tweet_reply_102' } },
        });

      const longPost =
        'Part 1 of our long announcement that goes well beyond the 280 characters limit to test sequential thread posting across social channels with extensive details.\n\n' +
        'Part 2 of the announcement explaining how the thread chaining works seamlessly with in_reply_to_tweet_id in Twitter API v2, ensuring every single tweet is attached in reply order.';

      const result = await adapter.publish({
        workspaceId: 'ws-123',
        accountId: 'x_acc_1',
        text: longPost,
        mediaUrls: [],
        idempotencyKey: 'idemp-x-thread',
        fingerprint: 'fp-x-thread',
        metadata: { accessToken: 'valid_x_token' },
      });

      expect(result.status).toBe('SUCCEEDED');
      expect(result.externalPostId).toBe('tweet_root_101');
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);

      // Verify the 2nd call included in_reply_to_tweet_id
      const secondCallPayload = mockedAxios.post.mock.calls[1][1] as any;
      expect(secondCallPayload.reply).toEqual({
        in_reply_to_tweet_id: 'tweet_root_101',
      });
    });

    it('maps 429 Rate Limit from X API into retryable PlatformError', async () => {
      mockedAxios.post.mockRejectedValueOnce({
        response: {
          status: 429,
          data: { title: 'Too Many Requests', detail: 'Rate limit exceeded' },
        },
        message: 'Request failed with status code 429',
      });

      try {
        await adapter.publish({
          workspaceId: 'ws-123',
          accountId: 'x_acc_1',
          text: 'Rate limited tweet',
          mediaUrls: [],
          idempotencyKey: 'idemp-x-rate',
          fingerprint: 'fp-x-rate',
          metadata: { accessToken: 'valid_x_token' },
        });
        expect.unreachable();
      } catch (e: any) {
        expect(e).toBeInstanceOf(PlatformError);
        expect(e.code).toBe('RATE_LIMITED');
        expect(e.retryable).toBe(true);
      }
    });

    it('MockXAdapter publishes offline and returns valid externalPostId and URL', async () => {
      const res = await mockAdapter.publish({
        workspaceId: '11111111-1111-1111-1111-111111111111',
        accountId: 'x_acc_1',
        text: 'Hello from Scriora on X!',
        mediaUrls: [],
        idempotencyKey: 'x_idemp_123',
        fingerprint: 'b'.repeat(64),
        metadata: {},
      });

      expect(res.status).toBe('SUCCEEDED');
      expect(res.externalPostId).toMatch(/^\d+$/);
      expect(res.externalPostUrl).toContain('x.com/i/status/');
    });
  });

  describe('Post Verification', () => {
    it('verifies numeric tweet IDs', async () => {
      expect(await adapter.verify('1832049281928472910')).toBe(true);
      expect(await adapter.verify('not_numeric_id')).toBe(false);
      expect(await adapter.verify('')).toBe(false);
      expect(await mockAdapter.verify('1832049281928472910')).toBe(true);
    });
  });
});
