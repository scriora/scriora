import axios from 'axios';
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
import { XOAuth } from './x.oauth.js';

export interface XPoll {
  options: string[];
  durationMinutes?: number;
  duration_minutes?: number;
}

export interface XThreadItem {
  content?: string;
  text?: string;
  mediaUrls?: string[];
  mediaIds?: string[];
  altText?: string;
}

export interface XMetadata {
  accessToken?: string;
  longPost?: boolean;
  replyToId?: string;
  replyToTweetId?: string;
  quoteTweetId?: string;
  replySettings?: 'following' | 'mentionedUsers' | 'subscribers' | 'verified' | 'everyone';
  communityId?: string;
  shareWithFollowers?: boolean;
  poll?: XPoll;
  threadItems?: XThreadItem[];
  mediaIds?: string[];
  altText?: string;
  linkInFirstReply?: boolean;
  options?: XMetadata | { options?: XMetadata };
}

export class XAdapter implements PlatformAdapter {
  public readonly platform: SocialPlatformType = 'X';
  private readonly oauth: XOAuth;

  constructor(clientId?: string, clientSecret?: string) {
    this.oauth = new XOAuth(clientId, clientSecret);
  }

  public getCapabilities(): PlatformCapabilities {
    return {
      supportsText: true,
      supportsImage: true,
      supportsVideo: true,
      supportsCarousel: false,
      supportsThreads: true,
      supportsScheduling: true,
      supportsMetrics: true,
      supportsWebhooks: true,
      supportsDirectMessages: true,
      maxTextLength: 280,
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
   * Intelligently splits a long post into a thread of sequential tweets,
   * respecting sentence and paragraph boundaries and appending (i/n) indices.
   */
  public static splitIntoThread(text: string, maxLen = 275): string[] {
    const trimmed = text.trim();
    if (trimmed.length <= 280) {
      return [trimmed];
    }

    const paragraphs = trimmed.split(/\n\s*\n/);
    const chunks: string[] = [];
    let currentChunk = '';

    for (const para of paragraphs) {
      if (`${currentChunk}\n\n${para}`.trim().length <= maxLen) {
        currentChunk = currentChunk ? `${currentChunk}\n\n${para}` : para;
      } else {
        // Paragraph too large for current chunk, split sentences if needed
        if (currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = '';
        }

        if (para.length <= maxLen) {
          currentChunk = para;
        } else {
          // Break paragraph by sentences
          const sentences = para.match(/[^.!?]+[.!?]+|\S+/g) || [para];
          for (const sentence of sentences) {
            if (`${currentChunk} ${sentence}`.trim().length <= maxLen) {
              currentChunk = currentChunk ? `${currentChunk} ${sentence}` : sentence;
            } else {
              if (currentChunk) {
                chunks.push(currentChunk.trim());
              }
              // If single sentence exceeds maxLen, split by words
              if (sentence.length > maxLen) {
                const words = sentence.split(/\s+/);
                currentChunk = '';
                for (const word of words) {
                  if (`${currentChunk} ${word}`.trim().length <= maxLen) {
                    currentChunk = currentChunk ? `${currentChunk} ${word}` : word;
                  } else {
                    if (currentChunk) chunks.push(currentChunk.trim());
                    currentChunk = word;
                  }
                }
              } else {
                currentChunk = sentence;
              }
            }
          }
        }
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    // Append thread numbering (1/N)
    const total = chunks.length;
    if (total > 1) {
      return chunks.map((chunk, index) => `${chunk}\n\n(${index + 1}/${total})`);
    }

    return chunks;
  }

  /**
   * Uploads image or media to Twitter upload API v1.1
   */
  public async uploadMedia(
    mediaBufferOrBase64: Buffer | string,
    accessToken: string
  ): Promise<string> {
    try {
      const base64Data = Buffer.isBuffer(mediaBufferOrBase64)
        ? mediaBufferOrBase64.toString('base64')
        : mediaBufferOrBase64.replace(/^data:image\/\w+;base64,/, '');

      const params = new URLSearchParams();
      params.append('media_data', base64Data);

      const response = await axios.post(
        'https://upload.twitter.com/1.1/media/upload.json',
        params.toString(),
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      const mediaId = response.data?.media_id_string || String(response.data?.media_id);
      if (!mediaId) {
        throw new Error('Twitter API did not return media_id');
      }
      return mediaId;
    } catch (err: unknown) {
      const errObj = err as { response?: { data?: unknown; status?: number }; message?: string };
      throw new PlatformError({
        message: `X media upload failed: ${errObj.message || 'unknown error'}`,
        code: 'MEDIA_UPLOAD_FAILED',
        category: 'EXTERNAL',
        retryable: false,
        platformCode: String(errObj.response?.status ?? ''),
      });
    }
  }

  public async publish(request: PublishRequest): Promise<PublishResult> {
    const rawMeta = (request.metadata || {}) as XMetadata & {
      options?: XMetadata | { options?: XMetadata };
    };
    const nestedOptions = (
      rawMeta.options && typeof rawMeta.options === 'object' && 'options' in rawMeta.options
        ? (rawMeta.options as { options?: XMetadata }).options
        : rawMeta.options
    ) as XMetadata | undefined;

    const meta: XMetadata = {
      ...(nestedOptions || {}),
      ...rawMeta,
    };

    const accessToken = meta.accessToken || (request.metadata?.accessToken as string) || '';
    if (!accessToken) {
      throw new PlatformError({
        message: 'Missing X access token in request metadata',
        code: 'MISSING_ACCESS_TOKEN',
        retryable: false,
      });
    }

    let text = request.text ?? '';
    let extractedLinks: string[] = [];

    // Zero-click / Link in first reply mode: bypasses the 2026 X algorithmic link penalty
    if (meta.linkInFirstReply) {
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      const matches = text.match(urlRegex);
      if (matches && matches.length > 0) {
        extractedLinks = matches;
        const stripped = text
          .replace(urlRegex, '')
          .replace(/[ \t]{2,}/g, ' ')
          .trim();
        if (stripped.length > 0) {
          text = stripped;
        }
      }
    }

    // Determine thread items
    interface InternalTweetItem {
      text: string;
      mediaIds?: string[] | undefined;
      mediaUrls?: string[] | undefined;
    }

    let tweetItems: InternalTweetItem[] = [];

    if (meta.longPost) {
      // Long post mode: skip splitting for Premium / Premium+ accounts (up to 25,000 chars)
      tweetItems = [{ text, mediaIds: meta.mediaIds, mediaUrls: request.mediaUrls }];
    } else if (meta.threadItems && meta.threadItems.length > 0) {
      // Explicit thread items
      tweetItems = [
        { text, mediaIds: meta.mediaIds, mediaUrls: request.mediaUrls },
        ...meta.threadItems.map((item) => ({
          text: item.content || item.text || '',
          mediaIds: item.mediaIds,
          mediaUrls: item.mediaUrls,
        })),
      ];
    } else {
      // Auto-split thread mode if exceeding 280 chars
      const splitTexts = XAdapter.splitIntoThread(text);
      tweetItems = splitTexts.map((chunk, idx) => ({
        text: chunk,
        mediaIds: idx === 0 ? meta.mediaIds : undefined,
        mediaUrls: idx === 0 ? request.mediaUrls : undefined,
      }));
    }

    // Append extracted link as immediate first reply if linkInFirstReply was requested
    if (extractedLinks.length > 0) {
      tweetItems.push({
        text: `🔗 ${extractedLinks.join('\n')}`,
      });
    }

    let previousTweetId: string | undefined;
    let firstTweetId = '';
    const publishedTweetIds: string[] = [];

    try {
      for (const [i, item] of tweetItems.entries()) {
        const payload: Record<string, unknown> = { text: item.text };

        // Reply chaining
        if (previousTweetId) {
          payload.reply = { in_reply_to_tweet_id: previousTweetId };
        } else if (meta.replyToTweetId || meta.replyToId) {
          payload.reply = { in_reply_to_tweet_id: meta.replyToTweetId || meta.replyToId };
        }

        // Quote tweet on root tweet
        if (i === 0 && meta.quoteTweetId) {
          payload.quote_tweet_id = meta.quoteTweetId;
        }

        // Community post on root tweet
        if (i === 0 && meta.communityId) {
          payload.community_id = meta.communityId;
        }

        // Reply settings on root tweet
        if (i === 0 && meta.replySettings && meta.replySettings !== 'everyone') {
          payload.reply_settings = meta.replySettings;
        }

        // Poll on root tweet (cannot be combined with media)
        const hasMedia =
          (item.mediaIds && item.mediaIds.length > 0) ||
          (item.mediaUrls && item.mediaUrls.length > 0);
        if (i === 0 && meta.poll && !hasMedia) {
          payload.poll = {
            options: meta.poll.options,
            duration_minutes: meta.poll.durationMinutes || meta.poll.duration_minutes || 1440,
          };
        }

        // Media IDs
        const effectiveMediaIds = [...(item.mediaIds || [])];
        if (effectiveMediaIds.length > 0) {
          payload.media = { media_ids: effectiveMediaIds.slice(0, 4) };
        }

        const response = await axios.post('https://api.twitter.com/2/tweets', payload, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        });

        const tweetId = response.data?.data?.id;
        if (!tweetId) {
          throw new Error('Twitter API did not return a tweet ID');
        }

        if (!firstTweetId) {
          firstTweetId = tweetId;
        }
        previousTweetId = tweetId;
        publishedTweetIds.push(tweetId);
      }

      return {
        status: 'SUCCEEDED',
        externalPostId: firstTweetId,
        externalPostUrl: `https://x.com/i/status/${firstTweetId}`,
        publishedAt: new Date(),
        operationId: `x_${firstTweetId}`,
        platformMetadata: {
          threadLength: tweetItems.length,
          rootTweetId: firstTweetId,
          allTweetIds: publishedTweetIds,
          isLongPost: Boolean(meta.longPost),
          communityId: meta.communityId,
          replySettings: meta.replySettings,
        },
      };
    } catch (e: unknown) {
      const err = e as { response?: { data?: unknown; status?: number }; message?: string };
      const status = err.response?.status;
      const isRateLimited = status === 429;
      const isCreditsDepleted = status === 402;
      const isRetryable = isRateLimited || (status !== undefined && status >= 500);

      const errorDetail = (err.response?.data as { detail?: string })?.detail;
      const message = isCreditsDepleted
        ? `X publish failed: Twitter API credits depleted (${errorDetail || 'Payment Required'}). Please add credits in console.x.com/billing/credits.`
        : `X publish failed: ${err.message ?? 'Unknown error'}`;

      throw new PlatformError({
        message,
        code: isCreditsDepleted
          ? 'PAYMENT_REQUIRED'
          : isRateLimited
            ? 'RATE_LIMITED'
            : 'PUBLISH_FAILED',
        category: isCreditsDepleted ? 'AUTHORIZATION' : isRateLimited ? 'RATE_LIMITED' : 'EXTERNAL',
        retryable: isRetryable,
        platformCode: String(status ?? ''),
      });
    }
  }

  public async getMetrics(
    externalPostId: string,
    accessToken: string
  ): Promise<Record<string, number>> {
    try {
      const res = await axios.get(
        `https://api.twitter.com/2/tweets/${externalPostId}?tweet.fields=public_metrics,non_public_metrics`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      const metrics = (res.data?.data?.public_metrics || {}) as Record<string, number>;
      const nonPublic = (res.data?.data?.non_public_metrics || {}) as Record<string, number>;

      return {
        impressions: nonPublic.impression_count ?? metrics.impression_count ?? 0,
        likes: metrics.like_count ?? 0,
        retweets: metrics.retweet_count ?? 0,
        replies: metrics.reply_count ?? 0,
        quotes: metrics.quote_count ?? 0,
        bookmarks: metrics.bookmark_count ?? 0,
      };
    } catch {
      return {
        impressions: 0,
        likes: 0,
        retweets: 0,
        replies: 0,
        quotes: 0,
        bookmarks: 0,
      };
    }
  }

  public async deletePost(externalPostId: string, accessToken: string): Promise<boolean> {
    if (!externalPostId || !accessToken) return false;
    try {
      const res = await axios.delete(`https://api.twitter.com/2/tweets/${externalPostId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return Boolean(res.data?.data?.deleted);
    } catch {
      return false;
    }
  }

  /**
   * Sends a 1-on-1 Direct Message to a specific recipient user on X.
   * Endpoint: POST https://api.twitter.com/2/dm_conversations/with/:participant_id/messages
   */
  public async sendDirectMessage(params: SendDirectMessageParams): Promise<DirectMessageResult> {
    if (!params.accessToken) {
      throw new PlatformError({
        message: 'Missing access token for sending direct message',
        code: 'MISSING_ACCESS_TOKEN',
        category: 'AUTHENTICATION',
        retryable: false,
      });
    }

    if (!params.recipientId) {
      throw new PlatformError({
        message: 'Missing recipientId for direct message',
        code: 'MISSING_RECIPIENT_ID',
        category: 'VALIDATION',
        retryable: false,
      });
    }

    const payload: Record<string, unknown> = {
      message: {
        text: params.text,
      },
    };

    if (params.mediaId) {
      (payload.message as Record<string, unknown>).attachments = [{ media_id: params.mediaId }];
    }

    try {
      const res = await axios.post(
        `https://api.twitter.com/2/dm_conversations/with/${params.recipientId}/messages`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${params.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const data = res.data?.data;
      return {
        messageId: data?.dm_event_id || data?.id || '',
        dmConversationId: data?.dm_conversation_id,
        createdAt: new Date(),
      };
    } catch (e: unknown) {
      const err = e as { response?: { data?: unknown; status?: number }; message?: string };
      const status = err.response?.status;
      const isRateLimited = status === 429;
      const isCreditsDepleted = status === 402;
      const isRetryable = isRateLimited || (status !== undefined && status >= 500);

      const errorDetail = (err.response?.data as { detail?: string })?.detail;
      const message = isCreditsDepleted
        ? `X DM failed: Twitter API credits depleted (${errorDetail || 'Payment Required'}). Please add credits in console.x.com/billing/credits.`
        : `X DM failed: ${err.message ?? 'Unknown error'}`;

      throw new PlatformError({
        message,
        code: isCreditsDepleted ? 'PAYMENT_REQUIRED' : isRateLimited ? 'RATE_LIMITED' : 'DM_FAILED',
        category: isCreditsDepleted ? 'AUTHORIZATION' : isRateLimited ? 'RATE_LIMITED' : 'EXTERNAL',
        retryable: isRetryable,
        platformCode: String(status ?? ''),
      });
    }
  }

  /**
   * Lists recent Direct Message events for the authenticated account.
   * Endpoint: GET https://api.twitter.com/2/dm_events
   */
  public async listDirectMessages(
    params: ListDirectMessagesParams
  ): Promise<ListDirectMessagesResult> {
    if (!params.accessToken) {
      throw new PlatformError({
        message: 'Missing access token for listing direct messages',
        code: 'MISSING_ACCESS_TOKEN',
        category: 'AUTHENTICATION',
        retryable: false,
      });
    }

    const query = new URLSearchParams({
      event_types: 'MessageCreate',
      'dm_event.fields': 'id,text,created_at,sender_id,dm_conversation_id',
    });

    if (params.maxResults) {
      query.set('max_results', String(params.maxResults));
    }
    if (params.paginationToken) {
      query.set('pagination_token', params.paginationToken);
    }

    try {
      const res = await axios.get(`https://api.twitter.com/2/dm_events?${query.toString()}`, {
        headers: {
          Authorization: `Bearer ${params.accessToken}`,
        },
      });

      const rawEvents = (res.data?.data || []) as Array<{
        id: string;
        text?: string;
        sender_id: string;
        dm_conversation_id?: string;
        created_at?: string;
      }>;

      const events: DirectMessageEvent[] = rawEvents.map((evt) => ({
        id: evt.id,
        text: evt.text,
        senderId: evt.sender_id,
        dmConversationId: evt.dm_conversation_id,
        createdAt: evt.created_at ? new Date(evt.created_at) : new Date(),
      }));

      const nextToken = res.data?.meta?.next_token as string | undefined;

      return {
        events,
        nextToken,
      };
    } catch (e: unknown) {
      const err = e as { response?: { data?: unknown; status?: number }; message?: string };
      const status = err.response?.status;
      const isRateLimited = status === 429;
      const isCreditsDepleted = status === 402;
      const isRetryable = isRateLimited || (status !== undefined && status >= 500);

      const message = isCreditsDepleted
        ? 'X credits depleted: Please top up your developer credits at console.x.com'
        : `X list DMs failed: ${err.message ?? 'Unknown error'}`;

      throw new PlatformError({
        message,
        code: isCreditsDepleted
          ? 'PAYMENT_REQUIRED'
          : isRateLimited
            ? 'RATE_LIMITED'
            : 'LIST_DM_FAILED',
        category: isCreditsDepleted ? 'AUTHORIZATION' : isRateLimited ? 'RATE_LIMITED' : 'EXTERNAL',
        retryable: isRetryable,
        platformCode: String(status ?? ''),
      });
    }
  }

  public async verify(externalPostId: string): Promise<boolean> {
    if (!externalPostId || !/^\d+$/.test(externalPostId)) {
      return false;
    }
    return true;
  }
}
