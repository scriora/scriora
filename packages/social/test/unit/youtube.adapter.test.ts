import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MockYouTubeAdapter } from '../../src/platforms/youtube/mock.adapter.js';
import { YouTubeAdapter } from '../../src/platforms/youtube/youtube.adapter.js';
import { YouTubeOAuth } from '../../src/platforms/youtube/youtube.oauth.js';

vi.mock('axios');
const mockedAxios = vi.mocked(axios, true);

describe('YouTube Adapter & OAuth Suite', () => {
  const clientId = 'yt_test_client_id';
  const clientSecret = 'yt_test_client_secret';
  let adapter: YouTubeAdapter;
  let oauth: YouTubeOAuth;
  const mockAdapter = new MockYouTubeAdapter();

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new YouTubeAdapter();
    oauth = new YouTubeOAuth(clientId, clientSecret);
  });

  describe('Capabilities', () => {
    it('declares valid YouTube video capabilities', () => {
      const caps = adapter.getCapabilities();
      expect(caps.supportsText).toBe(false);
      expect(caps.supportsImage).toBe(false);
      expect(caps.supportsVideo).toBe(true);
      expect(caps.supportsCarousel).toBe(false);
      expect(caps.supportsThreads).toBe(false);
      expect(caps.supportsScheduling).toBe(true);
      expect(caps.supportsMetrics).toBe(true);
      expect(caps.maxTextLength).toBe(5000);
    });
  });

  describe('OAuth Flow', () => {
    it('generates Google OAuth authorization URL with offline access and YouTube scopes', async () => {
      const auth = await oauth.getAuthorizationUrl({
        workspaceId: 'ws-yt-123',
        redirectUri: 'http://localhost:4000/v1/connect/youtube/callback',
        state: 'jwt_state_yt',
        codeVerifier: 'unused',
      });

      expect(auth.authorizationUrl).toContain('https://accounts.google.com/o/oauth2/v2/auth');
      expect(auth.authorizationUrl).toContain('client_id=yt_test_client_id');
      expect(auth.authorizationUrl).toContain('access_type=offline');
      expect(auth.authorizationUrl).toContain('prompt=consent');
      expect(auth.authorizationUrl).toContain('youtube.upload');
      expect(auth.authorizationUrl).toContain('youtube.readonly');
    });

    it('exchanges code for tokens and discovers channel identity', async () => {
      // 1. Google token exchange
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          access_token: 'ya29.google_access_token_123',
          refresh_token: '1//google_permanent_refresh_token_xyz',
          expires_in: 3600,
          token_type: 'Bearer',
          scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly',
        },
      });

      // 2. YouTube channels.list
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          items: [
            {
              id: 'UC_test_channel_id_789',
              snippet: {
                title: 'Scriora Media Channel',
                customUrl: '@scriora',
                thumbnails: {
                  high: { url: 'https://yt.gg/avatar_high.jpg' },
                },
              },
            },
          ],
        },
      });

      const result = await oauth.exchangeCodeForTokens({
        code: 'valid_google_code_123',
        redirectUri: 'http://localhost:4000/v1/connect/youtube/callback',
      });

      expect(result.accessToken).toBe('ya29.google_access_token_123');
      expect(result.refreshToken).toBe('1//google_permanent_refresh_token_xyz');
      expect(result.externalAccountId).toBe('UC_test_channel_id_789');
      expect(result.accountName).toBe('Scriora Media Channel (YouTube)');
      expect(result.rawPayload?.channelId).toBe('UC_test_channel_id_789');
    });

    it('refreshes expired access token using permanent refresh token', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          access_token: 'ya29.google_new_access_token_456',
          expires_in: 3600,
          token_type: 'Bearer',
          scope: 'https://www.googleapis.com/auth/youtube.upload',
        },
      });

      const refreshed = await oauth.refreshAccessToken('1//permanent_refresh_token');
      expect(refreshed.accessToken).toBe('ya29.google_new_access_token_456');
      expect(refreshed.expiresIn).toBe(3600);
    });
  });

  describe('Publishing', () => {
    const fakeToken = 'ya29.test_token';

    it('throws VALIDATION_ERROR when mediaUrls is empty', async () => {
      await expect(
        adapter.publish(
          {
            workspaceId: '11111111-1111-4111-8111-111111111111',
            accountId: 'UC_test_channel_id',
            text: 'Text with no video is not allowed on YouTube',
            mediaUrls: [],
            idempotencyKey: 'op-yt-no-video',
            fingerprint: '0'.repeat(64),
            metadata: {},
          },
          fakeToken
        )
      ).rejects.toThrow('YouTube requires at least one video URL');
    });

    it('publishes standard long-form video via resumable upload session', async () => {
      const videoDownloadUrl = 'https://cdn.example.com/videos/masterclass.mp4';
      const sessionLocation = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=sess_123';

      // 1. Session initiation (POST)
      mockedAxios.post.mockResolvedValueOnce({
        headers: { location: sessionLocation },
        data: {},
      });

      // 2. Video buffer download (GET)
      mockedAxios.get.mockResolvedValueOnce({
        data: Buffer.from('fake-video-binary-data-stream'),
      });

      // 3. Binary chunk upload to session location (PUT)
      mockedAxios.put.mockResolvedValueOnce({
        data: {
          id: 'v_yt_longform_987',
          snippet: { title: 'AI Engineering Masterclass 2026' },
          status: { uploadStatus: 'uploaded' },
        },
      });

      const result = await adapter.publish(
        {
          workspaceId: '11111111-1111-4111-8111-111111111111',
          accountId: 'UC_test_channel_id',
          text: 'Deep dive into autonomous software engineering agents',
          mediaUrls: [videoDownloadUrl],
          idempotencyKey: 'op-yt-longform',
          fingerprint: '1'.repeat(64),
          metadata: {
            title: 'AI Engineering Masterclass 2026',
            tags: ['AI', 'Engineering', 'Autonomous'],
            privacyStatus: 'public',
            categoryId: '28',
          },
        },
        fakeToken
      );

      expect(result.status).toBe('SUCCEEDED');
      expect(result.externalPostId).toBe('v_yt_longform_987');
      expect(result.externalPostUrl).toBe('https://www.youtube.com/watch?v=v_yt_longform_987');
      expect(result.platformMetadata.isShort).toBe(false);

      // Verify session initiation payload
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
        expect.objectContaining({
          snippet: expect.objectContaining({
            title: 'AI Engineering Masterclass 2026',
            tags: ['AI', 'Engineering', 'Autonomous'],
            categoryId: '28',
          }),
          status: expect.objectContaining({
            privacyStatus: 'public',
            selfDeclaredMadeForKids: false,
            embeddable: true,
          }),
        }),
        expect.any(Object)
      );
    });

    it('publishes YouTube Shorts and formats URL as shorts format with #Shorts tag', async () => {
      const videoDownloadUrl = 'https://cdn.example.com/videos/quick-tip.mp4';
      const sessionLocation = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=sess_shorts';

      // 1. Session initiation
      mockedAxios.post.mockResolvedValueOnce({
        headers: { location: sessionLocation },
        data: {},
      });

      // 2. Video buffer download
      mockedAxios.get.mockResolvedValueOnce({
        data: Buffer.from('fake-shorts-binary-data'),
      });

      // 3. PUT video buffer
      mockedAxios.put.mockResolvedValueOnce({
        data: {
          id: 'v_shorts_abc',
          snippet: { title: '3 Productivity Tips in 30 Seconds #Shorts' },
          status: { uploadStatus: 'uploaded' },
        },
      });

      const result = await adapter.publish(
        {
          workspaceId: '11111111-1111-4111-8111-111111111111',
          accountId: 'UC_test_channel_id',
          text: 'Quick productivity hacks',
          mediaUrls: [videoDownloadUrl],
          idempotencyKey: 'op-yt-shorts',
          fingerprint: '2'.repeat(64),
          metadata: {
            title: '3 Productivity Tips in 30 Seconds',
            isShort: true,
          },
        },
        fakeToken
      );

      expect(result.status).toBe('SUCCEEDED');
      expect(result.externalPostId).toBe('v_shorts_abc');
      expect(result.externalPostUrl).toBe('https://www.youtube.com/shorts/v_shorts_abc');
      expect(result.platformMetadata.isShort).toBe(true);

      // Verify title received #Shorts append
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          snippet: expect.objectContaining({
            title: '3 Productivity Tips in 30 Seconds #Shorts',
          }),
        }),
        expect.any(Object)
      );
    });

    it('uploads custom thumbnail when thumbnailUrl is provided', async () => {
      const videoDownloadUrl = 'https://cdn.example.com/videos/video.mp4';
      const thumbnailCoverUrl = 'https://cdn.example.com/thumbs/cover.jpg';
      const sessionLocation = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=sess_thumb';

      // 1. Session initiation
      mockedAxios.post.mockResolvedValueOnce({
        headers: { location: sessionLocation },
        data: {},
      });

      // 2. Video buffer download
      mockedAxios.get.mockResolvedValueOnce({
        data: Buffer.from('fake-video-binary'),
      });

      // 3. PUT video buffer
      mockedAxios.put.mockResolvedValueOnce({
        data: {
          id: 'v_thumb_123',
          snippet: { title: 'Video with custom cover' },
          status: { uploadStatus: 'uploaded' },
        },
      });

      // 4. Thumbnail buffer download
      mockedAxios.get.mockResolvedValueOnce({
        data: Buffer.from('fake-thumbnail-jpeg-binary'),
      });

      // 5. Thumbnail upload (POST /thumbnails/set)
      mockedAxios.post.mockResolvedValueOnce({
        data: { items: [{ default: { url: 'https://yt.gg/thumb.jpg' } }] },
      });

      const result = await adapter.publish(
        {
          workspaceId: '11111111-1111-4111-8111-111111111111',
          accountId: 'UC_test_channel_id',
          text: 'Video with custom thumbnail',
          mediaUrls: [videoDownloadUrl],
          idempotencyKey: 'op-yt-thumb',
          fingerprint: '3'.repeat(64),
          metadata: {
            title: 'Video with custom cover',
            thumbnailUrl: thumbnailCoverUrl,
          },
        },
        fakeToken
      );

      expect(result.status).toBe('SUCCEEDED');
      expect(result.platformMetadata.hasCustomThumbnail).toBe(true);

      // Verify thumbnail upload endpoint called
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://www.googleapis.com/upload/youtube/v3/thumbnails/set',
        expect.any(Buffer),
        expect.objectContaining({
          params: { videoId: 'v_thumb_123', uploadType: 'media' },
        })
      );
    });

    it('handles YouTube upload quota exceeded error with RATE_LIMIT_EXCEEDED', async () => {
      mockedAxios.post.mockRejectedValueOnce({
        response: {
          status: 429,
          data: {
            error: {
              errors: [{ reason: 'uploadLimitExceeded' }],
              message: 'The user has exceeded the number of videos they may upload.',
            },
          },
        },
      });

      await expect(
        adapter.publish(
          {
            workspaceId: '11111111-1111-4111-8111-111111111111',
            accountId: 'UC_test_channel_id',
            text: 'Quota check',
            mediaUrls: ['https://cdn.example.com/video.mp4'],
            idempotencyKey: 'op-yt-quota',
            fingerprint: '4'.repeat(64),
            metadata: {},
          },
          fakeToken
        )
      ).rejects.toThrow('YouTube upload quota exceeded');
    });
  });

  describe('Verification & Metrics', () => {
    it('verifies video existence and active status', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          items: [{ id: 'v_active_123', status: { uploadStatus: 'processed' } }],
        },
      });

      const isVerified = await adapter.verify('v_active_123', 'fake_token');
      expect(isVerified).toBe(true);
    });

    it('returns false on failed video status or not found', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          items: [{ id: 'v_failed_123', status: { uploadStatus: 'failed' } }],
        },
      });

      const isVerified = await adapter.verify('v_failed_123', 'fake_token');
      expect(isVerified).toBe(false);
    });

    it('fetches views, likes, and comments statistics as SocialMetrics', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          items: [
            {
              id: 'v_stats_123',
              statistics: {
                viewCount: '54200',
                likeCount: '3120',
                commentCount: '195',
              },
            },
          ],
        },
      });

      const metrics = await adapter.getMetrics('v_stats_123', 'fake_token');
      expect(metrics.impressions).toBe(54200);
      expect(metrics.likes).toBe(3120);
      expect(metrics.comments).toBe(195);
      expect(metrics.shares).toBe(0);
    });

    it('sanitizes < and > characters from titles and filters cumulative tags exceeding 500 chars', async () => {
      // 1. Session initiation
      mockedAxios.post.mockResolvedValueOnce({
        headers: {
          location: 'https://upload.youtube.com/upload_session_sanitized',
        },
      });

      // 2. Video download
      mockedAxios.get.mockResolvedValueOnce({
        data: Buffer.from('mock video bytes'),
      });

      // 3. Resumable binary upload
      mockedAxios.put.mockResolvedValueOnce({
        data: { id: 'v_sanitized_title_123' },
      });

      const res = await adapter.publish(
        {
          workspaceId: '11111111-1111-4111-8111-111111111111',
          accountId: 'UC_test_chan',
          text: 'Clean description',
          mediaUrls: ['https://cdn.example.com/clean.mp4'],
          idempotencyKey: 'idemp-sanitized',
          fingerprint: '1'.repeat(64),
          metadata: {
            title: 'Learn <Next.js 16> & <React 19> Guide',
            tags: ['tech', 'coding', 'a'.repeat(480), 'should_be_dropped_because_exceeds_500'],
            containsSyntheticMedia: true,
          },
        },
        'fake_token'
      );

      expect(res.status).toBe('SUCCEEDED');
      expect(res.platformMetadata?.title).toBe('Learn Next.js 16 & React 19 Guide');
      expect(res.platformMetadata?.containsSyntheticMedia).toBe(true);

      // Verify initiateResumableSession payload
      const initCall = mockedAxios.post.mock.calls[0];
      const payload = initCall?.[1] as {
        snippet: { title: string; tags: string[] };
        status: { containsSyntheticMedia: boolean };
      };
      expect(payload.snippet.title).toBe('Learn Next.js 16 & React 19 Guide');
      expect(payload.status.containsSyntheticMedia).toBe(true);
      const totalTagsLength = payload.snippet.tags.reduce((acc, t) => acc + t.length, 0);
      expect(totalTagsLength).toBeLessThanOrEqual(500);
    });

    it('posts firstComment to commentThreads when provided', async () => {
      // 1. Session initiation
      mockedAxios.post.mockResolvedValueOnce({
        headers: {
          location: 'https://upload.youtube.com/upload_session_comment',
        },
      });

      // 2. Video download
      mockedAxios.get.mockResolvedValueOnce({
        data: Buffer.from('mock video bytes'),
      });

      // 3. Resumable binary upload
      mockedAxios.put.mockResolvedValueOnce({
        data: { id: 'v_with_first_comment_456' },
      });

      // 4. commentThreads.insert
      mockedAxios.post.mockResolvedValueOnce({
        data: { id: 'comment_thread_abc_789' },
      });

      const res = await adapter.publish(
        {
          workspaceId: '11111111-1111-4111-8111-111111111111',
          accountId: 'UC_test_chan',
          text: 'Video caption',
          mediaUrls: ['https://cdn.example.com/video.mp4'],
          idempotencyKey: 'idemp-comment',
          fingerprint: '2'.repeat(64),
          metadata: {
            title: 'Title with First Comment',
            firstComment: 'Join our Discord server: https://discord.gg/scriora',
          },
        },
        'fake_token'
      );

      expect(res.status).toBe('SUCCEEDED');
      expect(res.platformMetadata?.hasFirstComment).toBe(true);
      expect(res.platformMetadata?.commentId).toBe('comment_thread_abc_789');

      // Verify commentThreads API call
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://www.googleapis.com/youtube/v3/commentThreads?part=snippet',
        {
          snippet: {
            videoId: 'v_with_first_comment_456',
            topLevelComment: {
              snippet: {
                textOriginal: 'Join our Discord server: https://discord.gg/scriora',
              },
            },
          },
        },
        expect.anything()
      );
    });
  });

  describe('Mock Adapter', () => {
    it('simulates YouTube publishing, shorts, and analytics deterministically', async () => {
      const pub = await mockAdapter.publish(
        {
          workspaceId: '11111111-1111-4111-8111-111111111111',
          accountId: 'UC_mock_channel',
          text: 'Mock Shorts',
          mediaUrls: ['https://cdn.example.com/mock.mp4'],
          idempotencyKey: 'op-mock-yt',
          fingerprint: '5'.repeat(64),
          metadata: { isShort: true },
        },
        'mock_token'
      );

      expect(pub.status).toBe('SUCCEEDED');
      expect(pub.externalPostUrl).toContain('https://www.youtube.com/shorts/');
      expect(await mockAdapter.verify('any_id', 'mock_token')).toBe(true);

      const metrics = await mockAdapter.getMetrics('any_id', 'mock_token');
      expect(metrics.impressions).toBeGreaterThan(0);
      expect(metrics.likes).toBeGreaterThan(0);
    });
  });
});
