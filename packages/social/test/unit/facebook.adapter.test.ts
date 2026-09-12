import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FacebookAdapter } from '../../src/platforms/facebook/facebook.adapter.js';
import { FacebookOAuth } from '../../src/platforms/facebook/facebook.oauth.js';
import { MockFacebookAdapter } from '../../src/platforms/facebook/mock.adapter.js';

vi.mock('axios');
const mockedAxios = vi.mocked(axios, true);

describe('Facebook Adapter & OAuth Suite', () => {
  const appId = 'fb_test_app_id';
  const appSecret = 'fb_test_app_secret';
  let adapter: FacebookAdapter;
  let oauth: FacebookOAuth;
  const mockAdapter = new MockFacebookAdapter();

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new FacebookAdapter(appId, appSecret);
    oauth = new FacebookOAuth(appId, appSecret);
  });

  describe('Capabilities', () => {
    it('declares valid Facebook Page capabilities', () => {
      const caps = adapter.getCapabilities();
      expect(caps.supportsText).toBe(true);
      expect(caps.supportsImage).toBe(true);
      expect(caps.supportsVideo).toBe(true);
      expect(caps.supportsCarousel).toBe(true);
      expect(caps.supportsThreads).toBe(false);
      expect(caps.maxTextLength).toBe(63206);
    });
  });

  describe('OAuth Flow', () => {
    it('generates Facebook OAuth authorization URL with required Page scopes', async () => {
      const auth = await oauth.getAuthorizationUrl({
        workspaceId: 'ws-fb-123',
        redirectUri: 'http://localhost:4000/v1/connect/facebook/callback',
        state: 'jwt_state_fb',
        codeVerifier: 'unused',
      });

      expect(auth.authorizationUrl).toContain('https://www.facebook.com/v21.0/dialog/oauth');
      expect(auth.authorizationUrl).toContain('client_id=fb_test_app_id');
      expect(auth.authorizationUrl).toContain('pages_show_list');
      expect(auth.authorizationUrl).toContain('pages_manage_posts');
      expect(auth.authorizationUrl).toContain('pages_read_engagement');
    });

    it('exchanges code for tokens, fetches user pages, and extracts Page Access Token', async () => {
      // 1. Short-lived token
      mockedAxios.get.mockResolvedValueOnce({
        data: { access_token: 'fb_short_token_123', token_type: 'bearer', expires_in: 3600 },
      });

      // 2. Long-lived user token
      mockedAxios.get.mockResolvedValueOnce({
        data: { access_token: 'fb_long_user_token_60d', token_type: 'bearer', expires_in: 5184000 },
      });

      // 3. /me profile
      mockedAxios.get.mockResolvedValueOnce({
        data: { id: 'user_123456789', name: 'Amer Shaban' },
      });

      // 4. /me/accounts (User's Pages)
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          data: [
            {
              id: 'page_987654321',
              name: 'Scriora HQ',
              access_token: 'page_permanent_token_xyz',
              category: 'Software Company',
              tasks: ['MANAGE', 'CREATE_CONTENT'],
            },
          ],
        },
      });

      const tokens = await oauth.exchangeCodeForTokens({
        code: 'fb_auth_code_abc',
        codeVerifier: '',
        redirectUri: 'http://localhost:4000/v1/connect/facebook/callback',
      });

      // Verifies the primary Page Access Token is captured
      expect(tokens.accessToken).toBe('page_permanent_token_xyz');
      expect(tokens.externalAccountId).toBe('page_987654321');
      expect(tokens.accountName).toBe('Scriora HQ (Facebook Page)');
      expect(tokens.expiresIn).toBe(0); // Page tokens do not expire
      expect(tokens.rawPayload?.availablePages).toHaveLength(1);
    });

    it('refreshes user long-lived access token', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          access_token: 'fb_refreshed_token_789',
          token_type: 'bearer',
          expires_in: 5184000,
        },
      });

      const refreshed = await oauth.refreshAccessToken('current_refresh_token');
      expect(refreshed.accessToken).toBe('fb_refreshed_token_789');
    });
  });

  describe('Publishing', () => {
    it('publishes text and link post to Page feed', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: { id: 'page_987654321_post_101' } });
      mockedAxios.get.mockResolvedValueOnce({
        data: { permalink_url: 'https://www.facebook.com/scriora/posts/101' },
      });

      const res = await adapter.publish({
        workspaceId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
        accountId: 'page_987654321',
        text: 'Announcing our new multi-tenant architecture! 🚀',
        mediaUrls: [],
        idempotencyKey: 'idemp-fb-1',
        fingerprint: '1'.repeat(64),
        metadata: {
          accessToken: 'valid_page_token',
          link: 'https://scriora.io/blog/architecture',
        },
      });

      expect(res.status).toBe('SUCCEEDED');
      expect(res.externalPostId).toBe('page_987654321_post_101');
      expect(res.externalPostUrl).toBe('https://www.facebook.com/scriora/posts/101');
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://graph.facebook.com/v21.0/page_987654321/feed',
        null,
        expect.objectContaining({
          params: expect.objectContaining({
            message: 'Announcing our new multi-tenant architecture! 🚀',
            link: 'https://scriora.io/blog/architecture',
            access_token: 'valid_page_token',
          }),
        })
      );
    });

    it('publishes single photo post to Page', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { id: 'photo_555', post_id: 'page_987654321_photo_post_555' },
      });

      const res = await adapter.publish({
        workspaceId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
        accountId: 'page_987654321',
        text: 'Infographic launch banner',
        mediaUrls: ['https://cdn.scriora.io/banner.png'],
        idempotencyKey: 'idemp-fb-photo',
        fingerprint: '2'.repeat(64),
        metadata: {
          accessToken: 'valid_page_token',
        },
      });

      expect(res.status).toBe('SUCCEEDED');
      expect(res.externalPostId).toBe('page_987654321_photo_post_555');
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://graph.facebook.com/v21.0/page_987654321/photos',
        null,
        expect.objectContaining({
          params: expect.objectContaining({
            url: 'https://cdn.scriora.io/banner.png',
            message: 'Infographic launch banner',
            access_token: 'valid_page_token',
          }),
        })
      );
    });

    it('publishes multi-photo album with attached_media', async () => {
      // 2 photos uploaded unshared
      mockedAxios.post.mockResolvedValueOnce({ data: { id: 'fbid_photo_1' } });
      mockedAxios.post.mockResolvedValueOnce({ data: { id: 'fbid_photo_2' } });

      // Feed post published with attached_media
      mockedAxios.post.mockResolvedValueOnce({ data: { id: 'page_987654321_album_post_777' } });

      const res = await adapter.publish({
        workspaceId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
        accountId: 'page_987654321',
        text: 'Event highlights album 📸',
        mediaUrls: ['https://cdn.scriora.io/pic1.jpg', 'https://cdn.scriora.io/pic2.jpg'],
        idempotencyKey: 'idemp-fb-album',
        fingerprint: '3'.repeat(64),
        metadata: {
          accessToken: 'valid_page_token',
        },
      });

      expect(res.status).toBe('SUCCEEDED');
      expect(res.externalPostId).toBe('page_987654321_album_post_777');
      // Verify feed post received attached_media
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://graph.facebook.com/v21.0/page_987654321/feed',
        null,
        expect.objectContaining({
          params: expect.objectContaining({
            attached_media: JSON.stringify([
              { media_fbid: 'fbid_photo_1' },
              { media_fbid: 'fbid_photo_2' },
            ]),
          }),
        })
      );
    });

    it('publishes native video to Page', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: { id: 'video_post_999' } });

      const res = await adapter.publish({
        workspaceId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
        accountId: 'page_987654321',
        text: 'Watch our product demo video 🎥',
        mediaUrls: ['https://cdn.scriora.io/demo.mp4'],
        idempotencyKey: 'idemp-fb-vid',
        fingerprint: '4'.repeat(64),
        metadata: {
          accessToken: 'valid_page_token',
          mediaType: 'VIDEO',
        },
      });

      expect(res.status).toBe('SUCCEEDED');
      expect(res.externalPostId).toBe('video_post_999');
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://graph.facebook.com/v21.0/page_987654321/videos',
        null,
        expect.objectContaining({
          params: expect.objectContaining({
            file_url: 'https://cdn.scriora.io/demo.mp4',
            description: 'Watch our product demo video 🎥',
            access_token: 'valid_page_token',
          }),
        })
      );
    });

    it('publishes native video with custom thumbnail URL (PostPeer pattern)', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: { id: 'video_post_thumb_123' } });
      mockedAxios.post.mockResolvedValueOnce({ data: { success: true } }); // thumbnail post

      const res = await adapter.publish({
        workspaceId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
        accountId: 'page_987654321',
        text: 'Video with custom cover',
        mediaUrls: ['https://cdn.scriora.io/explainer.mp4'],
        idempotencyKey: 'idemp-fb-vid-thumb',
        fingerprint: '6'.repeat(64),
        metadata: {
          accessToken: 'valid_page_token',
          mediaType: 'VIDEO',
          videoThumbnailUrl: 'https://cdn.scriora.io/cover.jpg',
        },
      });

      expect(res.status).toBe('SUCCEEDED');
      expect(res.platformMetadata?.videoThumbnailUrl).toBe('https://cdn.scriora.io/cover.jpg');
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://graph.facebook.com/v21.0/video_post_thumb_123/thumbnails',
        null,
        expect.objectContaining({
          params: expect.objectContaining({
            image_url: 'https://cdn.scriora.io/cover.jpg',
            is_preferred: true,
            access_token: 'valid_page_token',
          }),
        })
      );
    });

    it('publishes unpublished draft post when published is false', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: { id: 'draft_feed_post_456' } });

      const res = await adapter.publish({
        workspaceId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
        accountId: 'page_987654321',
        text: 'Draft post pending approval',
        mediaUrls: [],
        idempotencyKey: 'idemp-fb-draft',
        fingerprint: '7'.repeat(64),
        metadata: {
          accessToken: 'valid_page_token',
          published: false,
        },
      });

      expect(res.status).toBe('SUCCEEDED');
      expect(res.platformMetadata?.published).toBe(false);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://graph.facebook.com/v21.0/page_987654321/feed',
        null,
        expect.objectContaining({
          params: expect.objectContaining({
            published: false,
            access_token: 'valid_page_token',
          }),
        })
      );
    });

    it('binds pageId to the connected account and rejects a client override', async () => {
      await expect(
        adapter.publish({
          workspaceId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
          accountId: 'page_987654321',
          text: 'Should not publish to a foreign page',
          mediaUrls: [],
          idempotencyKey: 'idemp-fb-page-mismatch',
          fingerprint: 'c'.repeat(64),
          metadata: {
            accessToken: 'valid_page_token',
            pageId: 'page_attacker_owned',
          },
        })
      ).rejects.toMatchObject({
        code: 'PAGE_ID_MISMATCH',
        category: 'AUTHORIZATION',
        retryable: false,
      });
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('accepts pageId when it matches the connected account', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: { id: 'page_987654321_post_bound' } });

      const res = await adapter.publish({
        workspaceId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
        accountId: 'page_987654321',
        text: 'Bound to stored page',
        mediaUrls: [],
        idempotencyKey: 'idemp-fb-page-match',
        fingerprint: 'd'.repeat(64),
        metadata: {
          accessToken: 'valid_page_token',
          pageId: 'page_987654321',
        },
      });

      expect(res.status).toBe('SUCCEEDED');
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://graph.facebook.com/v21.0/page_987654321/feed',
        null,
        expect.any(Object)
      );
    });

    it('detects Facebook security checkpoint (Error 190 Subcode 459)', async () => {
      mockedAxios.post.mockRejectedValueOnce({
        response: {
          status: 400,
          data: {
            error: {
              message: 'Error validating access token: User checkpoint required.',
              type: 'OAuthException',
              code: 190,
              error_subcode: 459,
            },
          },
        },
      });

      await expect(
        adapter.publish({
          workspaceId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
          accountId: 'page_987654321',
          text: 'Testing security checkpoint',
          mediaUrls: [],
          idempotencyKey: 'idemp-fb-chk',
          fingerprint: '8'.repeat(64),
          metadata: { accessToken: 'checkpoint_token' },
        })
      ).rejects.toMatchObject({
        code: 'FACEBOOK_SECURITY_CHECKPOINT',
        category: 'AUTHENTICATION',
        platformCode: '190:459',
        retryable: false,
      });
    });

    it('detects standard expired token (Error 190)', async () => {
      mockedAxios.post.mockRejectedValueOnce({
        response: {
          status: 400,
          data: {
            error: {
              message: 'Session has expired.',
              type: 'OAuthException',
              code: 190,
              error_subcode: 463,
            },
          },
        },
      });

      await expect(
        adapter.publish({
          workspaceId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
          accountId: 'page_987654321',
          text: 'Testing expired token',
          mediaUrls: [],
          idempotencyKey: 'idemp-fb-exp',
          fingerprint: '9'.repeat(64),
          metadata: { accessToken: 'expired_token' },
        })
      ).rejects.toMatchObject({
        code: 'FACEBOOK_AUTH_EXPIRED',
        category: 'AUTHENTICATION',
        platformCode: '190:463',
        retryable: false,
      });
    });
  });

  describe('Verification & Metrics', () => {
    it('verifies existing Facebook post', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: { id: 'page_123_456' } });
      const verified = await adapter.verify('page_123_456');
      expect(verified).toBe(true);
    });

    it('extracts Facebook engagement metrics', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          likes: { summary: { total_count: 520 } },
          comments: { summary: { total_count: 84 } },
          shares: { count: 35 },
        },
      });

      const metrics = await adapter.getMetrics('page_123_456', 'valid_page_token');
      expect(metrics.likes).toBe(520);
      expect(metrics.comments).toBe(84);
      expect(metrics.shares).toBe(35);
    });
  });

  describe('Mock Adapter', () => {
    it('simulates Facebook post successfully', async () => {
      const res = await mockAdapter.publish({
        workspaceId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
        accountId: 'mock_fb_page',
        text: 'Simulated Facebook post',
        mediaUrls: [],
        idempotencyKey: 'mock-fb-1',
        fingerprint: '5'.repeat(64),
        metadata: {},
      });

      expect(res.status).toBe('SUCCEEDED');
      expect(res.externalPostId).toContain('109876543210987');
      expect(res.externalPostUrl).toContain('https://www.facebook.com/');
    });
  });
});
