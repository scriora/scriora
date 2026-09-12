import axios, { type AxiosError } from 'axios';
import type {
  DirectMessageEvent,
  DirectMessageResult,
  ListDirectMessagesParams,
  ListDirectMessagesResult,
  OAuthCallbackParams,
  OAuthInitParams,
  OAuthInitResult,
  PlatformAdapter,
  PlatformCapabilities,
  PublishRequest,
  PublishResult,
  SendDirectMessageParams,
  SocialPlatformType,
  TokenExchangeResult,
} from '../../contracts/platform.contract.js';
import { PlatformError } from '../../errors/social.error.js';
import { InstagramOAuth } from './instagram.oauth.js';

export interface InstagramMetadata {
  accessToken?: string | undefined;
  mediaType?: 'IMAGE' | 'VIDEO' | 'REELS' | 'CAROUSEL' | 'STORY' | undefined;
  contentType?: 'feed' | 'story' | 'reels' | undefined;
  shareToFeed?: boolean | undefined;
  coverUrl?: string | undefined;
  thumbOffset?: number | undefined;
  audioName?: string | undefined;
  collaborators?: string[] | undefined;
  trialParams?: { graduationStrategy: 'MANUAL' | 'SS_PERFORMANCE' } | undefined;
  locationId?: string | undefined;
  userTags?: Array<{ username: string; x: number; y: number }> | undefined;
}

export class InstagramAdapter implements PlatformAdapter {
  public readonly platform: SocialPlatformType = 'INSTAGRAM';
  private readonly oauth: InstagramOAuth;
  private readonly graphApiVersion = 'v21.0';

  private getGraphBaseUrl(accessToken = ''): string {
    const host = accessToken.startsWith('IG') ? 'graph.instagram.com' : 'graph.facebook.com';
    return `https://${host}/${this.graphApiVersion}`;
  }

