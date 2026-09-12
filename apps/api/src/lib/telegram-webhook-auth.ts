import crypto from 'node:crypto';

/** Telegram Bot API header for `secret_token` (Fastify lowercases incoming names). */
export const TELEGRAM_WEBHOOK_SECRET_HEADER = 'x-telegram-bot-api-secret-token';

/**
 * Read the configured webhook secret. Whitespace-only is treated as unset
 * so an empty `.env` value cannot fail open.
 */
export function readTelegramWebhookSecret(env: NodeJS.ProcessEnv = process.env): string {
  return env.TELEGRAM_WEBHOOK_SECRET?.trim() ?? '';
}

/**
 * Compare the inbound Telegram secret-token header to the configured secret.
 * Empty expected secrets never match (fail-closed). Header arrays are rejected.
 */
export function telegramWebhookSecretMatches(
  provided: string | string[] | undefined,
  expected: string
): boolean {
  if (!expected || typeof provided !== 'string') {
    return false;
  }

  const providedBytes = Buffer.from(provided);
  const expectedBytes = Buffer.from(expected);
  if (providedBytes.length !== expectedBytes.length) {
    return false;
  }

  return crypto.timingSafeEqual(providedBytes, expectedBytes);
}
