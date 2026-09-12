import axios, { type AxiosError } from 'axios';
import type {
  OAuthCallbackParams,
  OAuthInitParams,
  OAuthInitResult,
  PlatformAdapter,
  PlatformCapabilities,
  PublishRequest,
  PublishResult,
  SocialPlatformType,
  TokenExchangeResult,
} from '../../contracts/platform.contract.js';
import { PlatformError } from '../../errors/social.error.js';
import { YouTubeOAuth } from './youtube.oauth.js';

export interface YouTubeMetadata {
  title?: string | undefined;
  description?: string | undefined;
  tags?: string[] | undefined;
  categoryId?: string | undefined;
  privacyStatus?: 'public' | 'private' | 'unlisted' | undefined;
  isShort?: boolean | undefined;
  madeForKids?: boolean | undefined;
  containsSyntheticMedia?: boolean | undefined;
  firstComment?: string | undefined;
  thumbnailUrl?: string | undefined;
  embeddable?: boolean | undefined;
  publishAt?: string | undefined;
  accessToken?: string | undefined;
}

export class YouTubeAdapter implements PlatformAdapter {
  public readonly platform: SocialPlatformType = 'YOUTUBE';
  private readonly baseUrl = 'https://www.googleapis.com/youtube/v3';
  private readonly uploadUrl = 'https://www.googleapis.com/upload/youtube/v3';
  private readonly oauth: YouTubeOAuth;

  constructor(clientId?: string, clientSecret?: string) {
    this.oauth = new YouTubeOAuth(clientId, clientSecret);
  }

  public getCapabilities(): PlatformCapabilities {
    return {
      supportsText: false,
      supportsImage: false,
      supportsVideo: true,
      supportsCarousel: false,
      supportsThreads: false,
      supportsScheduling: true,
      supportsMetrics: true,
      supportsWebhooks: false,
      maxTextLength: 5000,
    };
  }

  public async getAuthorizationUrl(params: OAuthInitParams): Promise<OAuthInitResult> {
    return this.oauth.getAuthorizationUrl(params);
  }

  public async exchangeCodeForTokens(params: OAuthCallbackParams): Promise<TokenExchangeResult> {
    return this.oauth.exchangeCodeForTokens(params);
  }

