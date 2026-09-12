import type {
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

export class MockInstagramAdapter implements PlatformAdapter {
  public readonly platform: SocialPlatformType = 'INSTAGRAM';

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
    return {
      authorizationUrl: `https://www.facebook.com/v21.0/dialog/oauth?client_id=mock_ig_id&redirect_uri=${encodeURIComponent(
        params.redirectUri
      )}&state=${params.state}&scope=instagram_basic,instagram_content_publish`,
    };
  }

  public async exchangeCodeForTokens(_params: OAuthCallbackParams): Promise<TokenExchangeResult> {
    return {
      accessToken: `mock_ig_long_lived_token_${Date.now()}`,
      expiresIn: 5184000, // 60 days
      externalAccountId: '17841400000000001',
      accountName: 'mock_instagram_creator',
      rawPayload: {
        instagram_business_account_id: '17841400000000001',
        username: 'mock_instagram_creator',
      },
    };
  }

  public async refreshAccessToken(
    _refreshToken: string
  ): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number }> {
    return {
      accessToken: `mock_ig_refreshed_token_${Date.now()}`,
      expiresIn: 5184000,
    };
  }

  public async publish(request: PublishRequest): Promise<PublishResult> {
    const id = `ig_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    return {
      status: 'SUCCEEDED',
      externalPostId: id,
      externalPostUrl: `https://www.instagram.com/p/${id}/`,
      publishedAt: new Date(),
      operationId: request.idempotencyKey,
      platformMetadata: {
        mock: true,
        adapterVersion: '1.0.0-mock',
        mediaCount: request.mediaUrls?.length ?? 0,
      },
    };
  }

  public async verify(externalPostId: string): Promise<boolean> {
    return externalPostId.startsWith('ig_') || /^\d+$/.test(externalPostId);
  }

  public async getMetrics(
    _externalPostId: string,
    _accessToken: string
  ): Promise<Record<string, number>> {
    return {
      impressions: 1250,
      reach: 980,
      saved: 42,
      likes: 185,
      comments: 19,
      shares: 12,
    };
  }

  public async sendDirectMessage(_params: SendDirectMessageParams): Promise<DirectMessageResult> {
    return {
      messageId: `mock_ig_msg_${Date.now()}`,
      createdAt: new Date(),
    };
  }

  public async listDirectMessages(
    _params: ListDirectMessagesParams
  ): Promise<ListDirectMessagesResult> {
    return {
      events: [
        {
          id: `mock_ig_msg_1`,
          text: 'Hello from mock Instagram DM',
          senderId: 'mock_user_1',
          createdAt: new Date(),
        },
      ],
    };
  }
}
