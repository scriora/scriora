import { randomUUID } from 'node:crypto';
import type {
  PlatformAdapter,
  PlatformCapabilities,
  PublishRequest,
  PublishResult,
  SocialPlatformType,
} from '../../contracts/platform.contract.js';

export class MockLinkedInAdapter implements PlatformAdapter {
  public readonly platform: SocialPlatformType = 'LINKEDIN';

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

  public async publish(request: PublishRequest): Promise<PublishResult> {
    const randomId = randomUUID().replace(/-/g, '').slice(0, 16);
    const externalPostId = `urn:li:share:${randomId}`;
    const externalPostUrl = `https://www.linkedin.com/feed/update/${externalPostId}`;

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
    return externalPostId.startsWith('urn:li:share:');
  }
}
