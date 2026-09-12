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
import { FacebookOAuth } from './facebook.oauth.js';

export interface FacebookMetadata {
  accessToken?: string | undefined;
  pageId?: string | undefined;
  link?: string | undefined;
  published?: boolean | undefined;
  videoThumbnailUrl?: string | undefined;
  altText?: string | undefined;
  mediaType?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'ALBUM' | undefined;
}

export class FacebookAdapter implements PlatformAdapter {
  public readonly platform: SocialPlatformType = 'FACEBOOK';
  private readonly oauth: FacebookOAuth;
  private readonly graphApiVersion = 'v21.0';

  constructor(appId?: string, appSecret?: string) {
    this.oauth = new FacebookOAuth(appId, appSecret);
  }

  public getCapabilities(): PlatformCapabilities {
    return {
      supportsText: true,
      supportsImage: true,
      supportsVideo: true,
      supportsCarousel: true,
      supportsThreads: false,
      supportsScheduling: true,
      supportsMetrics: true,
      supportsWebhooks: true,
      supportsDirectMessages: false,
      maxTextLength: 63206,
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

  /**
   * Publishes content to a Facebook Page or Profile via Meta Graph API v21.0.
   * Supports:
   * - Text & Link Feed Posts (up to 63,206 characters)
   * - Single Photo Posts
   * - Multi-Photo Attached Media Albums (2 to 10 items)
   * - Native Page Video Posts
   */
  public async publish(request: PublishRequest): Promise<PublishResult> {
    const accessToken = (request.metadata?.accessToken as string) || '';
    const targetId = (request.metadata?.pageId as string) || request.accountId;

    if (!accessToken) {
      throw new PlatformError({
        code: 'MISSING_ACCESS_TOKEN',
        category: 'AUTHENTICATION',
        message: 'Facebook Page or User access token is required for publishing',
        retryable: false,
      });
    }

    if (!targetId) {
      throw new PlatformError({
        code: 'MISSING_ACCOUNT_ID',
        category: 'VALIDATION',
        message: 'Facebook Page ID or Account ID is required',
        retryable: false,
      });
    }

    const text = request.text?.trim() || '';
    const mediaUrls = request.mediaUrls || [];

    if (!text && mediaUrls.length === 0) {
      throw new PlatformError({
        code: 'EMPTY_POST',
        category: 'VALIDATION',
        message: 'Facebook post must include either text, link, or media',
        retryable: false,
      });
    }

    if (text.length > 63206) {
      throw new PlatformError({
        code: 'TEXT_TOO_LONG',
        category: 'VALIDATION',
        message: `Facebook post exceeds maximum length of 63,206 characters (provided ${text.length})`,
        retryable: false,
      });
    }

    const link = (request.metadata?.link as string) || undefined;
    const published = request.metadata?.published !== false;
    const videoThumbnailUrl = (request.metadata?.videoThumbnailUrl as string) || undefined;

    try {
      let externalPostId: string;

      if (mediaUrls.length === 0) {
        // 1. Text & Link Post to Page Feed
        const postData: Record<string, string | boolean> = {
          message: text,
          access_token: accessToken,
          published,
        };
        if (link) {
          postData.link = link;
        }

        const res = await axios.post<{ id: string }>(
          `https://graph.facebook.com/${this.graphApiVersion}/${targetId}/feed`,
          null,
          { params: postData }
        );
        externalPostId = res.data.id;
      } else if (mediaUrls.length === 1) {
        // 2. Single Media Post (Photo or Video)
        const mediaUrl = mediaUrls[0] ?? '';
        const isVideo = this.isVideoUrl(mediaUrl, request.metadata?.mediaType as string);

        if (isVideo) {
          // Native Video Post
          const videoData: Record<string, string | boolean> = {
            file_url: mediaUrl,
            description: text,
            access_token: accessToken,
            published,
          };

          const res = await axios.post<{ id: string }>(
            `https://graph.facebook.com/${this.graphApiVersion}/${targetId}/videos`,
            null,
            { params: videoData }
          );
          externalPostId = res.data.id;

          // Custom video thumbnail attachment (PostPeer pattern)
          if (videoThumbnailUrl) {
            try {
              await axios.post(
                `https://graph.facebook.com/${this.graphApiVersion}/${externalPostId}/thumbnails`,
                null,
                {
                  params: {
                    image_url: videoThumbnailUrl,
                    is_preferred: true,
                    access_token: accessToken,
                  },
                }
              );
            } catch {
              // Best-effort thumbnail attachment; video publication remains valid
            }
          }
        } else {
          // Single Photo Post
          const photoData: Record<string, string | boolean> = {
            url: mediaUrl,
            message: text,
            access_token: accessToken,
            published,
          };

          const res = await axios.post<{ id: string; post_id?: string }>(
            `https://graph.facebook.com/${this.graphApiVersion}/${targetId}/photos`,
            null,
            { params: photoData }
          );
          externalPostId = res.data.post_id || res.data.id;
        }
      } else {
        // 3. Multi-Photo Attached Media Album (2 to 10 photos)
        if (mediaUrls.length > 10) {
          throw new PlatformError({
            code: 'CAROUSEL_LIMIT_EXCEEDED',
            category: 'VALIDATION',
            message: `Facebook multi-photo album supports a maximum of 10 items (provided ${mediaUrls.length})`,
            retryable: false,
          });
        }

        const attachedMedia: Array<{ media_fbid: string }> = [];

        // Upload each photo with published=false
        for (const url of mediaUrls) {
          const photoRes = await axios.post<{ id: string }>(
            `https://graph.facebook.com/${this.graphApiVersion}/${targetId}/photos`,
            null,
            {
              params: {
                url,
                published: false,
                access_token: accessToken,
              },
            }
          );
          attachedMedia.push({ media_fbid: photoRes.data.id });
        }

        // Publish feed post containing attached media IDs
        const feedRes = await axios.post<{ id: string }>(
          `https://graph.facebook.com/${this.graphApiVersion}/${targetId}/feed`,
          null,
          {
            params: {
              message: text,
              attached_media: JSON.stringify(attachedMedia),
              access_token: accessToken,
              published,
            },
          }
        );
        externalPostId = feedRes.data.id;
      }

      // Try fetching direct permalink URL if available
      let externalPostUrl = `https://www.facebook.com/${externalPostId}`;
      try {
        const infoRes = await axios.get<{ permalink_url?: string }>(
          `https://graph.facebook.com/${this.graphApiVersion}/${externalPostId}`,
          {
            params: {
              fields: 'permalink_url',
              access_token: accessToken,
            },
          }
        );
        if (infoRes.data.permalink_url) {
          externalPostUrl = infoRes.data.permalink_url;
        }
      } catch {
        // Fallback to standard Facebook post URL
      }

      return {
        status: 'SUCCEEDED',
        externalPostId,
        externalPostUrl,
        publishedAt: new Date(),
        operationId: request.idempotencyKey,
        platformMetadata: {
          targetId,
          mediaCount: mediaUrls.length,
          link: link ?? null,
          published,
          videoThumbnailUrl: videoThumbnailUrl ?? null,
          deliveredAt: new Date().toISOString(),
        },
      };
    } catch (e: unknown) {
      if (e instanceof PlatformError) {
        throw e;
      }

      const err = e as AxiosError<{
        error?: { message?: string; type?: string; code?: number; error_subcode?: number };
      }>;
      const fbError = err.response?.data?.error;
      const msg = fbError?.message || err.message || 'Failed to publish to Facebook';
      const code = fbError?.code;
      const subcode = fbError?.error_subcode;

      // Detect Meta OAuth / Session Checkpoints
      if (code === 190) {
        const isCheckpoint = subcode === 459;
        throw new PlatformError({
          code: isCheckpoint ? 'FACEBOOK_SECURITY_CHECKPOINT' : 'FACEBOOK_AUTH_EXPIRED',
          category: 'AUTHENTICATION',
          message: isCheckpoint
            ? 'Facebook security checkpoint triggered (Error 190 Subcode 459). The account owner must log in to facebook.com in a browser to clear the verification challenge.'
            : 'Facebook access token expired or was revoked. Please reconnect your Facebook account.',
          platformCode: subcode ? `${code}:${subcode}` : `${code}`,
          retryable: false,
        });
      }

      const isRetryable = err.response?.status ? err.response.status >= 500 : false;

      throw new PlatformError({
        code: 'FACEBOOK_PUBLISH_FAILED',
        category: 'EXTERNAL',
        message: msg,
        retryable: isRetryable,
      });
    }
  }

  public async verify(externalPostId: string): Promise<boolean> {
    try {
      const res = await axios.get<{ id: string }>(
        `https://graph.facebook.com/${this.graphApiVersion}/${externalPostId}`,
        {
          params: {
            fields: 'id',
            access_token: process.env.FACEBOOK_APP_SECRET || '',
          },
        }
      );
      return !!res.data.id;
    } catch {
      return /^\d+(_\d+)?$/.test(externalPostId);
    }
  }

  public async getMetrics(
    externalPostId: string,
    accessToken: string
  ): Promise<Record<string, number>> {
    try {
      const res = await axios.get<{
        likes?: { summary?: { total_count?: number } };
        comments?: { summary?: { total_count?: number } };
        shares?: { count?: number };
      }>(`https://graph.facebook.com/${this.graphApiVersion}/${externalPostId}`, {
        params: {
          fields: 'likes.summary(true),comments.summary(true),shares',
          access_token: accessToken,
        },
      });

      return {
        likes: res.data.likes?.summary?.total_count || 0,
        comments: res.data.comments?.summary?.total_count || 0,
        shares: res.data.shares?.count || 0,
      };
    } catch (e: unknown) {
      // Fallback: attempt fetching base shares if detailed user content comments require extra review
      try {
        const fallbackRes = await axios.get<{ shares?: { count?: number } }>(
          `https://graph.facebook.com/${this.graphApiVersion}/${externalPostId}`,
          {
            params: {
              fields: 'shares',
              access_token: accessToken,
            },
          }
        );
        return {
          likes: 0,
          comments: 0,
          shares: fallbackRes.data.shares?.count || 0,
        };
      } catch {
        const err = e as AxiosError<{ error?: { message?: string } }>;
        throw new PlatformError({
          code: 'METRICS_FAILED',
          category: 'EXTERNAL',
          message: err.response?.data?.error?.message || 'Failed to fetch Facebook post metrics',
          retryable: false,
        });
      }
    }
  }

  private isVideoUrl(url: string, explicitMediaType?: string): boolean {
    if (explicitMediaType === 'VIDEO') return true;
    const lower = url.toLowerCase();
    return (
      lower.endsWith('.mp4') ||
      lower.endsWith('.mov') ||
      lower.endsWith('.webm') ||
      lower.includes('format=mp4') ||
      lower.includes('video')
    );
  }
}
