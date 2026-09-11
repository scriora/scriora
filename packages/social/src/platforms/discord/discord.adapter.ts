import axios from 'axios';
import type {
  PlatformAdapter,
  PlatformCapabilities,
  PublishRequest,
  PublishResult,
  SocialPlatformType,
} from '../../contracts/platform.contract.js';
import { PlatformError } from '../../errors/social.error.js';

export interface DiscordEmbedFooter {
  text: string;
  icon_url?: string;
}

export interface DiscordEmbedImage {
  url: string;
}

export interface DiscordEmbedThumbnail {
  url: string;
}

export interface DiscordEmbedAuthor {
  name: string;
  url?: string;
  icon_url?: string;
}

export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  url?: string;
  timestamp?: string;
  color?: number;
  footer?: DiscordEmbedFooter;
  image?: DiscordEmbedImage;
  thumbnail?: DiscordEmbedThumbnail;
  author?: DiscordEmbedAuthor;
  fields?: DiscordEmbedField[];
}

export interface DiscordMetadata {
  webhookUrl?: string;
  botToken?: string;
  channelId?: string;
  guildId?: string;
  username?: string;
  avatarUrl?: string;
  embedTitle?: string;
  embedDescription?: string;
  embedColor?: string | number;
  embedFooter?: string;
  embeds?: DiscordEmbed[];
  tts?: boolean;
  allowEveryoneMention?: boolean;
  threadName?: string;
}

export class DiscordAdapter implements PlatformAdapter {
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
    const meta = (request.metadata || {}) as DiscordMetadata;

    // 1. Resolve credentials
    const webhookUrl =
      meta.webhookUrl ||
      (typeof request.metadata?.webhookUrl === 'string'
        ? request.metadata.webhookUrl
        : undefined) ||
      (typeof request.metadata?.accessToken === 'string' &&
      request.metadata.accessToken.startsWith('http')
        ? request.metadata.accessToken
        : undefined);

    const botToken =
      meta.botToken ||
      (typeof request.metadata?.botToken === 'string' ? request.metadata.botToken : undefined) ||
      (!webhookUrl && typeof request.metadata?.accessToken === 'string'
        ? request.metadata.accessToken
        : undefined);

    const channelId =
      meta.channelId ||
      (typeof request.metadata?.channelId === 'string' ? request.metadata.channelId : undefined) ||
      (typeof request.metadata?.externalAccountId === 'string'
        ? request.metadata.externalAccountId
        : undefined) ||
      request.accountId;

    if (!webhookUrl && (!botToken || !channelId)) {
      throw new PlatformError({
        message:
          'Missing Discord destination. Provide a webhookUrl or both botToken and channelId in credentials/metadata.',
        code: 'MISSING_DISCORD_CREDENTIALS',
        retryable: false,
        platformCode: 'DISCORD',
        category: 'VALIDATION',
      });
    }

    // 2. Build Discord message payload
    const text = request.text || '';
    const embeds: DiscordEmbed[] = meta.embeds ? [...meta.embeds] : [];

    // If options specify embed parameters or media exists without custom embeds, build embed
    const hasEmbedOptions =
      Boolean(meta.embedTitle) ||
      Boolean(meta.embedDescription) ||
      meta.embedColor !== undefined ||
      Boolean(meta.embedFooter);

    if (
      hasEmbedOptions ||
      (request.mediaUrls && request.mediaUrls.length > 0 && embeds.length === 0)
    ) {
      const embed: DiscordEmbed = {};

      if (meta.embedTitle) {
        embed.title = meta.embedTitle.slice(0, 256);
      }

      if (meta.embedDescription) {
        embed.description = meta.embedDescription.slice(0, 4096);
      }

      if (meta.embedColor !== undefined) {
        embed.color = this.parseColor(meta.embedColor);
      }

      if (meta.embedFooter) {
        embed.footer = { text: meta.embedFooter.slice(0, 2048) };
      }

      const firstMedia = request.mediaUrls?.[0];
      if (firstMedia) {
        embed.image = { url: firstMedia };
      }

      embeds.push(embed);

      // Multi-image embeds (Discord supports up to 4 images in an album if sharing same url/embeds)
      if (request.mediaUrls && request.mediaUrls.length > 1) {
        for (let i = 1; i < Math.min(request.mediaUrls.length, 4); i++) {
          const extraMedia = request.mediaUrls[i];
          if (extraMedia) {
            embeds.push({
              image: { url: extraMedia },
            });
          }
        }
      }
    }

