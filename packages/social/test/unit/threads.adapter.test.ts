import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MockThreadsAdapter } from '../../src/platforms/threads/mock.adapter.js';
import { ThreadsAdapter } from '../../src/platforms/threads/threads.adapter.js';
import { ThreadsOAuth } from '../../src/platforms/threads/threads.oauth.js';

vi.mock('axios');
const mockedAxios = vi.mocked(axios, true);

describe('Threads Adapter & OAuth Suite', () => {
  const appId = 'threads_test_app_id';
  const appSecret = 'threads_test_app_secret';
  let adapter: ThreadsAdapter;
  let oauth: ThreadsOAuth;
  const mockAdapter = new MockThreadsAdapter();

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new ThreadsAdapter(appId, appSecret);
    oauth = new ThreadsOAuth(appId, appSecret);
  });

  describe('Capabilities', () => {
    it('declares valid Threads capabilities', () => {
      const caps = adapter.getCapabilities();
      expect(caps.supportsText).toBe(true);
      expect(caps.supportsImage).toBe(true);
      expect(caps.supportsVideo).toBe(true);
      expect(caps.supportsCarousel).toBe(true);
      expect(caps.supportsThreads).toBe(true);
      expect(caps.maxTextLength).toBe(500);
      expect(caps.supportsDirectMessages).toBe(false);
    });
  });

  describe('OAuth Flow', () => {
    it('generates Threads OAuth authorization URL with required scopes', async () => {
      const auth = await oauth.getAuthorizationUrl({
        workspaceId: 'ws-th-123',
        redirectUri: 'http://localhost:4000/v1/connect/threads/callback',
        state: 'jwt_state_threads',
        codeVerifier: 'verifier_unused',
      });

      expect(auth.authorizationUrl).toContain('https://threads.net/oauth/authorize');
      expect(auth.authorizationUrl).toContain('client_id=threads_test_app_id');
      expect(auth.authorizationUrl).toContain('threads_basic');
      expect(auth.authorizationUrl).toContain('threads_content_publish');
      expect(auth.authorizationUrl).toContain('threads_manage_insights');
    });

    it('exchanges code for short-lived, long-lived token, and fetches user profile', async () => {
      // 1. Short-lived token
      mockedAxios.post.mockResolvedValueOnce({
        data: { access_token: 'th_short_token_123', user_id: '2153805775492645' },
      });

      // 2. Long-lived token
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          access_token: 'th_long_token_60days',
          token_type: 'bearer',
          expires_in: 5184000,
        },
      });

      // 3. /me profile
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          id: '2153805775492645',
          username: 'scriora_dev',
          name: 'Scriora Developer',
        },
      });

      const tokens = await oauth.exchangeCodeForTokens({
        code: 'code_th_abc',
        codeVerifier: '',
        redirectUri: 'http://localhost:4000/v1/connect/threads/callback',
      });

      expect(tokens.accessToken).toBe('th_long_token_60days');
      expect(tokens.expiresIn).toBe(5184000);
      expect(tokens.externalAccountId).toBe('2153805775492645');
      expect(tokens.accountName).toContain('@scriora_dev');
    });

    it('refreshes long-lived access token', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          access_token: 'th_refreshed_token_xyz',
          token_type: 'bearer',
          expires_in: 5184000,
        },
      });

      const refreshed = await oauth.refreshAccessToken('current_token');
      expect(refreshed.accessToken).toBe('th_refreshed_token_xyz');
    });
  });

  describe('Publishing', () => {
    it('publishes text-only post to Threads', async () => {
      // 1. Create text container
      mockedAxios.post.mockResolvedValueOnce({ data: { id: 'container_text_1' } });

      // 2. Publish container
      mockedAxios.post.mockResolvedValueOnce({ data: { id: 'th_post_1001' } });

      const result = await adapter.publish({
        workspaceId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
        accountId: '2153805775492645',
        text: 'Hello Threads from Scriora! 🧵',
        mediaUrls: [],
        idempotencyKey: 'idemp-th-1',
        fingerprint: '1'.repeat(64),
        metadata: { accessToken: 'valid_threads_token' },
      });

      expect(result.status).toBe('SUCCEEDED');
      expect(result.externalPostId).toBe('th_post_1001');
      expect(result.externalPostUrl).toBe('https://www.threads.net/t/th_post_1001');
    });

    it('publishes single image post', async () => {
      // 1. Create image container
      mockedAxios.post.mockResolvedValueOnce({ data: { id: 'container_image_2' } });

      // 2. Poll readiness
      mockedAxios.get.mockResolvedValueOnce({ data: { status: 'FINISHED' } });

      // 3. Publish container
      mockedAxios.post.mockResolvedValueOnce({ data: { id: 'th_post_1002' } });

      const result = await adapter.publish({
        workspaceId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
        accountId: '2153805775492645',
        text: 'Photo update on Threads',
        mediaUrls: ['https://cdn.scriora.com/photo.png'],
        idempotencyKey: 'idemp-th-2',
        fingerprint: '2'.repeat(64),
        metadata: { accessToken: 'valid_threads_token' },
      });

      expect(result.status).toBe('SUCCEEDED');
      expect(result.externalPostId).toBe('th_post_1002');
    });

    it('publishes Carousel with multiple child items', async () => {
      // 2 child containers
      mockedAxios.post.mockResolvedValueOnce({ data: { id: 'th_child_1' } });
      mockedAxios.post.mockResolvedValueOnce({ data: { id: 'th_child_2' } });

      // Poll child containers
      mockedAxios.get.mockResolvedValueOnce({ data: { status: 'FINISHED' } });
      mockedAxios.get.mockResolvedValueOnce({ data: { status: 'FINISHED' } });

      // Parent container
      mockedAxios.post.mockResolvedValueOnce({ data: { id: 'th_parent_carousel' } });

      // Poll parent container
      mockedAxios.get.mockResolvedValueOnce({ data: { status: 'FINISHED' } });

      // Publish parent
      mockedAxios.post.mockResolvedValueOnce({ data: { id: 'th_carousel_999' } });

      const result = await adapter.publish({
        workspaceId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
        accountId: '2153805775492645',
        text: 'Threads carousel album 📸',
        mediaUrls: ['https://cdn.scriora.com/pic1.jpg', 'https://cdn.scriora.com/pic2.jpg'],
        idempotencyKey: 'idemp-th-carousel',
        fingerprint: '3'.repeat(64),
        metadata: { accessToken: 'valid_threads_token' },
      });

      expect(result.status).toBe('SUCCEEDED');
      expect(result.externalPostId).toBe('th_carousel_999');
    });

    it('rejects post exceeding 500 characters', async () => {
      const longText = 'x'.repeat(501);

      await expect(
        adapter.publish({
          workspaceId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
          accountId: '2153805775492645',
          text: longText,
          mediaUrls: [],
          idempotencyKey: 'idemp-th-overflow',
          fingerprint: '4'.repeat(64),
          metadata: { accessToken: 'valid_threads_token' },
        })
      ).rejects.toThrow('Threads maximum text length is 500 characters');
    });

    it('publishes with topicTag and chains sequential thread replies (Postiz-style)', async () => {
      // 1. Root container
      mockedAxios.post.mockResolvedValueOnce({ data: { id: 'container_root' } });
      // 2. Root publish
      mockedAxios.post.mockResolvedValueOnce({ data: { id: 'post_root_100' } });
      // 3. Root permalink
      mockedAxios.get.mockResolvedValueOnce({
        data: { permalink: 'https://www.threads.net/@user/post/root100' },
      });

      // 4. Chained reply 1 container
      mockedAxios.post.mockResolvedValueOnce({ data: { id: 'container_reply_1' } });
      // 5. Chained reply 1 publish
      mockedAxios.post.mockResolvedValueOnce({ data: { id: 'post_reply_101' } });
      // 6. Chained reply 1 permalink
      mockedAxios.get.mockResolvedValueOnce({
        data: { permalink: 'https://www.threads.net/@user/post/reply101' },
      });

      const res = await adapter.publish({
        workspaceId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
        accountId: '2153805775492645',
        text: 'Part 1: The architecture breakdown of our engine.',
        mediaUrls: [],
        idempotencyKey: 'idemp-th-chain',
        fingerprint: '6'.repeat(64),
        metadata: {
          accessToken: 'valid_threads_token',
          topicTag: 'engineering',
          threadItems: [
            {
              content: 'Part 2: We optimized background outbox sweeps with PostgreSQL row locks.',
            },
          ],
        },
      });

      expect(res.status).toBe('SUCCEEDED');
      expect(res.externalPostId).toBe('post_root_100');
      expect(res.externalPostUrl).toBe('https://www.threads.net/@user/post/root100');
      expect(res.platformMetadata?.topicTag).toBe('engineering');
      expect(res.platformMetadata?.chainedPostIds).toEqual(['post_reply_101']);
      expect(res.platformMetadata?.chainedPermalinks).toEqual([
        'https://www.threads.net/@user/post/reply101',
      ]);
      expect(res.platformMetadata?.totalThreadItems).toBe(2);
    });

    it('passes reply_control to container when replyControl is configured', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: { id: 'container_reply_ctl' } });
      mockedAxios.post.mockResolvedValueOnce({ data: { id: 'th_post_ctl' } });

      const res = await adapter.publish({
        workspaceId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
        accountId: '2153805775492645',
        text: 'Private discussion for followers only',
        mediaUrls: [],
        idempotencyKey: 'idemp-th-ctl',
        fingerprint: '7'.repeat(64),
        metadata: {
          accessToken: 'valid_threads_token',
          replyControl: 'accounts_you_follow',
        },
      });

      expect(res.status).toBe('SUCCEEDED');
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://graph.threads.net/v1.0/2153805775492645/threads',
        null,
        expect.objectContaining({
          params: expect.objectContaining({
            reply_control: 'accounts_you_follow',
          }),
        })
      );
      expect(res.platformMetadata?.replyControl).toBe('accounts_you_follow');
    });

    it('passes alt_text to single image container and carousel child containers', async () => {
      // Carousel with 2 images and altText array
      mockedAxios.post.mockResolvedValueOnce({ data: { id: 'th_child_alt_1' } });
      mockedAxios.post.mockResolvedValueOnce({ data: { id: 'th_child_alt_2' } });
      mockedAxios.get.mockResolvedValueOnce({ data: { status: 'FINISHED' } });
      mockedAxios.get.mockResolvedValueOnce({ data: { status: 'FINISHED' } });
      mockedAxios.post.mockResolvedValueOnce({ data: { id: 'th_parent_alt' } });
      mockedAxios.get.mockResolvedValueOnce({ data: { status: 'FINISHED' } });
      mockedAxios.post.mockResolvedValueOnce({ data: { id: 'th_post_alt_pub' } });

      const res = await adapter.publish({
        workspaceId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
        accountId: '2153805775492645',
        text: 'Accessible carousel images',
        mediaUrls: ['https://cdn.scriora.com/chart1.png', 'https://cdn.scriora.com/chart2.png'],
        idempotencyKey: 'idemp-th-alt',
        fingerprint: '8'.repeat(64),
        metadata: {
          accessToken: 'valid_threads_token',
          replyControl: 'mentioned_only',
          altText: ['Monthly active users chart showing 30% growth', 'Retention cohort table'],
        },
      });

      expect(res.status).toBe('SUCCEEDED');
      // Verify child 1 had alt_text
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://graph.threads.net/v1.0/2153805775492645/threads',
        null,
        expect.objectContaining({
          params: expect.objectContaining({
            alt_text: 'Monthly active users chart showing 30% growth',
          }),
        })
      );
      // Verify child 2 had alt_text
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://graph.threads.net/v1.0/2153805775492645/threads',
        null,
        expect.objectContaining({
          params: expect.objectContaining({
            alt_text: 'Retention cohort table',
          }),
        })
      );
      // Verify parent container had reply_control
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://graph.threads.net/v1.0/2153805775492645/threads',
        null,
        expect.objectContaining({
          params: expect.objectContaining({
            media_type: 'CAROUSEL',
            reply_control: 'mentioned_only',
          }),
        })
      );
    });

    it('rejects post mixing image and video files (Threads limitation)', async () => {
      await expect(
        adapter.publish({
          workspaceId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
          accountId: '2153805775492645',
          text: 'Check this out',
          mediaUrls: ['https://cdn.scriora.com/photo.png', 'https://cdn.scriora.com/clip.mp4'],
          idempotencyKey: 'idemp-th-mix',
          fingerprint: '9'.repeat(64),
          metadata: { accessToken: 'valid_threads_token' },
        })
      ).rejects.toThrow('Threads does not permit mixing videos and images');
    });

    it('rejects carousel with more than 1 video', async () => {
      await expect(
        adapter.publish({
          workspaceId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
          accountId: '2153805775492645',
          text: 'Two video clips',
          mediaUrls: ['https://cdn.scriora.com/video1.mp4', 'https://cdn.scriora.com/video2.mp4'],
          idempotencyKey: 'idemp-th-2vid',
          fingerprint: 'a'.repeat(64),
          metadata: { accessToken: 'valid_threads_token' },
        })
      ).rejects.toThrow('Threads allows a maximum of 1 video per post');
    });
  });

  describe('Verification & Metrics', () => {
    it('verifies existing thread post id', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: { id: '2153805775492645', text: 'Hello' } });
      const verified = await adapter.verify('2153805775492645');
      expect(verified).toBe(true);
    });

    it('extracts Threads insights metrics', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          data: [
            { name: 'views', values: [{ value: 4500 }] },
            { name: 'likes', values: [{ value: 310 }] },
            { name: 'replies', values: [{ value: 24 }] },
            { name: 'reposts', values: [{ value: 18 }] },
            { name: 'quotes', values: [{ value: 7 }] },
          ],
        },
      });

      const metrics = await adapter.getMetrics('th_post_1001', 'valid_token');
      expect(metrics.views).toBe(4500);
      expect(metrics.likes).toBe(310);
      expect(metrics.replies).toBe(24);
      expect(metrics.reposts).toBe(18);
      expect(metrics.quotes).toBe(7);
    });
  });

  describe('Mock Adapter', () => {
    it('returns valid simulated thread post', async () => {
      const res = await mockAdapter.publish({
        workspaceId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
        accountId: 'mock_user',
        text: 'Simulated thread',
        mediaUrls: [],
        idempotencyKey: 'mock-th-1',
        fingerprint: '5'.repeat(64),
        metadata: {},
      });

      expect(res.status).toBe('SUCCEEDED');
      expect(res.externalPostId).toMatch(/^th_/);
      expect(res.externalPostUrl).toContain('https://www.threads.net/t/');
    });
  });
});