  constructor(appId?: string, appSecret?: string) {
    this.oauth = new InstagramOAuth(appId, appSecret);
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
      supportsDirectMessages: true,
      maxTextLength: 2200,
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
   * Publishes content to Instagram via Meta Graph API v21+ 2-phase container pipeline.
   * Supports Single Images, Reels Videos, 24h Stories, and multi-media Carousels (up to 10 items).
   */
  public async publish(request: PublishRequest): Promise<PublishResult> {
    const accessToken = (request.metadata?.accessToken as string) || '';
    const accountId = request.accountId;

    if (!accessToken) {
      throw new PlatformError({
        code: 'MISSING_ACCESS_TOKEN',
        category: 'AUTHENTICATION',
        message: 'Instagram access token is required for publishing',
        retryable: false,
      });
    }

    if (!accountId) {
      throw new PlatformError({
        code: 'MISSING_ACCOUNT_ID',
        category: 'VALIDATION',
        message: 'Instagram Business Account ID is required',
        retryable: false,
      });
    }

    const mediaUrls = request.mediaUrls || [];
    if (mediaUrls.length === 0) {
      throw new PlatformError({
        code: 'MEDIA_REQUIRED',
        category: 'VALIDATION',
        message:
          'Instagram requires at least one image or video. Text-only posts are not supported by Instagram.',
        retryable: false,
      });
    }

    if (mediaUrls.length > 10) {
      throw new PlatformError({
        code: 'CAROUSEL_LIMIT_EXCEEDED',
        category: 'VALIDATION',
        message: 'Instagram carousel supports a maximum of 10 media items.',
        retryable: false,
      });
    }

    const caption = request.text || '';

    // Instagram 2026 algorithmic guardrail: Max 5 hashtags
    const hashtagMatches = caption.match(/#[\p{L}\p{N}_]+/gu) || [];
    if (hashtagMatches.length > 5) {
      throw new PlatformError({
        code: 'HASHTAG_LIMIT_EXCEEDED',
        category: 'VALIDATION',
        message: `Instagram 2026 guidelines enforce a maximum of 5 hashtags for optimal distribution and anti-spam protection (found ${hashtagMatches.length}).`,
        retryable: false,
      });
    }

    const isStory =
      request.metadata?.mediaType === 'STORY' || request.metadata?.contentType === 'story';

    if (isStory && mediaUrls.length > 1) {
      throw new PlatformError({
        code: 'STORY_SINGLE_MEDIA_ONLY',
        category: 'VALIDATION',
        message: 'Instagram Stories support only a single image or video per story.',
        retryable: false,
      });
    }

    const singleUrl = mediaUrls[0] ?? '';
    const isVideo =
      /\.(mp4|mov|avi|wmv)($|\?)/i.test(singleUrl) ||
      request.metadata?.mediaType === 'VIDEO' ||
      request.metadata?.mediaType === 'REELS';

    let containerId: string;
    const baseUrl = this.getGraphBaseUrl(accessToken);

    try {
      if (isStory) {
        // Story Container (Single 9:16 vertical image or video)
        const isStoryVideo =
          /\.(mp4|mov|avi|wmv)($|\?)/i.test(singleUrl) ||
          request.metadata?.mediaType === 'VIDEO';

        const res = await axios.post<{ id: string }>(
          `${baseUrl}/${accountId}/media`,
          null,
          {
            params: {
              media_type: 'STORIES',
              ...(isStoryVideo ? { video_url: singleUrl } : { image_url: singleUrl }),
              access_token: accessToken,
            },
          }
        );
        containerId = res.data.id;
      } else if (mediaUrls.length === 1) {
        if (isVideo) {
          // Reels / Video Container
          const shareToFeed =
            (request.metadata?.shareToFeed as boolean | undefined) ?? true;
          const coverUrl = request.metadata?.coverUrl as string | undefined;
          const thumbOffset = request.metadata?.thumbOffset as number | undefined;
          const audioName = request.metadata?.audioName as string | undefined;
          const collaborators = request.metadata?.collaborators as string[] | undefined;
          const trialParams = request.metadata?.trialParams as
            | { graduationStrategy: 'MANUAL' | 'SS_PERFORMANCE' }
            | undefined;

          const params: Record<string, unknown> = {
            media_type: 'REELS',
            video_url: singleUrl,
            caption,
            share_to_feed: shareToFeed,
            access_token: accessToken,
          };

          if (coverUrl) params.cover_url = coverUrl;
          if (thumbOffset !== undefined) params.thumb_offset = thumbOffset;
          if (audioName) params.audio_name = audioName;
          if (collaborators && collaborators.length > 0) {
            params.collaborators = JSON.stringify(collaborators.slice(0, 3));
          }
          if (trialParams) {
            params.trial_params = JSON.stringify(trialParams);
          }

          const res = await axios.post<{ id: string }>(
            `${baseUrl}/${accountId}/media`,
            null,
            { params }
          );
          containerId = res.data.id;
        } else {
          // Single Image Container
          const collaborators = request.metadata?.collaborators as string[] | undefined;
          const imageParams: Record<string, unknown> = {
            image_url: singleUrl,
            caption,
            access_token: accessToken,
          };
          if (collaborators && collaborators.length > 0) {
            imageParams.collaborators = JSON.stringify(collaborators.slice(0, 3));
          }
          if (request.metadata?.locationId) {
            imageParams.location_id = request.metadata.locationId;
          }
          if (request.metadata?.userTags) {
            imageParams.user_tags = JSON.stringify(request.metadata.userTags);
          }

          const res = await axios.post<{ id: string }>(
            `${baseUrl}/${accountId}/media`,
            null,
            { params: imageParams }
          );
          containerId = res.data.id;
        }
      } else {
        // Carousel Container (Multi-item)
        const childContainerIds: string[] = [];

        for (const url of mediaUrls) {
          const isItemVideo = /\.(mp4|mov)($|\?)/i.test(url);
          const childRes = await axios.post<{ id: string }>(
            `${baseUrl}/${accountId}/media`,
            null,
            {
              params: {
                is_carousel_item: true,
                ...(isItemVideo ? { media_type: 'VIDEO', video_url: url } : { image_url: url }),
                access_token: accessToken,
              },
            }
          );
          childContainerIds.push(childRes.data.id);
        }

        // Wait a brief moment for child containers to initialize
        await new Promise((r) => setTimeout(r, 1000));

        // Create Parent Carousel Container
        const collaborators = request.metadata?.collaborators as string[] | undefined;
        const carouselParams: Record<string, unknown> = {
          media_type: 'CAROUSEL',
          children: childContainerIds.join(','),
          caption,
          access_token: accessToken,
        };
        if (collaborators && collaborators.length > 0) {
          carouselParams.collaborators = JSON.stringify(collaborators.slice(0, 3));
        }
        if (request.metadata?.locationId) {
          carouselParams.location_id = request.metadata.locationId;
        }

        const carouselRes = await axios.post<{ id: string }>(
          `${baseUrl}/${accountId}/media`,
          null,
          { params: carouselParams }
        );
        containerId = carouselRes.data.id;
      }

      // Step 2: Poll container status if needed (especially for videos/reels)
      await this.awaitContainerReady(containerId, accessToken);

      // Step 3: Publish Container
      const publishRes = await axios.post<{ id: string }>(
        `${baseUrl}/${accountId}/media_publish`,
        null,
        {
          params: {
            creation_id: containerId,
            access_token: accessToken,
          },
        }
      );

      const publishedPostId = publishRes.data.id;

      // Step 4: Resolve post permalink
      let postUrl: string | undefined;
      try {
        const infoRes = await axios.get<{ permalink?: string }>(
          `${baseUrl}/${publishedPostId}`,
          {
            params: {
              fields: 'permalink',
              access_token: accessToken,
            },
          }
        );
        postUrl = infoRes.data.permalink;
      } catch {
        postUrl = `https://www.instagram.com/p/${publishedPostId}/`;
      }

      return {
        status: 'SUCCEEDED',
        externalPostId: publishedPostId,
        externalPostUrl: postUrl,
        publishedAt: new Date(),
        operationId: containerId,
        platformMetadata: {
          containerId,
          mediaType: isStory ? 'STORY' : mediaUrls.length > 1 ? 'CAROUSEL' : isVideo ? 'REELS' : 'IMAGE',
          mediaCount: mediaUrls.length,
          shareToFeed: isStory ? false : ((request.metadata?.shareToFeed as boolean | undefined) ?? true),
        },
      };
    } catch (e: unknown) {
      if (e instanceof PlatformError) throw e;
      const err = e as AxiosError<{
        error?: {
          message?: string;
          code?: number;
          error_subcode?: number;
          error_user_msg?: string;
        };
      }>;
      const fbErr = err.response?.data?.error;
      const msg =
        fbErr?.error_user_msg || fbErr?.message || err.message || 'Instagram publishing failed';
      const isRateLimited = fbErr?.code === 32 || fbErr?.code === 4 || fbErr?.code === 17;

      throw new PlatformError({
        code: isRateLimited ? 'RATE_LIMITED' : 'INSTAGRAM_PUBLISH_FAILED',
        category: isRateLimited ? 'RATE_LIMITED' : 'EXTERNAL',
        message: msg,
        retryable: isRateLimited,
        platformCode: String(fbErr?.code || err.response?.status || ''),
      });
    }
  }

  private async awaitContainerReady(
    containerId: string,
    accessToken: string,
    maxAttempts = 25
  ): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const checkRes = await axios.get<{ status_code?: string; status?: string }>(
          `${this.getGraphBaseUrl(accessToken)}/${containerId}`,
          {
            params: {
              fields: 'status_code,status',
              access_token: accessToken,
            },
          }
        );

        const status = checkRes.data.status_code;
        if (status === 'FINISHED' || status === 'READY') {
          return;
        }
        if (status === 'ERROR' || status === 'EXPIRED') {
          throw new PlatformError({
            code: 'MEDIA_CONTAINER_ERROR',
            category: 'EXTERNAL',
            message: `Instagram media container failed with status: ${status}`,
            retryable: false,
          });
        }
      } catch (e: unknown) {
        if (e instanceof PlatformError) throw e;
      }

      // Backoff sleep before next check (2.5 seconds)
      await new Promise((r) => setTimeout(r, 2500));
    }

