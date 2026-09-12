import crypto from 'node:crypto';

/**
 * 16 random bytes → 32 hex chars (128-bit). SHA-256 of this value is stored
 * at rest. Telegram inline buttons use `approve:${token}` / `reject:${token}`,
 * which must stay ≤ 64 UTF-8 bytes (8+32 / 7+32).
 */
export const APPROVAL_RAW_TOKEN_BYTES = 16;
export const APPROVAL_RAW_TOKEN_HEX_LENGTH = APPROVAL_RAW_TOKEN_BYTES * 2;
export const TELEGRAM_CALLBACK_DATA_MAX_BYTES = 64;
export const APPROVAL_TOKEN_TTL_MS = 72 * 60 * 60 * 1000;

export function hashApprovalToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function generateApprovalToken(): { rawToken: string; tokenHash: string } {
  const rawToken = crypto.randomBytes(APPROVAL_RAW_TOKEN_BYTES).toString('hex');
  return { rawToken, tokenHash: hashApprovalToken(rawToken) };
}

export function buildApprovalMagicLink(rawToken: string): string {
  const base = (
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    'http://localhost:4000'
  ).replace(/\/$/, '');
  return `${base}/v1/approve/${rawToken}`;
}

export function buildTelegramApprovalCallbackData(rawToken: string): {
  approve: string;
  reject: string;
} {
  return {
    approve: `approve:${rawToken}`,
    reject: `reject:${rawToken}`,
  };
}

export function telegramCallbackDataFits(rawToken: string): boolean {
  const { approve, reject } = buildTelegramApprovalCallbackData(rawToken);
  return (
    Buffer.byteLength(approve, 'utf8') <= TELEGRAM_CALLBACK_DATA_MAX_BYTES &&
    Buffer.byteLength(reject, 'utf8') <= TELEGRAM_CALLBACK_DATA_MAX_BYTES
  );
}
