import type { TelegramApprovalDeliveryRequest } from 'scriora-core';
import { TelegramBotService } from 'scriora-social';

export interface TelegramApprovalDeliveryResult {
  attempted: boolean;
  delivered: number;
}

/**
 * Best-effort Telegram C2 delivery for MCP create-post (same contract as the API).
 * Missing credentials or send failures must not fail post creation — the MCP
 * tool result remains the primary one-time token channel.
 */
export async function maybeSendTelegramApprovalRequests(
  requests: TelegramApprovalDeliveryRequest[]
): Promise<TelegramApprovalDeliveryResult> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID?.trim();

  if (!botToken || !adminChatId || requests.length === 0) {
    return { attempted: false, delivered: 0 };
  }

  let bot: TelegramBotService;
  try {
    bot = new TelegramBotService({ botToken, adminChatId });
  } catch {
    return { attempted: false, delivered: 0 };
  }

  let delivered = 0;
  for (const request of requests) {
    try {
      const messageId = await bot.sendApprovalRequest({
        chatId: adminChatId,
        approvalId: request.approvalId,
        token: request.token,
        title: request.title,
        body: request.body,
        platform: request.platform,
        scheduledAt: request.scheduledAt,
      });
      if (messageId != null) {
        delivered += 1;
      }
    } catch {
      // Best-effort: tool response remains the primary one-time delivery channel.
    }
  }

  return { attempted: true, delivered };
}