    throw new PlatformError({
      code: 'MEDIA_CONTAINER_TIMEOUT',
      category: 'EXTERNAL',
      message: 'Instagram media container is still being processed by Meta. Please retry.',
      retryable: true,
    });
  }

  public async verify(externalPostId: string): Promise<boolean> {
    try {
      // Try graph.instagram.com first
      try {
        const res = await axios.get<{ id?: string }>(
          `https://graph.instagram.com/${this.graphApiVersion}/${externalPostId}`,
          { params: { fields: 'id' } }
        );
        if (res.data.id) return true;
      } catch {
        // Fallback to graph.facebook.com
      }

      const resFb = await axios.get<{ id?: string }>(
        `https://graph.facebook.com/${this.graphApiVersion}/${externalPostId}`,
        { params: { fields: 'id' } }
      );
      return !!resFb.data.id;
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
        data: Array<{ name: string; values: Array<{ value: number }> }>;
      }>(`${this.getGraphBaseUrl(accessToken)}/${externalPostId}/insights`, {
        params: {
          metric: 'impressions,reach,saved,likes,comments,shares',
          access_token: accessToken,
        },
      });

      const metrics: Record<string, number> = {};
      for (const item of res.data.data || []) {
        const val = item.values?.[0]?.value;
        if (val !== undefined) {
          const key = item.name.toLowerCase();
          metrics[key] = val;
          if (key === 'saved') metrics.bookmarks = val;
          if (key === 'comments') metrics.replies = val;
          if (key === 'shares') metrics.reposts = val;
        }
      }

      return metrics;
    } catch {
      return {};
    }
  }

  public async sendDirectMessage(params: SendDirectMessageParams): Promise<DirectMessageResult> {
    try {
      const res = await axios.post<{ message_id?: string; recipient_id?: string }>(
        `${this.getGraphBaseUrl(params.accessToken)}/me/messages`,
        {
          recipient: { id: params.recipientId },
          message: { text: params.text },
        },
        {
          params: { access_token: params.accessToken },
        }
      );

      return {
        messageId: res.data.message_id || `ig_msg_${Date.now()}`,
        createdAt: new Date(),
      };
    } catch (e: unknown) {
      const err = e as AxiosError<{ error?: { message?: string } }>;
      throw new PlatformError({
        code: 'DM_SEND_FAILED',
        category: 'EXTERNAL',
        message: err.response?.data?.error?.message || 'Failed to send Instagram Direct Message',
        retryable: false,
      });
    }
  }

  public async listDirectMessages(
    params: ListDirectMessagesParams
  ): Promise<ListDirectMessagesResult> {
    try {
      const res = await axios.get<{
        data: Array<{
          id: string;
          snippet?: string;
          updated_time?: string;
          messages?: {
            data: Array<{
              id: string;
              message?: string;
              created_time: string;
              from: { id: string; username?: string };
            }>;
          };
        }>;
      }>(`${this.getGraphBaseUrl(params.accessToken)}/me/conversations`, {
        params: {
          platform: 'instagram',
          fields: 'id,snippet,updated_time,messages{id,message,created_time,from}',
          access_token: params.accessToken,
          limit: params.maxResults || 20,
        },
      });

      const events: DirectMessageEvent[] = [];
      for (const conv of res.data.data || []) {
        for (const msg of conv.messages?.data || []) {
          events.push({
            id: msg.id,
            text: msg.message,
            senderId: msg.from.id,
            dmConversationId: conv.id,
            createdAt: new Date(msg.created_time),
          });
        }
      }

      return { events };
    } catch (e: unknown) {
      const err = e as AxiosError<{ error?: { message?: string } }>;
      throw new PlatformError({
        code: 'DM_LIST_FAILED',
        category: 'EXTERNAL',
        message: err.response?.data?.error?.message || 'Failed to list Instagram Direct Messages',
        retryable: false,
      });
    }
  }
}
