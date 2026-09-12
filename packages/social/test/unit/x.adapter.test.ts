import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlatformError } from '../../src/errors/social.error.js';
import { MockXAdapter } from '../../src/platforms/x/mock.adapter.js';
import { XAdapter } from '../../src/platforms/x/x.adapter.js';
import { XOAuth } from '../../src/platforms/x/x.oauth.js';

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
      expect(caps.supportsDirectMessages).toBe(true);
    });
  });

  describe('OAuth 2.0 PKCE Flow', () => {
    it('generates high-entropy codeVerifier and codeChallenge', () => {
      const pkce = XOAuth.generatePKCE();
      expect(pkce.codeVerifier).toBeDefined();
      expect(pkce.codeChallenge).toBeDefined();
      expect(pkce.codeVerifier.length).toBeGreaterThanOrEqual(43);
    });

    it('builds canonical Twitter authorization URL with S256 and tweet/DM scopes', () => {
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
      expect(auth.authorizationUrl).toContain('dm.read');
      expect(auth.authorizationUrl).toContain('dm.write');
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

    it('splits a 10,000-character punctuation-free token into bounded chunks', () => {
      const longToken = 'a'.repeat(10_000);

      const threads = XAdapter.splitIntoThread(longToken, 200);
      const bodies = threads.map((thread) => thread.replace(/\n\n\(\d+\/\d+\)$/, ''));

      expect(threads.length).toBeGreaterThan(1);
      expect(bodies.every((body) => body.length <= 200)).toBe(true);
      expect(bodies.join('')).toBe(longToken);
    });

    it('preserves sentence order and punctuation while creating a thread', () => {
      const text = [
        'Alpha sentence ends here.',
        'Beta sentence asks why?',
        'Gamma sentence is excited!',
        'Delta sentence carries the remaining details without losing its order.',
        'Epsilon sentence adds enough deterministic content to exceed one normal post.',
        'Zeta sentence closes the sequence and must remain in exactly this position.',
      ].join(' ');

      const threads = XAdapter.splitIntoThread(text, 55);
      const reconstructed = threads
        .map((thread) => thread.replace(/\n\n\(\d+\/\d+\)$/, ''))
        .join(' ');

      expect(threads.length).toBeGreaterThan(1);
      expect(reconstructed).toBe(text);
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

    it('attaches media_ids, reply_settings, and replyToId to X API request', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { data: { id: 'tweet_media_103' } },
      });

      await adapter.publish({
        workspaceId: 'ws-123',
        accountId: 'x_acc_1',
        text: 'Tweet with media and restricted replies! 📸',
        mediaUrls: [],
        idempotencyKey: 'idemp-x-media',
        fingerprint: 'fp-x-media',
        metadata: {
          accessToken: 'valid_x_token',
          mediaIds: ['media_uploaded_001', 'media_uploaded_002'],
          replySettings: 'mentionedUsers',
          replyToId: 'tweet_parent_000',
        },
      });

      const calledPayload = mockedAxios.post.mock.calls[0][1] as any;
      expect(calledPayload.media).toEqual({
        media_ids: ['media_uploaded_001', 'media_uploaded_002'],
      });
      expect(calledPayload.reply_settings).toBe('mentionedUsers');
      expect(calledPayload.reply).toEqual({
        in_reply_to_tweet_id: 'tweet_parent_000',
      });
    });

    it('attaches poll options and duration to root tweet', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { data: { id: 'tweet_poll_104' } },
      });

      const pollConfig = {
        options: ['TypeScript', 'Rust', 'Go'],
        duration_minutes: 1440,
      };

      await adapter.publish({
        workspaceId: 'ws-123',
        accountId: 'x_acc_1',
        text: 'Which language is best for autonomous agent infrastructure? 🗳️',
        mediaUrls: [],
        idempotencyKey: 'idemp-x-poll',
        fingerprint: 'fp-x-poll',
        metadata: {
          accessToken: 'valid_x_token',
          poll: pollConfig,
        },
      });

      const calledPayload = mockedAxios.post.mock.calls[0][1] as any;
      expect(calledPayload.poll).toEqual(pollConfig);
    });

    it('preserves Arabic text, emojis, and hashtags in tweet body', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { data: { id: 'tweet_ar_105' } },
      });

      const arabicTweet =
        'سكريورا نظام تشغيل النمو الاجتماعي بالذكاء الاصطناعي ⚡\n\n#ريادة_الأعمال #برمجة #بناء_في_العلن';

      await adapter.publish({
        workspaceId: 'ws-123',
        accountId: 'x_acc_1',
        text: arabicTweet,
        mediaUrls: [],
        idempotencyKey: 'idemp-x-ar',
        fingerprint: 'fp-x-ar',
        metadata: { accessToken: 'valid_x_token' },
      });

      const calledPayload = mockedAxios.post.mock.calls[0][1] as any;
      expect(calledPayload.text).toBe(arabicTweet);
    });

    it('extracts links to first reply when linkInFirstReply is enabled', async () => {
      mockedAxios.post
        .mockResolvedValueOnce({ data: { data: { id: 'tweet_main_001' } } })
        .mockResolvedValueOnce({ data: { data: { id: 'tweet_reply_002' } } });

      const textWithLink =
        'Check out our breakthrough SaaS operating system! https://scriora.io/demo #AI';

      const result = await adapter.publish({
        workspaceId: 'ws-123',
        accountId: 'x_acc_1',
        text: textWithLink,
        mediaUrls: [],
        idempotencyKey: 'idemp-x-link',
        fingerprint: 'fp-x-link',
        metadata: {
          accessToken: 'valid_x_token',
          linkInFirstReply: true,
        },
      });

      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
      const rootCall = mockedAxios.post.mock.calls[0][1] as any;
      expect(rootCall.text).toBe('Check out our breakthrough SaaS operating system! #AI');

      const replyCall = mockedAxios.post.mock.calls[1][1] as any;
      expect(replyCall.text).toBe('🔗 https://scriora.io/demo');
      expect(replyCall.reply).toEqual({ in_reply_to_tweet_id: 'tweet_main_001' });
      expect(result.status).toBe('SUCCEEDED');
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

  describe('Advanced Features: Long Posts, ThreadItems, Polls, Communities, Media & Metrics', () => {
    it('publishes single long post without thread splitting when longPost is true', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { data: { id: 'tweet_long_999' } },
      });

      const longArticle = 'A'.repeat(800);
      const res = await adapter.publish({
        workspaceId: 'ws-123',
        accountId: 'x_acc_1',
        text: longArticle,
        mediaUrls: [],
        idempotencyKey: 'idemp-long-post',
        fingerprint: 'fp-long-post',
        metadata: {
          accessToken: 'valid_token',
          longPost: true,
        },
      });

      expect(res.status).toBe('SUCCEEDED');
      expect(res.externalPostId).toBe('tweet_long_999');
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      const payload = mockedAxios.post.mock.calls[0][1] as any;
      expect(payload.text.length).toBe(800);
    });

    it('publishes explicit threadItems chaining each reply sequentially', async () => {
      mockedAxios.post
        .mockResolvedValueOnce({ data: { data: { id: 'thread_root_1' } } })
        .mockResolvedValueOnce({ data: { data: { id: 'thread_item_2' } } })
        .mockResolvedValueOnce({ data: { data: { id: 'thread_item_3' } } });

      const res = await adapter.publish({
        workspaceId: 'ws-123',
        accountId: 'x_acc_1',
        text: '1/ Root thread tweet announcement',
        mediaUrls: [],
        idempotencyKey: 'idemp-explicit-thread',
        fingerprint: 'fp-explicit-thread',
        metadata: {
          accessToken: 'valid_token',
          threadItems: [
            { content: '2/ Point two about features' },
            { content: '3/ Final conclusion and call to action' },
          ],
        },
      });

      expect(res.status).toBe('SUCCEEDED');
      expect(res.externalPostId).toBe('thread_root_1');
      expect(mockedAxios.post).toHaveBeenCalledTimes(3);

      const secondCall = mockedAxios.post.mock.calls[1][1] as any;
      expect(secondCall.reply.in_reply_to_tweet_id).toBe('thread_root_1');

      const thirdCall = mockedAxios.post.mock.calls[2][1] as any;
      expect(thirdCall.reply.in_reply_to_tweet_id).toBe('thread_item_2');
    });

    it('attaches quote_tweet_id, community_id, and native poll to root tweet', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { data: { id: 'tweet_rich_123' } },
      });

      const res = await adapter.publish({
        workspaceId: 'ws-123',
        accountId: 'x_acc_1',
        text: 'What feature should we launch next?',
        mediaUrls: [],
        idempotencyKey: 'idemp-poll-comm',
        fingerprint: 'fp-poll-comm',
        metadata: {
          accessToken: 'valid_token',
          quoteTweetId: '1899999999999999999',
          communityId: '1234567890',
          poll: {
            options: ['Analytics', 'Webhooks', 'Mobile App'],
            durationMinutes: 1440,
          },
        },
      });

      expect(res.status).toBe('SUCCEEDED');
      const payload = mockedAxios.post.mock.calls[0][1] as any;
      expect(payload.quote_tweet_id).toBe('1899999999999999999');
      expect(payload.community_id).toBe('1234567890');
      expect(payload.poll).toEqual({
        options: ['Analytics', 'Webhooks', 'Mobile App'],
        duration_minutes: 1440,
      });
    });

    it('uploads media via uploadMedia method to v1.1 upload endpoint', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { media_id_string: 'media_id_987654321' },
      });

      const mediaId = await adapter.uploadMedia('fake_base64_data', 'valid_token');
      expect(mediaId).toBe('media_id_987654321');
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://upload.twitter.com/1.1/media/upload.json',
        expect.stringContaining('media_data=fake_base64_data'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer valid_token',
          }),
        })
      );
    });

    it('fetches tweet analytics metrics via getMetrics', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          data: {
            public_metrics: {
              like_count: 42,
              retweet_count: 10,
              reply_count: 5,
              quote_count: 2,
              bookmark_count: 8,
            },
            non_public_metrics: {
              impression_count: 1500,
            },
          },
        },
      });

      const metrics = await adapter.getMetrics('tweet_123', 'token_123');
      expect(metrics.impressions).toBe(1500);
      expect(metrics.likes).toBe(42);
      expect(metrics.retweets).toBe(10);
      expect(metrics.replies).toBe(5);
      expect(metrics.quotes).toBe(2);
      expect(metrics.bookmarks).toBe(8);
    });

    it('deletes tweet via deletePost', async () => {
      mockedAxios.delete.mockResolvedValueOnce({
        data: { data: { deleted: true } },
      });

      const deleted = await adapter.deletePost('tweet_to_delete', 'token_123');
      expect(deleted).toBe(true);
      expect(mockedAxios.delete).toHaveBeenCalledWith(
        'https://api.twitter.com/2/tweets/tweet_to_delete',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer token_123',
          }),
        })
      );
    });
  });

  describe('Direct Messages (DMs)', () => {
    it('sends 1-on-1 direct message via POST /2/dm_conversations/with/:recipient_id/messages', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          data: {
            dm_event_id: 'dm_event_987654',
            dm_conversation_id: 'dm_conv_112233',
          },
        },
      });

      const result = await adapter.sendDirectMessage({
        recipientId: 'user_target_456',
        text: 'مرحباً! هذه رسالة خاصة تجريبية من Scriora 🚀',
        accessToken: 'valid_dm_token',
      });

      expect(result.messageId).toBe('dm_event_987654');
      expect(result.dmConversationId).toBe('dm_conv_112233');
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.twitter.com/2/dm_conversations/with/user_target_456/messages',
        {
          message: {
            text: 'مرحباً! هذه رسالة خاصة تجريبية من Scriora 🚀',
          },
        },
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer valid_dm_token',
          }),
        })
      );
    });

    it('lists direct message events via GET /2/dm_events', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          data: [
            {
              id: 'dm_1',
              text: 'أهلاً بك، كيف يمكنني الاشتراك؟',
              sender_id: 'user_sender_789',
              dm_conversation_id: 'dm_conv_112233',
              created_at: '2026-09-12T06:00:00.000Z',
            },
          ],
          meta: {
            next_token: 'page_token_next',
          },
        },
      });

      const result = await adapter.listDirectMessages({
        accessToken: 'valid_dm_token',
        maxResults: 10,
      });

      expect(result.events).toHaveLength(1);
      expect(result.events[0]?.id).toBe('dm_1');
      expect(result.events[0]?.text).toBe('أهلاً بك، كيف يمكنني الاشتراك؟');
      expect(result.events[0]?.senderId).toBe('user_sender_789');
      expect(result.nextToken).toBe('page_token_next');
      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('https://api.twitter.com/2/dm_events'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer valid_dm_token',
          }),
        })
      );
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
