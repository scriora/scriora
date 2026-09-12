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

export class MockFacebookAdapter implements PlatformAdapter {
  public readonly platform: SocialPlatformType = 'FACEBOOK';

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
    return {
      authorizationUrl: `https://www.facebook.com/v21.0/dialog/oauth?client_id=mock_fb_id&redirect_uri=${encodeURIComponent(
        params.redirectUri
      )}&response_type=code&scope=pages_show_list,pages_read_engagement,pages_manage_posts,public_profile&state=${
        params.state
      }`,
    };
  }

  public async exchangeCodeForTokens(_params: OAuthCallbackParams): Promise<TokenExchangeResult> {
    return {
      accessToken: `mock_fb_page_token_${Date.now()}`,
      expiresIn: 0,
      externalAccountId: '109876543210987',
      accountName: 'Mock Enterprise Page (Facebook Page)',
      rawPayload: {
        type: 'PAGE',
        pageId: '109876543210987',
        pageName: 'Mock Enterprise Page',
        userId: '123456789012345',
        userName: 'Mock Developer',
        availablePages: [
          {
            id: '109876543210987',
            name: 'Mock Enterprise Page',
            accessToken: `mock_fb_page_token_${Date.now()}`,
          },
        ],
      },
    };
  }

  public async refreshAccessToken(
    _refreshToken: string
  ): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number }> {
    return {
      accessToken: `mock_fb_refreshed_token_${Date.now()}`,
      expiresIn: 5184000,
    };
  }

  public async publish(request: PublishRequest): Promise<PublishResult> {
    const id = `109876543210987_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    return {
      status: 'SUCCEEDED',
      externalPostId: id,
      externalPostUrl: `https://www.facebook.com/${id}`,
      publishedAt: new Date(),
      operationId: request.idempotencyKey,
      platformMetadata: {
        mock: true,
        targetId: '109876543210987',
        adapterVersion: '1.0.0-mock',
        deliveredAt: new Date().toISOString(),
      },
    };
  }

  public async verify(externalPostId: string): Promise<boolean> {
    return /^\d+(_\d+)?$/.test(externalPostId);
  }

  public async getMetrics(
    _externalPostId: string,
    _accessToken: string
  ): Promise<Record<string, number>> {
    return {
      likes: 420,
      comments: 65,
      shares: 28,
    };
  }
}
