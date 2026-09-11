import { randomUUID } from 'node:crypto';
import type {
  PlatformAdapter,
  PlatformCapabilities,
  PublishRequest,
  PublishResult,
  SocialPlatformType,
} from '../../contracts/platform.contract.js';

export class MockDiscordAdapter implements PlatformAdapter {
  public readonly platform: SocialPlatformType = 'DISCORD';

  public getCapabilities(): PlatformCapabilities {
    return {
      supportsText: true,
      supportsImage: true,
      supportsVideo: true,
      supportsCarousel: false,
      supportsThreads: false,
      supportsScheduling: true,
      supportsMetrics: false,
      supportsWebhooks: true,
      maxTextLength: 2000,
    };
  }

  public async publish(request: PublishRequest): Promise<PublishResult> {
    const randomId = randomUUID().replace(/-/g, '').slice(0, 18);
    const externalPostId = `1234567890${randomId.slice(0, 8)}`;
    const channelId =
      (typeof request.metadata?.channelId === 'string'
        ? request.metadata.channelId
        : undefined) ||
      request.accountId ||
      '112233445566778899';
    const externalPostUrl = `https://discord.com/channels/@me/${channelId}/${externalPostId}`;

    return {
      status: 'SUCCEEDED',
      externalPostId,
      externalPostUrl,
      publishedAt: new Date(),
      operationId: request.idempotencyKey,
      platformMetadata: {
        mock: true,
        adapterVersion: '1.0.0-mock',
        isWebhook: Boolean(request.metadata?.webhookUrl),
        channelId,
        deliveredAt: new Date().toISOString(),
      },
    };
  }

  public async verify(externalPostId: string): Promise<boolean> {
    return Boolean(externalPostId && externalPostId.length >= 10);
  }

  public async deletePost(_externalPostId: string, _accessToken: string): Promise<boolean> {
    return true;
  }
}