    const payload: Record<string, unknown> = {};

    if (text) {
      payload.content = text.slice(0, 2000);
    }

    if (embeds.length > 0) {
      payload.embeds = embeds.slice(0, 10);
    }

    if (meta.username) {
      payload.username = meta.username.slice(0, 80);
    }

    if (meta.avatarUrl) {
      payload.avatar_url = meta.avatarUrl;
    }

    if (meta.tts !== undefined) {
      payload.tts = meta.tts;
    }

    // Respect Discord permissions: restrict mentions by default unless explicitly permitted
    payload.allowed_mentions = {
      parse: meta.allowEveryoneMention ? ['everyone', 'roles', 'users'] : ['users'],
    };

    // Ensure payload has at least content or embeds
    if (!payload.content && (!payload.embeds || (payload.embeds as unknown[]).length === 0)) {
      throw new PlatformError({
        message:
          'Discord message must have either text content or at least one embed/media attachment.',
        code: 'EMPTY_DISCORD_PAYLOAD',
        retryable: false,
        platformCode: 'DISCORD',
        category: 'VALIDATION',
      });
    }

    try {
      let externalPostId = '';
      let externalPostUrl = '';
      let responseData: Record<string, unknown> = {};

      if (webhookUrl) {
        // A. Webhook Execution
        const targetUrl = webhookUrl.includes('?')
          ? `${webhookUrl}&wait=true`
          : `${webhookUrl}?wait=true`;

        const response = await axios.post(targetUrl, payload, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 15000,
        });

        responseData = (response.data as Record<string, unknown>) || {};
        externalPostId = String(responseData.id || `webhook-${Date.now()}`);
        const returnedChannelId = String(responseData.channel_id || channelId || '');

        if (returnedChannelId && responseData.id) {
          externalPostUrl = `https://discord.com/channels/@me/${returnedChannelId}/${responseData.id}`;
        }
      } else {
        // B. Bot API Execution
        const targetUrl = `https://discord.com/api/v10/channels/${channelId}/messages`;

        const response = await axios.post(targetUrl, payload, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bot ${botToken}`,
          },
          timeout: 15000,
        });

        responseData = (response.data as Record<string, unknown>) || {};
        externalPostId = String(responseData.id || `bot-${Date.now()}`);
        const guildId = meta.guildId || String(responseData.guild_id || '@me');

        if (channelId && responseData.id) {
          externalPostUrl = `https://discord.com/channels/${guildId}/${channelId}/${responseData.id}`;
        }
      }

