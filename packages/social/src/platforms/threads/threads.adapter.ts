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
import { ThreadsOAuth } from './threads.oauth.js';

export interface ThreadsMetadata {
  accessToken?: string | undefined;
  replyToId?: string | undefined;
  linkAttachment?: string | undefined;
  topicTag?: string | undefined;
  replyControl?: 'everyone' | 'accounts_you_follow' | 'mentioned_only' | undefined;
  altText?: string[] | string | undefined;
  threadItems?: Array<{
    content: string;
    mediaUrls?: string[] | undefined;
    topicTag?: string | undefined;
    altText?: string[] | string | undefined;
  }> | undefined;
  mediaType?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'CAROUSEL' | undefined;
}


export class ThreadsAdapter implements PlatformAdapter {
  public readonly platform: SocialPlatformType = 'THREADS';
  private readonly oauth: ThreadsOAuth;
  private readonly apiVersion = 'v1.0';

  constructor(appId?: string, appSecret?: string) {
    this.oauth = new ThreadsOAuth(appId, appSecret);
  }

  public getCapabilities(): PlatformCapabilities {
    return {
      supportsText: true,
      supportsImage: true,
      supportsVideo: true,
      supportsCarousel: true,
      supportsThreads: true,
      supportsScheduling: true,
      supportsMetrics: true,
      supportsWebhooks: true,
      supportsDirectMessages: false,
      maxTextLength: 500,
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
   * Publishes a post to Threads via Meta Threads Graph API v1.0.
   * Supports:
   * - Text-only posts (max 500 characters)
   * - Single Image & Video posts
   * - Multi-item Carousels (2-10 items)
   * - Thread replies (via metadata.replyToId)
   */
  public async publish(request: PublishRequest): Promise<PublishResult> {
    const accessToken = (request.metadata?.accessToken as string) || '';
    const accountId = request.accountId;

    if (!accessToken) {
      throw new PlatformError({
        code: 'MISSING_ACCESS_TOKEN',
        category: 'AUTHENTICATION',
        message: 'Threads access token is required for publishing',
        retryable: false,
      });
    }

    if (!accountId) {
      throw new PlatformError({
        code: 'MISSING_ACCOUNT_ID',
        category: 'VALIDATION',
        message: 'Threads User ID is required',
        retryable: false,
      });
    }

    const text = request.text?.trim() || '';
    const mediaUrls = request.mediaUrls || [];

    if (!text && mediaUrls.length === 0) {
      throw new PlatformError({
        code: 'EMPTY_POST',
        category: 'VALIDATION',
        message: 'Threads post must include either text or media',
        retryable: false,
      });
    }

    if (text.length > 500) {
      throw new PlatformError({
        code: 'TEXT_TOO_LONG',
        category: 'VALIDATION',
        message: `Threads maximum text length is 500 characters (provided ${text.length})`,
        retryable: false,
      });
    }

    const replyToId = (request.metadata?.replyToId as string) || undefined;
    const linkAttachment = (request.metadata?.linkAttachment as string) || undefined;
    const topicTag = (request.metadata?.topicTag as string) || undefined;
    const replyControl = (request.metadata?.replyControl as
      | 'everyone'
      | 'accounts_you_follow'
      | 'mentioned_only') || undefined;
    const altText = request.metadata?.altText as string[] | string | undefined;
    const threadItems = request.metadata?.threadItems as
      | Array<{
          content: string;
          mediaUrls?: string[] | undefined;
          topicTag?: string | undefined;
          altText?: string[] | string | undefined;
        }>
      | undefined;

    // Strict Meta Threads Media Validation
    if (mediaUrls.length > 1) {
      const videoCount = mediaUrls.filter((u) => this.isVideoUrl(u)).length;
      const imageCount = mediaUrls.length - videoCount;

      if (videoCount > 0 && imageCount > 0) {
        throw new PlatformError({
          code: 'THREADS_MIXED_MEDIA_NOT_ALLOWED',
          category: 'VALIDATION',
          message: 'Threads does not permit mixing videos and images in a single post or carousel',
          retryable: false,
        });
      }

      if (videoCount > 1) {
        throw new PlatformError({
          code: 'THREADS_MAX_ONE_VIDEO',
          category: 'VALIDATION',
          message:
            'Threads allows a maximum of 1 video per post (carousel of multiple videos is not supported by Meta)',
          retryable: false,
        });
      }
    }

    try {
      let containerId: string;

      if (mediaUrls.length === 0) {
        // 1. Text-only Post
        containerId = await this.createTextContainer({
          accountId,
          accessToken,
          text,
          replyToId,
          linkAttachment,
          topicTag,
          replyControl,
        });
      } else if (mediaUrls.length === 1) {
        // 2. Single Media Post (Image or Video)
        const mediaUrl = mediaUrls[0] ?? '';
        const isVideo = this.isVideoUrl(mediaUrl, request.metadata?.mediaType as string);
        const singleAltText = Array.isArray(altText) ? altText[0] : altText;

        containerId = await this.createSingleMediaContainer({
          accountId,
          accessToken,
          mediaUrl,
          isVideo,
          text,
          replyToId,
          topicTag,
          replyControl,
          altText: singleAltText,
        });

        // Wait for video/media processing if required
        await this.waitForContainerReadiness(containerId, accessToken);
      } else {
        // 3. Carousel Post (2 to 10 items)
        if (mediaUrls.length > 10) {
          throw new PlatformError({
            code: 'CAROUSEL_LIMIT_EXCEEDED',
            category: 'VALIDATION',
            message: `Threads carousel allows a maximum of 10 items (provided ${mediaUrls.length})`,
            retryable: false,
          });
        }

        containerId = await this.createCarouselContainer({
          accountId,
          accessToken,
          mediaUrls,
          text,
          replyToId,
          topicTag,
          replyControl,
          altText,
        });

        await this.waitForContainerReadiness(containerId, accessToken);
      }

      // Step 2: Publish the Container
      const publishRes = await axios.post<{ id: string }>(
        `https://graph.threads.net/${this.apiVersion}/${accountId}/threads_publish`,
        null,
        {
          params: {
            creation_id: containerId,
            access_token: accessToken,
          },
        }
      );

      const externalPostId = publishRes.data.id;
      let externalPostUrl = `https://www.threads.net/t/${externalPostId}`;
      try {
        const infoRes = await axios.get<{ permalink?: string }>(
          `https://graph.threads.net/${this.apiVersion}/${externalPostId}`,
          {
            params: {
              fields: 'permalink',
              access_token: accessToken,
            },
          }
        );
        if (infoRes.data.permalink) {
          externalPostUrl = infoRes.data.permalink;
        }
      } catch {
        // Fallback to default
      }

      // Step 3: Publish chained thread replies if requested (Postiz-style chained breakdown)
      const chainedPostIds: string[] = [];
      const chainedPermalinks: string[] = [];
      let currentParentId = externalPostId;

      if (threadItems && threadItems.length > 0) {
        for (const item of threadItems) {
          const itemMedia = item.mediaUrls || [];
          let itemContainerId: string;

          if (itemMedia.length === 0) {
            itemContainerId = await this.createTextContainer({
              accountId,
              accessToken,
              text: item.content,
              replyToId: currentParentId,
              topicTag: item.topicTag || topicTag,
            });
          } else if (itemMedia.length === 1) {
            const itemUrl = itemMedia[0] ?? '';
            const isItemVideo = this.isVideoUrl(itemUrl);
            const itemAltText = Array.isArray(item.altText) ? item.altText[0] : item.altText;
            itemContainerId = await this.createSingleMediaContainer({
              accountId,
              accessToken,
              mediaUrl: itemUrl,
              isVideo: isItemVideo,
              text: item.content,
              replyToId: currentParentId,
              topicTag: item.topicTag || topicTag,
              altText: itemAltText,
            });
            await this.waitForContainerReadiness(itemContainerId, accessToken);
          } else {
            itemContainerId = await this.createCarouselContainer({
              accountId,
              accessToken,
              mediaUrls: itemMedia,
              text: item.content,
              replyToId: currentParentId,
              topicTag: item.topicTag || topicTag,
              altText: item.altText,
            });
            await this.waitForContainerReadiness(itemContainerId, accessToken);
          }

          const pubItemRes = await axios.post<{ id: string }>(
            `https://graph.threads.net/${this.apiVersion}/${accountId}/threads_publish`,
            null,
            {
              params: {
                creation_id: itemContainerId,
                access_token: accessToken,
              },
            }
          );

          currentParentId = pubItemRes.data.id;
          chainedPostIds.push(currentParentId);

          try {
            const itemLinkRes = await axios.get<{ permalink?: string }>(
              `https://graph.threads.net/${this.apiVersion}/${currentParentId}`,
              {
                params: {
                  fields: 'permalink',
                  access_token: accessToken,
                },
              }
            );
            if (itemLinkRes.data.permalink) {
              chainedPermalinks.push(itemLinkRes.data.permalink);
            } else {
              chainedPermalinks.push(`https://www.threads.net/t/${currentParentId}`);
            }
          } catch {
            chainedPermalinks.push(`https://www.threads.net/t/${currentParentId}`);
          }
        }
      }

      return {
        status: 'SUCCEEDED',
        externalPostId,
        externalPostUrl,
        publishedAt: new Date(),
        operationId: request.idempotencyKey,
        platformMetadata: {
          containerId,
          mediaCount: mediaUrls.length,
          replyToId: replyToId ?? null,
          topicTag: topicTag ?? null,
          replyControl: replyControl ?? 'everyone',
          chainedPostIds,
          chainedPermalinks,
          totalThreadItems: 1 + chainedPostIds.length,
          deliveredAt: new Date().toISOString(),
        },
      };
    } catch (e: unknown) {
      if (e instanceof PlatformError) {
        throw e;
      }

      const err = e as AxiosError<{
        error?: { message?: string; code?: number; error_subcode?: number };
      }>;
      const msg =
        err.response?.data?.error?.message || err.message || 'Failed to publish to Threads';
      const isRetryable = err.response?.status ? err.response.status >= 500 : false;

      throw new PlatformError({
        code: 'THREADS_PUBLISH_FAILED',
        category: 'EXTERNAL',
        message: msg,
        retryable: isRetryable,
      });
    }
  }

  public async verify(externalPostId: string): Promise<boolean> {
    try {
      const res = await axios.get<{ id: string }>(
        `https://graph.threads.net/${this.apiVersion}/${externalPostId}`,
        {
          params: {
            fields: 'id,text',
            access_token: process.env.THREADS_APP_SECRET || '',
          },
        }
      );
      return !!res.data.id;
    } catch {
      return /^\d+$/.test(externalPostId);
    }
  }

  public async getMetrics(
    externalPostId: string,
    accessToken: string
  ): Promise<Record<string, number>> {
    try {
      const res = await axios.get<{
        data: Array<{
          name: string;
          values: Array<{ value: number }>;
        }>;
      }>(`https://graph.threads.net/${this.apiVersion}/${externalPostId}/insights`, {
        params: {
          metric: 'views,likes,replies,reposts,quotes',
          access_token: accessToken,
        },
      });

      const metrics: Record<string, number> = {
        views: 0,
        likes: 0,
        replies: 0,
        reposts: 0,
        quotes: 0,
      };

      for (const item of res.data.data || []) {
        if (item.name && item.values?.[0]?.value !== undefined) {
          metrics[item.name] = item.values[0].value;
        }
      }

      return metrics;
    } catch (e: unknown) {
      const err = e as AxiosError<{ error?: { message?: string } }>;
      throw new PlatformError({
        code: 'METRICS_FETCH_FAILED',
        category: 'EXTERNAL',
        message: err.response?.data?.error?.message || 'Failed to fetch Threads metrics',
        retryable: false,
      });
    }
  }

  private async createTextContainer(params: {
    accountId: string;
    accessToken: string;
    text: string;
    replyToId?: string | undefined;
    linkAttachment?: string | undefined;
    topicTag?: string | undefined;
    replyControl?: string | undefined;
  }): Promise<string> {
    const postData: Record<string, string> = {
      media_type: 'TEXT',
      text: params.text,
      access_token: params.accessToken,
    };

    if (params.replyToId) {
      postData.reply_to_id = params.replyToId;
    }
    if (params.linkAttachment) {
      postData.link_attachment = params.linkAttachment;
    }
    if (params.topicTag) {
      postData.topic_tag = params.topicTag;
    }
    if (params.replyControl) {
      postData.reply_control = params.replyControl;
    }

    const res = await axios.post<{ id: string }>(
      `https://graph.threads.net/${this.apiVersion}/${params.accountId}/threads`,
      null,
      { params: postData }
    );

    return res.data.id;
  }

  private async createSingleMediaContainer(params: {
    accountId: string;
    accessToken: string;
    mediaUrl: string;
    isVideo: boolean;
    text: string;
    replyToId?: string | undefined;
    topicTag?: string | undefined;
    replyControl?: string | undefined;
    altText?: string | undefined;
  }): Promise<string> {
    const postData: Record<string, string> = {
      media_type: params.isVideo ? 'VIDEO' : 'IMAGE',
      access_token: params.accessToken,
    };

    if (params.isVideo) {
      postData.video_url = params.mediaUrl;
    } else {
      postData.image_url = params.mediaUrl;
      if (params.altText) {
        postData.alt_text = params.altText;
      }
    }

    if (params.text) {
      postData.text = params.text;
    }
    if (params.replyToId) {
      postData.reply_to_id = params.replyToId;
    }
    if (params.topicTag) {
      postData.topic_tag = params.topicTag;
    }
    if (params.replyControl) {
      postData.reply_control = params.replyControl;
    }

    const res = await axios.post<{ id: string }>(
      `https://graph.threads.net/${this.apiVersion}/${params.accountId}/threads`,
      null,
      { params: postData }
    );

    return res.data.id;
  }

  private async createCarouselContainer(params: {
    accountId: string;
    accessToken: string;
    mediaUrls: string[];
    text: string;
    replyToId?: string | undefined;
    topicTag?: string | undefined;
    replyControl?: string | undefined;
    altText?: string[] | string | undefined;
  }): Promise<string> {
    // 1. Create each carousel item container with is_carousel_item=true
    const childIds: string[] = [];

    for (let i = 0; i < params.mediaUrls.length; i++) {
      const url = params.mediaUrls[i]!;
      const isVideo = this.isVideoUrl(url);
      const itemData: Record<string, string | boolean> = {
        media_type: isVideo ? 'VIDEO' : 'IMAGE',
        is_carousel_item: true,
        access_token: params.accessToken,
      };

      if (isVideo) {
        itemData.video_url = url;
      } else {
        itemData.image_url = url;
        const alt = Array.isArray(params.altText)
          ? params.altText[i]
          : i === 0
            ? params.altText
            : undefined;
        if (alt) {
          itemData.alt_text = alt;
        }
      }

      const itemRes = await axios.post<{ id: string }>(
        `https://graph.threads.net/${this.apiVersion}/${params.accountId}/threads`,
        null,
        { params: itemData }
      );

      childIds.push(itemRes.data.id);
    }

    // 2. Wait for each child item to be ready
    for (const childId of childIds) {
      await this.waitForContainerReadiness(childId, params.accessToken);
    }

    // 3. Create parent carousel container
    const carouselData: Record<string, string> = {
      media_type: 'CAROUSEL',
      children: childIds.join(','),
      access_token: params.accessToken,
    };

    if (params.text) {
      carouselData.text = params.text;
    }
    if (params.replyToId) {
      carouselData.reply_to_id = params.replyToId;
    }
    if (params.topicTag) {
      carouselData.topic_tag = params.topicTag;
    }
    if (params.replyControl) {
      carouselData.reply_control = params.replyControl;
    }

    const parentRes = await axios.post<{ id: string }>(
      `https://graph.threads.net/${this.apiVersion}/${params.accountId}/threads`,
      null,
      { params: carouselData }
    );

    return parentRes.data.id;
  }

  private async waitForContainerReadiness(
    containerId: string,
    accessToken: string,
    maxAttempts = 15,
    delayMs = 2000
  ): Promise<void> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const res = await axios.get<{
        status: 'FINISHED' | 'IN_PROGRESS' | 'ERROR' | 'EXPIRED';
        error_message?: string;
      }>(`https://graph.threads.net/${this.apiVersion}/${containerId}`, {
        params: {
          fields: 'status,error_message',
          access_token: accessToken,
        },
      });

      const status = res.data.status;
      if (status === 'FINISHED') {
        return;
      }

      if (status === 'ERROR' || status === 'EXPIRED') {
        throw new PlatformError({
          code: 'CONTAINER_PROCESSING_FAILED',
          category: 'EXTERNAL',
          message: res.data.error_message || `Threads media container status: ${status}`,
          retryable: false,
        });
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    throw new PlatformError({
      code: 'CONTAINER_TIMEOUT',
      category: 'EXTERNAL',
      message: `Threads container ${containerId} timed out waiting for FINISHED status`,
      retryable: true,
    });
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
