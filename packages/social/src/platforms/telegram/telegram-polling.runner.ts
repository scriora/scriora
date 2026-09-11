/**
 * packages/social/src/platforms/telegram/telegram-polling.runner.ts
 *
 * Long-polling runner for Telegram C2 Admin Bot.
 * Used for instant local development, CLI management, and autonomous background execution.
 */

import axios from 'axios';
import { TelegramBotService, type TelegramDbContext, type TelegramUpdate } from './telegram-bot.service.js';

export interface PollingRunnerOptions {
  botToken: string;
  adminChatId?: string | number;
  context?: TelegramDbContext;
  signal?: AbortSignal;
  pollTimeoutSec?: number;
  onError?: (err: unknown) => void;
}

export async function runTelegramPolling(options: PollingRunnerOptions): Promise<void> {
  const { botToken, adminChatId, context, signal, pollTimeoutSec = 25, onError } = options;
  const botService = new TelegramBotService({ botToken, adminChatId });
  const baseUrl = `https://api.telegram.org/bot${botToken}`;

  let offset = 0;

  console.log(`[Telegram C2] Polling runner started for admin ID: ${adminChatId || 'ANY'}`);

  while (!signal?.aborted) {
    try {
      const url = `${baseUrl}/getUpdates?offset=${offset}&timeout=${pollTimeoutSec}&allowed_updates=["message","callback_query"]`;
      const res = await axios.get<{ ok: boolean; result: TelegramUpdate[] }>(url, {
        timeout: (pollTimeoutSec + 10) * 1000,
      });

      if (res.data?.ok && Array.isArray(res.data.result)) {
        for (const update of res.data.result) {
          offset = Math.max(offset, update.update_id + 1);
          try {
            await botService.handleUpdate(update, context);
          } catch (updateErr) {
            console.error('[Telegram C2] Failed to process update:', updateErr);
          }
        }
      }
    } catch (err: unknown) {
      if (signal?.aborted) break;
      if (onError) onError(err);
      // Brief pause on network error before retrying
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  console.log('[Telegram C2] Polling runner stopped.');
}
