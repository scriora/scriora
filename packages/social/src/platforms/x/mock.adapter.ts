import type {
  PlatformAdapter,
  PlatformCapabilities,
  PublishRequest,
  PublishResult,
  SocialPlatformType,
} from '../../contracts/platform.contract.js';

export class MockXAdapter implements PlatformAdapter {
  public readonly platform: SocialPlatformType = 'X';

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

  public async publish(request: PublishRequest): Promise<PublishResult> {
    const numericId = Date.now().toString() + Math.floor(Math.random() * 1000).toString();
    const externalPostId = numericId;
    const externalPostUrl = `https://x.com/i/status/${externalPostId}`;

    return {
      status: 'SUCCEEDED',
      externalPostId,
      externalPostUrl,
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
    return /^\d+$/.test(externalPostId);
  }
}