  public async refreshAccessToken(
    refreshToken: string
  ): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number }> {
    return this.oauth.refreshAccessToken(refreshToken);
  }

  public async publish(request: PublishRequest, accessTokenParam?: string): Promise<PublishResult> {
    const accessToken = accessTokenParam || (request.metadata?.accessToken as string) || '';
    if (!accessToken) {
      throw new PlatformError({
        message: 'YouTube access token is required for publishing.',
        code: 'MISSING_ACCESS_TOKEN',
        category: 'AUTHENTICATION',
        retryable: false,
      });
    }

    const mediaUrls = request.mediaUrls || [];
    if (mediaUrls.length === 0 || !mediaUrls[0]) {
      throw new PlatformError({
        message: 'YouTube requires at least one video URL to publish.',
        code: 'VALIDATION_ERROR',
        category: 'VALIDATION',
        retryable: false,
      });
    }

    const videoUrl = mediaUrls[0];
    const metadata = (request.metadata || {}) as YouTubeMetadata;

    // Determine title (max 100 characters, sanitize < and > as prohibited by YouTube API)
    let title = metadata.title || request.text?.split('\n')[0]?.trim() || 'Untitled Video';
    title = title.replace(/[<>]/g, '').trim() || 'Untitled Video';
    if (title.length > 100) {
      title = `${title.slice(0, 97)}...`;
    }

    // Determine description (max 5000 characters)
    let description = metadata.description || request.text || '';
    if (description.length > 5000) {
      description = `${description.slice(0, 4997)}...`;
    }

    // YouTube Shorts auto-tagging
    const isShort = Boolean(metadata.isShort);
    if (isShort) {
      if (!title.toLowerCase().includes('#shorts') && title.length <= 92) {
        title = `${title} #Shorts`;
      } else if (!description.toLowerCase().includes('#shorts')) {
        description = `${description}\n\n#Shorts`.trim();
      }
    }

    const privacyStatus = metadata.privacyStatus || 'public';
    const categoryId = metadata.categoryId || '22';
    const madeForKids = Boolean(metadata.madeForKids);
    const containsSyntheticMedia = Boolean(metadata.containsSyntheticMedia);

    // YouTube limits cumulative length of all tags to <= 500 characters
    const rawTags = Array.isArray(metadata.tags) ? metadata.tags : [];
    let cumulativeTagsLen = 0;
    const tags: string[] = [];
    for (const rawTag of rawTags) {
      const clean = rawTag.trim();
      if (clean && cumulativeTagsLen + clean.length <= 500) {
        tags.push(clean);
        cumulativeTagsLen += clean.length;
      }
    }

    // Step 1: Initiate Resumable Upload Session
    const sessionUrl = await this.initiateResumableSession(accessToken, {
      title,
      description,
      tags,
      categoryId,
      privacyStatus,
      madeForKids,
      containsSyntheticMedia,
      embeddable: metadata.embeddable ?? true,
      publishAt: metadata.publishAt,
    });

    // Step 2: Download video buffer and stream/upload to session URL
    const videoId = await this.uploadVideoBuffer(sessionUrl, videoUrl, accessToken);

    // Step 3: Custom thumbnail upload (optional)
    if (metadata.thumbnailUrl) {
      await this.uploadThumbnail(videoId, metadata.thumbnailUrl, accessToken).catch((err) => {
        // Thumbnail failures should not fail the entire publication
        console.warn(
          `[YouTubeAdapter] Warning: Thumbnail upload failed for video ${videoId}:`,
          err
        );
      });
    }

    // Step 4: Auto-post First Comment (optional, up to 10,000 chars)
    let commentId: string | undefined;
    if (metadata.firstComment?.trim()) {
      commentId = await this.postFirstComment(
        videoId,
        metadata.firstComment.trim(),
        accessToken
      ).catch((err) => {
        console.warn(
          `[YouTubeAdapter] Warning: First comment posting failed for video ${videoId}:`,
          err
        );
        return undefined;
      });
    }

    const externalPostUrl = isShort
      ? `https://www.youtube.com/shorts/${videoId}`
      : `https://www.youtube.com/watch?v=${videoId}`;

    return {
      status: 'SUCCEEDED',
      externalPostId: videoId,
      externalPostUrl,
      platformMetadata: {
        videoId,
        title,
        isShort,
        privacyStatus,
        categoryId,
        hasCustomThumbnail: Boolean(metadata.thumbnailUrl),
        containsSyntheticMedia,
        hasFirstComment: Boolean(commentId),
        commentId,
      },
      operationId: request.idempotencyKey,
      publishedAt: new Date(),
    };
  }

  public async verify(externalPostId: string, accessTokenParam?: string): Promise<boolean> {
    const accessToken = accessTokenParam || '';
    try {
      const res = await axios.get<{
        items?: Array<{
          id: string;
          status?: { uploadStatus?: string; privacyStatus?: string };
        }>;
      }>(`${this.baseUrl}/videos`, {
        params: {
          part: 'status',
          id: externalPostId,
        },
        headers: {
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
      });

      const video = res.data.items?.[0];
      if (!video) return false;
      return video.status?.uploadStatus !== 'failed';
    } catch {
      return false;
    }
  }

  public async getMetrics(
    externalPostId: string,
    accessToken: string
  ): Promise<Record<string, number>> {
    try {
      const res = await axios.get<{
        items?: Array<{
          id: string;
          statistics?: {
            viewCount?: string;
            likeCount?: string;
            commentCount?: string;
            favoriteCount?: string;
          };
        }>;
      }>(`${this.baseUrl}/videos`, {
        params: {
          part: 'statistics',
          id: externalPostId,
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const stats = res.data.items?.[0]?.statistics;
      if (!stats) {
        return {
          likes: 0,
          comments: 0,
          shares: 0,
          impressions: 0,
          clicks: 0,
        };
      }

      return {
        likes: Number(stats.likeCount || 0),
        comments: Number(stats.commentCount || 0),
        shares: 0,
        impressions: Number(stats.viewCount || 0),
        clicks: 0,
      };
    } catch (err) {
      const axiosErr = err as AxiosError<{ error?: { message?: string } }>;
      const msg = axiosErr.response?.data?.error?.message || axiosErr.message;
      throw new PlatformError({
        message: `Failed to fetch YouTube metrics for ${externalPostId}: ${msg}`,
        code: 'INTERNAL_ERROR',
        category: 'EXTERNAL',
        retryable: true,
      });
    }
  }

  // ── Private Helpers ─────────────────────────────────────────────────────────

  private async initiateResumableSession(
    accessToken: string,
    params: {
      title: string;
      description: string;
      tags: string[];
      categoryId: string;
      privacyStatus: string;
      madeForKids: boolean;
      containsSyntheticMedia: boolean;
      embeddable: boolean;
      publishAt?: string | undefined;
    }
  ): Promise<string> {
    try {
      const res = await axios.post(
        `${this.uploadUrl}/videos?uploadType=resumable&part=snippet,status`,
        {
          snippet: {
            title: params.title,
            description: params.description,
            tags: params.tags,
            categoryId: params.categoryId,
          },
          status: {
            privacyStatus: params.privacyStatus,
            selfDeclaredMadeForKids: params.madeForKids,
            embeddable: params.embeddable,
            ...(params.publishAt ? { publishAt: params.publishAt } : {}),
            ...(params.containsSyntheticMedia !== undefined
              ? { containsSyntheticMedia: params.containsSyntheticMedia }
              : {}),
          },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json; charset=UTF-8',
            'X-Upload-Content-Type': 'video/*',
          },
        }
      );

      const location = res.headers.location;
      if (!location) {
        throw new PlatformError({
          message: 'YouTube resumable session did not return an upload Location header.',
          code: 'INTERNAL_ERROR',
          category: 'EXTERNAL',
          retryable: true,
        });
      }

      return location;
    } catch (err) {
      if (err instanceof PlatformError) throw err;
      const axiosErr = err as AxiosError<{
        error?: { message?: string; errors?: Array<{ reason?: string }> };
      }>;
      const reason = axiosErr.response?.data?.error?.errors?.[0]?.reason;
      const msg = axiosErr.response?.data?.error?.message || axiosErr.message;

      if (reason === 'uploadLimitExceeded' || reason === 'quotaExceeded') {
        throw new PlatformError({
          message: `YouTube upload quota exceeded: ${msg}`,
          code: 'RATE_LIMIT_EXCEEDED',
          category: 'RATE_LIMITED',
          retryable: true,
        });
      }

      throw new PlatformError({
        message: `Failed to initiate YouTube video upload session: ${msg}`,
        code: 'NETWORK_ERROR',
        category: 'EXTERNAL',
        retryable: true,
      });
    }
  }

  private async uploadVideoBuffer(
    sessionUrl: string,
    videoUrl: string,
    accessToken: string
  ): Promise<string> {
    try {
      const videoRes = await axios.get<ArrayBuffer>(videoUrl, {
        responseType: 'arraybuffer',
        timeout: 60000,
      });

      const videoBuffer = Buffer.from(videoRes.data);

      const uploadRes = await axios.put<{ id: string }>(sessionUrl, videoBuffer, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'video/mp4',
          'Content-Length': videoBuffer.length.toString(),
        },
        maxBodyLength: Number.POSITIVE_INFINITY,
        maxContentLength: Number.POSITIVE_INFINITY,
        timeout: 120000,
      });

      const videoId = uploadRes.data?.id;
      if (!videoId) {
        throw new PlatformError({
          message: 'YouTube upload completed but did not return a valid video ID.',
          code: 'INTERNAL_ERROR',
          category: 'EXTERNAL',
          retryable: true,
        });
      }

      return videoId;
    } catch (err) {
      if (err instanceof PlatformError) throw err;
      const axiosErr = err as AxiosError<{ error?: { message?: string } }>;
      const msg = axiosErr.response?.data?.error?.message || axiosErr.message;
      throw new PlatformError({
        message: `Failed to upload video content to YouTube: ${msg}`,
        code: 'NETWORK_ERROR',
        category: 'EXTERNAL',
        retryable: true,
      });
    }
  }

  private async uploadThumbnail(
    videoId: string,
    thumbnailUrl: string,
    accessToken: string
  ): Promise<void> {
    const thumbRes = await axios.get<ArrayBuffer>(thumbnailUrl, {
      responseType: 'arraybuffer',
      timeout: 30000,
    });

    const thumbBuffer = Buffer.from(thumbRes.data);

    await axios.post(`${this.uploadUrl}/thumbnails/set`, thumbBuffer, {
      params: {
        videoId,
        uploadType: 'media',
      },
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'image/jpeg',
        'Content-Length': thumbBuffer.length.toString(),
      },
    });
  }

  private async postFirstComment(
    videoId: string,
    commentText: string,
    accessToken: string
  ): Promise<string> {
    const res = await axios.post<{ id: string }>(
      `${this.baseUrl}/commentThreads?part=snippet`,
      {
        snippet: {
          videoId,
          topLevelComment: {
            snippet: {
              textOriginal: commentText,
            },
          },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );
    return res.data.id;
  }
}
