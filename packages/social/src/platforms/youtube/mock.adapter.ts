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

export class MockYouTubeAdapter implements PlatformAdapter {
  public readonly platform: SocialPlatformType = 'YOUTUBE';

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
    return {
      authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?client_id=mock_yt_client_id&redirect_uri=${encodeURIComponent(
        params.redirectUri
      )}&response_type=code&scope=${encodeURIComponent(
        'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly'
      )}&access_type=offline&prompt=consent&state=${params.state}`,
    };
  }

  public async exchangeCodeForTokens(_params: OAuthCallbackParams): Promise<TokenExchangeResult> {
    return {
      accessToken: `mock_yt_access_token_${Date.now()}`,
      refreshToken: `mock_yt_refresh_token_${Date.now()}`,
      expiresIn: 3600,
      externalAccountId: 'UC_mock_channel_1234567890',
      accountName: 'Mock Creator Channel (YouTube)',
      rawPayload: {
        channelId: 'UC_mock_channel_1234567890',
        channelTitle: 'Mock Creator Channel',
        customUrl: '@mockcreator',
        avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde',
        scope:
          'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly',
        tokenType: 'Bearer',
      },
    };
  }

  public async publish(request: PublishRequest, _accessToken?: string): Promise<PublishResult> {
    const isShort = Boolean(request.metadata?.isShort);
    const videoId = `yt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    return {
      status: 'SUCCEEDED',
      externalPostId: videoId,
      externalPostUrl: isShort
        ? `https://www.youtube.com/shorts/${videoId}`
        : `https://www.youtube.com/watch?v=${videoId}`,
      platformMetadata: {
        videoId,
        isShort,
        title: (request.metadata?.title as string) || request.text?.slice(0, 100) || 'Mock Video',
        privacyStatus: (request.metadata?.privacyStatus as string) || 'public',
        categoryId: (request.metadata?.categoryId as string) || '22',
        hasCustomThumbnail: Boolean(request.metadata?.thumbnailUrl),
        containsSyntheticMedia: Boolean(request.metadata?.containsSyntheticMedia),
        hasFirstComment: Boolean(request.metadata?.firstComment),
        ...(request.metadata?.firstComment ? { commentId: 'mock_comment_123' } : {}),
      },
      operationId: request.idempotencyKey,
      publishedAt: new Date(),
    };
  }

  public async verify(_externalPostId: string, _accessToken?: string): Promise<boolean> {
    return true;
  }

  public async getMetrics(
    _externalPostId: string,
    _accessToken?: string
  ): Promise<Record<string, number>> {
    return {
      likes: 1250,
      comments: 84,
      shares: 0,
      impressions: 24500,
      clicks: 0,
    };
  }
}