      return {
        status: 'SUCCEEDED',
        externalPostId,
        externalPostUrl: externalPostUrl || undefined,
        platformMetadata: {
          channelId,
          isWebhook: Boolean(webhookUrl),
          discordMessageId: externalPostId,
          ...responseData,
        },
        publishedAt: new Date(),
        operationId: `discord-publish-${Date.now()}`,
      };
    } catch (error) {
      this.handleDiscordError(error);
    }
  }

  public async verify(externalPostId: string): Promise<boolean> {
    return Boolean(externalPostId && externalPostId.length > 0);
  }

  public async deletePost(externalPostId: string, accessToken: string): Promise<boolean> {
    if (!externalPostId) {
      return false;
    }

    try {
      if (accessToken.startsWith('http')) {
        // Webhook message deletion: DELETE /webhooks/{webhook.id}/{webhook.token}/messages/{message.id}
        const deleteUrl = `${accessToken}/messages/${externalPostId}`;
        const response = await axios.delete(deleteUrl, { timeout: 10000 });
        return response.status === 204 || response.status === 200;
      }

      // Bot message deletion requires channelId in format "channelId:messageId"
      const [channelId, messageId] = externalPostId.includes(':')
        ? externalPostId.split(':')
        : ['', externalPostId];

      if (!channelId) {
        return false;
      }

      const response = await axios.delete(
        `https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`,
        {
          headers: { Authorization: `Bot ${accessToken}` },
          timeout: 10000,
        }
      );

      return response.status === 204 || response.status === 200;
    } catch {
      return false;
    }
  }

  private parseColor(color: string | number): number {
    if (typeof color === 'number') {
      return color;
    }
    const sanitized = color.replace('#', '');
    const parsed = Number.parseInt(sanitized, 16);
    return Number.isNaN(parsed) ? 0x5865f2 : parsed;
  }

  private handleDiscordError(error: unknown): never {
    if (axios.isAxiosError(error) && error.response) {
      const status = error.response.status;
      const data = error.response.data as Record<string, unknown>;
      const message = String(data?.message || error.message);

      if (status === 400) {
        throw new PlatformError({
          message: `Discord 400 Bad Request: ${message}`,
          code: 'DISCORD_BAD_REQUEST',
          category: 'VALIDATION',
          retryable: false,
          platformCode: 'DISCORD',
        });
      }

      if (status === 401) {
        throw new PlatformError({
          message: `Discord Authentication failed (invalid bot token): ${message}`,
          code: 'DISCORD_AUTH_ERROR',
          category: 'AUTHENTICATION',
          retryable: false,
          platformCode: 'DISCORD',
        });
      }

      if (status === 403) {
        const discordCode = data?.code;
        if (discordCode === 50013 || message.toLowerCase().includes('missing permissions')) {
          throw new PlatformError({
            message: `Discord Bot is missing required permissions in this channel (requires: Send Messages, Embed Links, or Attach Files): ${message}`,
            code: 'DISCORD_MISSING_PERMISSIONS',
            category: 'AUTHORIZATION',
            retryable: false,
            platformCode: 'DISCORD',
          });
        }
        if (discordCode === 50001 || message.toLowerCase().includes('missing access')) {
          throw new PlatformError({
            message: `Discord Bot cannot access this channel (ensure bot has View Channels permission and channel is not private): ${message}`,
            code: 'DISCORD_MISSING_ACCESS',
            category: 'AUTHORIZATION',
            retryable: false,
            platformCode: 'DISCORD',
          });
        }
        throw new PlatformError({
          message: `Discord Authorization failed: ${message}`,
          code: 'DISCORD_AUTH_ERROR',
          category: 'AUTHORIZATION',
          retryable: false,
          platformCode: 'DISCORD',
        });
      }

      if (status === 404) {
        throw new PlatformError({
          message: `Discord Channel or Webhook not found: ${message}`,
          code: 'DISCORD_NOT_FOUND',
          category: 'VALIDATION',
          retryable: false,
          platformCode: 'DISCORD',
        });
      }

      if (status === 429) {
        const retryAfter = (data?.retry_after as number) || 5;
        throw new PlatformError({
          message: `Discord rate limited. Retry after ${retryAfter}s: ${message}`,
          code: 'DISCORD_RATE_LIMITED',
          category: 'RATE_LIMITED',
          retryable: true,
          retryAfterMs: Math.ceil(retryAfter * 1000),
          platformCode: 'DISCORD',
        });
      }

      if (status >= 500) {
        throw new PlatformError({
          message: `Discord Server Error (${status}): ${message}`,
          code: 'DISCORD_SERVER_ERROR',
          category: 'EXTERNAL',
          retryable: true,
          platformCode: 'DISCORD',
        });
      }
    }

    throw new PlatformError({
      message: error instanceof Error ? error.message : 'Unknown Discord dispatch failure',
      code: 'DISCORD_DISPATCH_FAILED',
      category: 'EXTERNAL',
      retryable: false,
      platformCode: 'DISCORD',
    });
  }
}
