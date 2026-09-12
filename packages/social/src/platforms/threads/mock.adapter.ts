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

export class MockThreadsAdapter implements PlatformAdapter {
  public readonly platform: SocialPlatformType = 'THREADS';

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
    return {
      authorizationUrl: `https://threads.net/oauth/authorize?client_id=mock_threads_id&redirect_uri=${encodeURIComponent(
        params.redirectUri
      )}&response_type=code&scope=threads_basic,threads_content_publish&state=${params.state}`,
    };
  }

  public async exchangeCodeForTokens(_params: OAuthCallbackParams): Promise<TokenExchangeResult> {
    return {
      accessToken: `mock_th_long_lived_token_${Date.now()}`,
      expiresIn: 5184000,
      externalAccountId: '2153805775492645',
      accountName: '@mock_threads_user',
      rawPayload: {
        threads_user_id: '2153805775492645',
        username: 'mock_threads_user',
      },
    };
  }

  public async refreshAccessToken(
    _refreshToken: string
  ): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number }> {
    return {
      accessToken: `mock_th_refreshed_token_${Date.now()}`,
      expiresIn: 5184000,
    };
  }

  public async publish(request: PublishRequest): Promise<PublishResult> {
    const id = `th_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    return {
      status: 'SUCCEEDED',
      externalPostId: id,
      externalPostUrl: `https://www.threads.net/t/${id}`,
      publishedAt: new Date(),
      operationId: request.idempotencyKey,
      platformMetadata: {
        mock: true,
        adapterVersion: '1.0.0-mock',
        deliveredAt: new Date().toISOString(),
      },
    };
  }

  public async verify(externalPostId: string): Promise<boolean> {
    return externalPostId.startsWith('th_') || /^\d+$/.test(externalPostId);
  }

  public async getMetrics(
    _externalPostId: string,
    _accessToken: string
  ): Promise<Record<string, number>> {
    return {
      views: 3200,
      likes: 245,
      replies: 38,
      reposts: 14,
      quotes: 5,
    };
  }
}
