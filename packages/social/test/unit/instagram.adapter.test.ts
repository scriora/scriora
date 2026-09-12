import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlatformError } from '../../src/errors/social.error.js';
import { InstagramAdapter } from '../../src/platforms/instagram/instagram.adapter.js';
import { InstagramOAuth } from '../../src/platforms/instagram/instagram.oauth.js';
import { MockInstagramAdapter } from '../../src/platforms/instagram/mock.adapter.js';

vi.mock('axios');
const mockedAxios = vi.mocked(axios, true);

describe('Instagram Adapter & OAuth Suite', () => {
  const appId = 'meta_test_app_id';
  const appSecret = 'meta_test_app_secret';
  let adapter: InstagramAdapter;
  let oauth: InstagramOAuth;
  const mockAdapter = new MockInstagramAdapter();

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new InstagramAdapter(appId, appSecret);
    oauth = new InstagramOAuth(appId, appSecret);
  });

  describe('Capabilities', () => {
    it('declares valid Instagram capabilities', () => {
      const caps = adapter.getCapabilities();
      expect(caps.supportsText).toBe(true);
      expect(caps.supportsImage).toBe(true);
      expect(caps.supportsVideo).toBe(true);
      expect(caps.supportsCarousel).toBe(true);
      expect(caps.supportsThreads).toBe(false);
      expect(caps.supportsDirectMessages).toBe(true);
      expect(caps.maxTextLength).toBe(2200);
    });
  });

  describe('OAuth Flow', () => {
    it('generates Meta OAuth authorization URL with required scopes', async () => {
      const auth = await oauth.getAuthorizationUrl({
        workspaceId: 'ws-ig-123',
        redirectUri: 'http://localhost:4000/v1/connect/instagram/callback',
        state: 'state_ig_token',
        codeVerifier: 'verifier_not_needed_for_meta',
      });

      expect(auth.authorizationUrl).toContain('https://www.facebook.com/v21.0/dialog/oauth');
      expect(auth.authorizationUrl).toContain('client_id=meta_test_app_id');
      expect(auth.authorizationUrl).toContain('instagram_basic');
      expect(auth.authorizationUrl).toContain('instagram_content_publish');
      expect(auth.authorizationUrl).toContain('pages_show_list');
    });

    it('exchanges code for short-lived, then long-lived token and resolves IG business account', async () => {
      // 1. Short-lived token
      mockedAxios.get.mockResolvedValueOnce({
        data: { access_token: 'short_lived_token_123', expires_in: 3600 },
      });

      // 2. Long-lived token
      mockedAxios.get.mockResolvedValueOnce({
        data: { access_token: 'long_lived_token_60days', expires_in: 5184000 },
      });

      // 3. Facebook Pages with IG business account
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          data: [
            {
              id: 'page_123',
              name: 'My Business Page',
              access_token: 'page_access_token',
              instagram_business_account: {
                id: '17841400000000001',
                username: 'scriora_brand',
                name: 'Scriora Brand',
              },
            },
          ],
        },
      });

      const tokens = await oauth.exchangeCodeForTokens({
        code: 'auth_code_meta',
        codeVerifier: '',
        redirectUri: 'http://localhost:4000/v1/connect/instagram/callback',
      });

      expect(tokens.accessToken).toBe('page_access_token');
      expect(tokens.expiresIn).toBe(5184000);
      expect(tokens.externalAccountId).toBe('17841400000000001');
      expect(tokens.accountName).toBe('@scriora_brand');
    });

    it('throws PlatformError if no Instagram Business account is linked to Pages', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { access_token: 'short_lived_token', expires_in: 3600 },
      });
      mockedAxios.get.mockResolvedValueOnce({
        data: { access_token: 'long_lived_token', expires_in: 5184000 },
      });
      mockedAxios.get.mockResolvedValueOnce({
        data: { data: [{ id: 'page_999', name: 'No IG page' }] },
      });

      await expect(
        oauth.exchangeCodeForTokens({
          code: 'bad_code',
          codeVerifier: '',
          redirectUri: 'http://localhost:4000/v1/connect/instagram/callback',
        })
      ).rejects.toThrow(PlatformError);
    });
  });

  describe('Publishing', () => {
    it('rejects text-only posts since Instagram strictly requires media', async () => {
      await expect(
        adapter.publish({
          workspaceId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
          accountId: '17841400000000001',
          text: 'Text only post',
          mediaUrls: [],
          idempotencyKey: 'idemp-ig-1',
          fingerprint: 'a'.repeat(64),
          metadata: { accessToken: 'valid_token' },
        })
      ).rejects.toThrow('Instagram requires at least one image or video');
    });

    it('publishes single image container and then calls media_publish', async () => {
      // 1. Create container
      mockedAxios.post.mockResolvedValueOnce({ data: { id: 'container_image_123' } });

      // 2. Poll status (FINISHED)
      mockedAxios.get.mockResolvedValueOnce({ data: { status_code: 'FINISHED' } });

      // 3. Publish container
      mockedAxios.post.mockResolvedValueOnce({ data: { id: 'published_ig_999' } });

      // 4. Resolve permalink
      mockedAxios.get.mockResolvedValueOnce({
        data: { permalink: 'https://www.instagram.com/p/published_ig_999/' },
      });

      const result = await adapter.publish({
        workspaceId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
        accountId: '17841400000000001',
        text: 'Beautiful sunset view! #photography',
        mediaUrls: ['https://cdn.scriora.com/sunset.jpg'],
        idempotencyKey: 'idemp-ig-image',
        fingerprint: 'b'.repeat(64),
        metadata: { accessToken: 'valid_token' },
      });

      expect(result.status).toBe('SUCCEEDED');
      expect(result.externalPostId).toBe('published_ig_999');
      expect(result.externalPostUrl).toBe('https://www.instagram.com/p/published_ig_999/');
    });

    it('publishes video as Reels container', async () => {
      // 1. Create Reels container
      mockedAxios.post.mockResolvedValueOnce({ data: { id: 'container_reel_456' } });

      // 2. Poll status (FINISHED)
      mockedAxios.get.mockResolvedValueOnce({ data: { status_code: 'FINISHED' } });

      // 3. Publish container
      mockedAxios.post.mockResolvedValueOnce({ data: { id: 'published_reel_789' } });

      // 4. Resolve permalink
      mockedAxios.get.mockResolvedValueOnce({
        data: { permalink: 'https://www.instagram.com/p/published_reel_789/' },
      });

      const result = await adapter.publish({
        workspaceId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
        accountId: '17841400000000001',
        text: 'Behind the scenes reel! #bts',
        mediaUrls: ['https://cdn.scriora.com/reel.mp4'],
        idempotencyKey: 'idemp-ig-reel',
        fingerprint: 'c'.repeat(64),
        metadata: { accessToken: 'valid_token', mediaType: 'REELS' },
      });

      expect(result.status).toBe('SUCCEEDED');
      expect(result.externalPostId).toBe('published_reel_789');
    });

    it('publishes Carousel with multiple child containers (up to 10)', async () => {
      // 2 child containers
      mockedAxios.post.mockResolvedValueOnce({ data: { id: 'child_container_1' } });
      mockedAxios.post.mockResolvedValueOnce({ data: { id: 'child_container_2' } });

      // Parent container
      mockedAxios.post.mockResolvedValueOnce({ data: { id: 'parent_carousel_container' } });

      // Poll parent container
      mockedAxios.get.mockResolvedValueOnce({ data: { status_code: 'FINISHED' } });

      // Publish parent
      mockedAxios.post.mockResolvedValueOnce({ data: { id: 'published_carousel_101' } });

      // Resolve permalink
      mockedAxios.get.mockResolvedValueOnce({
        data: { permalink: 'https://www.instagram.com/p/published_carousel_101/' },
      });

      const result = await adapter.publish({
        workspaceId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
        accountId: '17841400000000001',
        text: 'Carousel swipe left! 👉',
        mediaUrls: ['https://cdn.scriora.com/item1.jpg', 'https://cdn.scriora.com/item2.jpg'],
        idempotencyKey: 'idemp-ig-carousel',
        fingerprint: 'd'.repeat(64),
        metadata: { accessToken: 'valid_token' },
      });

      expect(result.status).toBe('SUCCEEDED');
      expect(result.externalPostId).toBe('published_carousel_101');
    });

    it('rejects carousels with more than 10 media items', async () => {
      const elevenUrls = Array.from(
        { length: 11 },
        (_, i) => `https://cdn.scriora.com/img_${i}.jpg`
      );

      await expect(
        adapter.publish({
          workspaceId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
          accountId: '17841400000000001',
          text: 'Too many items',
          mediaUrls: elevenUrls,
          idempotencyKey: 'idemp-ig-carousel-overflow',
          fingerprint: 'e'.repeat(64),
          metadata: { accessToken: 'valid_token' },
        })
      ).rejects.toThrow('Instagram carousel supports a maximum of 10 media items');
    });

    it('enforces 2026 hashtag limit (max 5 hashtags)', async () => {
      await expect(
        adapter.publish({
          workspaceId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
          accountId: '17841400000000001',
          text: 'Great post #one #two #three #four #five #six',
          mediaUrls: ['https://cdn.scriora.com/photo.jpg'],
          idempotencyKey: 'idemp-ig-hashtag-overflow',
          fingerprint: 'h'.repeat(64),
          metadata: { accessToken: 'valid_token' },
        })
      ).rejects.toThrow('Instagram 2026 guidelines enforce a maximum of 5 hashtags');
    });

    it('publishes single media as 24h Story container', async () => {
      // 1. Create Story container
      mockedAxios.post.mockResolvedValueOnce({ data: { id: 'container_story_101' } });
      // 2. Poll status (FINISHED)
      mockedAxios.get.mockResolvedValueOnce({ data: { status_code: 'FINISHED' } });
      // 3. Publish container
      mockedAxios.post.mockResolvedValueOnce({ data: { id: 'published_story_202' } });
      // 4. Resolve permalink
      mockedAxios.get.mockResolvedValueOnce({
        data: { permalink: 'https://www.instagram.com/stories/user/published_story_202/' },
      });

      const result = await adapter.publish({
        workspaceId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
        accountId: '17841400000000001',
        text: '',
        mediaUrls: ['https://cdn.scriora.com/story.jpg'],
        idempotencyKey: 'idemp-ig-story',
        fingerprint: 's'.repeat(64),
        metadata: { accessToken: 'valid_token', mediaType: 'STORY' },
      });

      expect(result.status).toBe('SUCCEEDED');
      expect(result.externalPostId).toBe('published_story_202');
      expect(result.platformMetadata.mediaType).toBe('STORY');
      expect(result.platformMetadata.shareToFeed).toBe(false);
    });

    it('rejects Story with multiple media items', async () => {
      await expect(
        adapter.publish({
          workspaceId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
          accountId: '17841400000000001',
          text: '',
          mediaUrls: ['https://cdn.scriora.com/s1.jpg', 'https://cdn.scriora.com/s2.jpg'],
          idempotencyKey: 'idemp-ig-multi-story',
          fingerprint: 'm'.repeat(64),
          metadata: { accessToken: 'valid_token', mediaType: 'STORY' },
        })
      ).rejects.toThrow('Instagram Stories support only a single image or video');
    });

    it('publishes Reels with custom cover, thumb offset, collaborators, and trial params', async () => {
      // 1. Create Reels container
      mockedAxios.post.mockResolvedValueOnce({ data: { id: 'container_reel_custom' } });
      // 2. Poll status (FINISHED)
      mockedAxios.get.mockResolvedValueOnce({ data: { status_code: 'FINISHED' } });
      // 3. Publish container
      mockedAxios.post.mockResolvedValueOnce({ data: { id: 'published_reel_custom' } });
      // 4. Resolve permalink
      mockedAxios.get.mockResolvedValueOnce({
        data: { permalink: 'https://www.instagram.com/reel/published_reel_custom/' },
      });

      const result = await adapter.publish({
        workspaceId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
        accountId: '17841400000000001',
        text: 'Custom Reel with co-author #viral',
        mediaUrls: ['https://cdn.scriora.com/reel_custom.mp4'],
        idempotencyKey: 'idemp-ig-reel-adv',
        fingerprint: 'r'.repeat(64),
        metadata: {
          accessToken: 'valid_token',
          mediaType: 'REELS',
          shareToFeed: false,
          coverUrl: 'https://cdn.scriora.com/cover.jpg',
          thumbOffset: 1500,
          collaborators: ['scriora_team', 'partner_brand'],
          trialParams: { graduationStrategy: 'SS_PERFORMANCE' },
        },
      });

      expect(result.status).toBe('SUCCEEDED');
      expect(result.externalPostId).toBe('published_reel_custom');
      expect(result.platformMetadata.shareToFeed).toBe(false);

      // Verify parameters sent to Meta Graph API
      const callArgs = mockedAxios.post.mock.calls[0];
      const params = callArgs?.[2]?.params as Record<string, unknown>;
      expect(params.cover_url).toBe('https://cdn.scriora.com/cover.jpg');
      expect(params.thumb_offset).toBe(1500);
      expect(params.share_to_feed).toBe(false);
      expect(params.collaborators).toBe(JSON.stringify(['scriora_team', 'partner_brand']));
      expect(params.trial_params).toBe(JSON.stringify({ graduationStrategy: 'SS_PERFORMANCE' }));
    });
  });

  describe('Verification & Metrics', () => {
    it('verifies existing media id', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: { id: '17841400000000001' } });
      const isValid = await adapter.verify('17841400000000001');
      expect(isValid).toBe(true);
    });

    it('extracts insights metrics from Graph API including sends/shares', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          data: [
            { name: 'impressions', values: [{ value: 1500 }] },
            { name: 'reach', values: [{ value: 1200 }] },
            { name: 'saved', values: [{ value: 85 }] },
            { name: 'shares', values: [{ value: 42 }] },
          ],
        },
      });

      const metrics = await adapter.getMetrics('post_123', 'access_token');
      expect(metrics.impressions).toBe(1500);
      expect(metrics.reach).toBe(1200);
      expect(metrics.saved).toBe(85);
      expect(metrics.bookmarks).toBe(85);
      expect(metrics.shares).toBe(42);
      expect(metrics.reposts).toBe(42);
    });
  });

  describe('Direct Messages', () => {
    it('sends direct message to recipient', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: { message_id: 'm_ig_msg_999' } });

      const dmResult = await adapter.sendDirectMessage({
        recipientId: 'ig_recipient_123',
        text: 'Thank you for reaching out to Scriora!',
        accessToken: 'access_token',
      });

      expect(dmResult.messageId).toBe('m_ig_msg_999');
    });

    it('lists conversations and messages', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          data: [
            {
              id: 'conv_1',
              messages: {
                data: [
                  {
                    id: 'msg_1',
                    message: 'How can I subscribe?',
                    created_time: '2026-09-12T10:00:00Z',
                    from: { id: 'user_456' },
                  },
                ],
              },
            },
          ],
        },
      });

      const list = await adapter.listDirectMessages({ accessToken: 'access_token' });
      expect(list.events.length).toBe(1);
      expect(list.events[0]?.text).toBe('How can I subscribe?');
      expect(list.events[0]?.senderId).toBe('user_456');
    });
  });

  describe('Mock Adapter', () => {
    it('executes simulated publish and returns mock payload', async () => {
      const res = await mockAdapter.publish({
        workspaceId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
        accountId: 'mock_account',
        text: 'Mock ig post',
        mediaUrls: ['https://example.com/img.jpg'],
        idempotencyKey: 'mock-ig-1',
        fingerprint: 'f'.repeat(64),
        metadata: {},
      });

      expect(res.status).toBe('SUCCEEDED');
      expect(res.externalPostId).toMatch(/^ig_/);
      expect(res.platformMetadata.mock).toBe(true);
    });
  });
});
