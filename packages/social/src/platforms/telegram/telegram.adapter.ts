import axios from 'axios';
import type {
  PlatformAdapter,
  PlatformCapabilities,
  PublishRequest,
  PublishResult,
  SocialPlatformType,
} from '../../contracts/platform.contract.js';
import { PlatformError } from '../../errors/social.error.js';

export interface TelegramMetadata {
  botToken?: string;
  chatId?: string;
  parseMode?: 'HTML' | 'MarkdownV2' | 'Markdown';
  disableWebPagePreview?: boolean;
}

export class TelegramAdapter implements PlatformAdapter {
  public readonly platform: SocialPlatformType = 'TELEGRAM';

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
      maxTextLength: 4096,
    };
  }

  public async publish(request: PublishRequest): Promise<PublishResult> {
    const meta = (request.metadata || {}) as TelegramMetadata;
    const botToken = meta.botToken || (request.metadata?.accessToken as string) || '';
    const chatId =
      meta.chatId ||
      (request.metadata?.chatId as string) ||
      (request.metadata?.externalAccountId as string) ||
      request.accountId;

    if (!botToken) {
      throw new PlatformError({
        message: 'Missing Telegram bot token in request credentials or metadata',
        code: 'MISSING_BOT_TOKEN',
        retryable: false,
      });
    }

    if (!chatId) {
      throw new PlatformError({
        message: 'Missing Telegram chatId or channel username in publish request',
        code: 'MISSING_CHAT_ID',
        retryable: false,
      });
    }

    const baseUrl = `https://api.telegram.org/bot${botToken}`;
    const text = request.text || '';
    const parseMode = meta.parseMode || 'HTML';

    try {
      let response: { data: { ok: boolean; result: any } };

      if (!request.mediaUrls || request.mediaUrls.length === 0) {
        // 1. Text Message
        response = await axios.post(`${baseUrl}/sendMessage`, {
          chat_id: chatId,
          text,
          parse_mode: parseMode,
          disable_web_page_preview: meta.disableWebPagePreview ?? false,
        });
      } else if (request.mediaUrls.length === 1) {
        // 2. Single Photo
        response = await axios.post(`${baseUrl}/sendPhoto`, {
          chat_id: chatId,
          photo: request.mediaUrls[0],
          caption: text.slice(0, 1024),
          parse_mode: parseMode,
        });
      } else {
        // 3. Media Group (Album)
        const mediaGroup = request.mediaUrls.map((url, index) => ({
          type: 'photo',
          media: url,
          ...(index === 0 ? { caption: text.slice(0, 1024), parse_mode: parseMode } : {}),
        }));

        response = await axios.post(`${baseUrl}/sendMediaGroup`, {
          chat_id: chatId,
          media: mediaGroup,
        });
      }

      if (!response.data.ok) {
        throw new PlatformError({
          message: 'Telegram API returned ok: false',
          code: 'TELEGRAM_API_ERROR',
          retryable: false,
        });
      }

      const messageResult = Array.isArray(response.data.result)
        ? response.data.result[0]
        : response.data.result;

      const messageId = messageResult.message_id;
      const externalPostId = `tg_${chatId}_${messageId}`;
      const chatUsername = messageResult.chat?.username || (typeof chatId === 'string' && chatId.startsWith('@') ? chatId.slice(1) : undefined);
      const externalPostUrl = chatUsername
        ? `https://t.me/${chatUsername}/${messageId}`
        : undefined;

      return {
        status: 'SUCCEEDED',
        externalPostId,
        externalPostUrl,
        publishedAt: new Date(),
        operationId: request.idempotencyKey,
        platformMetadata: {
          telegramMessageId: messageId,
          chatId,
          chatUsername,
        },
      };
    } catch (err: unknown) {
      if (err instanceof PlatformError) {
        throw err;
      }

      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const tgDesc = err.response?.data?.description || err.message;
        const retryable = status === 429 || (status !== undefined && status >= 500 && status < 600);
        const retryAfterSec = err.response?.data?.parameters?.retry_after;

        throw new PlatformError({
          message: `Telegram API error (${status}): ${tgDesc}`,
          code: status === 429 ? 'RATE_LIMITED' : status === 401 ? 'INVALID_BOT_TOKEN' : 'TELEGRAM_ERROR',
          retryable,
          platformCode: String(status),
          retryAfterMs: retryAfterSec ? retryAfterSec * 1000 : undefined,
        });
      }

      throw new PlatformError({
        message: err instanceof Error ? err.message : 'Unknown Telegram publish failure',
        code: 'UNKNOWN_ERROR',
        retryable: false,
      });
    }
  }

  public async verify(externalPostId: string): Promise<boolean> {
    if (!externalPostId) return false;
    return externalPostId.startsWith('tg_') || /^\d+$/.test(externalPostId);
  }

  public async deletePost(externalPostId: string, botToken: string, chatId?: string): Promise<boolean> {
    if (!externalPostId || !botToken) return false;

    let targetChatId = chatId;
    let messageId: string | number = externalPostId;

    if (externalPostId.startsWith('tg_')) {
      const parts = externalPostId.split('_');
      if (parts.length >= 3 && parts[1] && parts[2]) {
        targetChatId = parts[1];
        messageId = parts[2];
      }
    }

    if (!targetChatId) return false;

    try {
      const response = await axios.post(`https://api.telegram.org/bot${botToken}/deleteMessage`, {
        chat_id: targetChatId,
        message_id: Number(messageId),
      });
      return response.data?.ok === true;
    } catch {
      return false;
    }
  }
}
