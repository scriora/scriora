import axios from 'axios';
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
import { XOAuth } from './x.oauth.js';

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

  public async publish(request: PublishRequest): Promise<PublishResult> {
    const accessToken = (request.metadata?.accessToken as string) || '';
    if (!accessToken) {
      throw new PlatformError({
        message: 'Missing X access token in request metadata',
        code: 'MISSING_ACCESS_TOKEN',
        retryable: false,
      });
    }

    const text = request.text ?? '';
    const tweets = XAdapter.splitIntoThread(text);
    let previousTweetId: string | undefined;
    let firstTweetId = '';

    try {
      for (const tweetText of tweets) {
        const payload: Record<string, unknown> = { text: tweetText };

        if (previousTweetId) {
          payload.reply = {
            in_reply_to_tweet_id: previousTweetId,
          };
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
      }

      return {
        status: 'SUCCEEDED',
        externalPostId: firstTweetId,
        externalPostUrl: `https://x.com/i/status/${firstTweetId}`,
        publishedAt: new Date(),
        operationId: `x_${firstTweetId}`,
        platformMetadata: {
          threadLength: tweets.length,
          rootTweetId: firstTweetId,
        },
      };
    } catch (e: unknown) {
      const err = e as { response?: { data?: unknown; status?: number }; message?: string };
      const status = err.response?.status;
      const isRateLimited = status === 429;
      const isRetryable = isRateLimited || (status !== undefined && status >= 500);

      throw new PlatformError({
        message: `X publish failed: ${err.message ?? 'Unknown error'}`,
        code: isRateLimited ? 'RATE_LIMITED' : 'PUBLISH_FAILED',
        category: isRateLimited ? 'RATE_LIMITED' : 'EXTERNAL',
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
