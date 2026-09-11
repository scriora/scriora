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
import { LinkedInOAuth } from './linkedin.oauth.js';

export class LinkedInAdapter implements PlatformAdapter {
  public readonly platform: SocialPlatformType = 'LINKEDIN';
  private readonly oauth: LinkedInOAuth;

  constructor(clientId?: string, clientSecret?: string) {
    this.oauth = new LinkedInOAuth(clientId, clientSecret);
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
      maxTextLength: 3000,
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

  public async publish(request: PublishRequest): Promise<PublishResult> {
    const accessToken = (request.metadata?.accessToken as string) || '';
    const authorUrn =
      (request.metadata?.authorUrn as string) ||
      (request.accountId ? `urn:li:person:${request.accountId}` : '');

    if (!accessToken) {
      throw new PlatformError({
        message: 'Missing LinkedIn access token in request metadata',
        code: 'MISSING_ACCESS_TOKEN',
        retryable: false,
      });
    }

    try {
      const payload = {
        author: authorUrn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: {
              text: request.text || '',
            },
            shareMediaCategory: request.mediaUrls.length > 0 ? 'IMAGE' : 'NONE',
            media: request.mediaUrls.map((url) => ({
              status: 'READY',
              originalUrl: url,
            })),
          },
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
        },
      };

      const response = await axios.post('https://api.linkedin.com/v2/ugcPosts', payload, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0',
          'Content-Type': 'application/json',
        },
      });

      const externalPostId =
        response.data?.id ||
        (response.headers['x-restli-id'] as string) ||
        `urn:li:share:${request.idempotencyKey}`;
      const externalPostUrl = `https://www.linkedin.com/feed/update/${encodeURIComponent(externalPostId)}`;

      return {
        status: 'SUCCEEDED',
        externalPostId,
        externalPostUrl,
        publishedAt: new Date(),
        operationId: request.idempotencyKey,
        platformMetadata: {
          ugcPostId: externalPostId,
          apiVersion: 'v2/ugcPosts',
          responseStatus: response.status,
        },
      };
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const retryable = status === 429 || (status !== undefined && status >= 500 && status < 600);
        const retryAfterHeader = err.response?.headers['retry-after'];
        const retryAfterMs = retryAfterHeader
          ? Number.parseInt(retryAfterHeader, 10) * 1000
          : undefined;

        throw new PlatformError({
          message: `LinkedIn API error (${status}): ${err.response?.data?.message || err.message}`,
          code: status === 429 ? 'RATE_LIMITED' : status === 401 ? 'TOKEN_EXPIRED' : 'API_ERROR',
          retryable,
          platformCode: String(status),
          retryAfterMs,
        });
      }

      throw new PlatformError({
        message: err instanceof Error ? err.message : 'Unknown publish failure',
        code: 'UNKNOWN_ERROR',
        retryable: false,
      });
    }
  }

  public async verify(externalPostId: string): Promise<boolean> {
    if (!externalPostId) return false;
    // Format check for LinkedIn URN
    return externalPostId.startsWith('urn:li:');
  }
}
