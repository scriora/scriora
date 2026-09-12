import crypto from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  APPROVAL_RAW_TOKEN_HEX_LENGTH,
  buildApprovalMagicLink,
  buildTelegramApprovalCallbackData,
  generateApprovalToken,
  hashApprovalToken,
  TELEGRAM_CALLBACK_DATA_MAX_BYTES,
  telegramCallbackDataFits,
} from '../../src/lib/approval-token.js';

describe('approval-token helpers', () => {
  afterEach(() => {
    delete process.env.API_URL;
    delete process.env.NEXT_PUBLIC_API_URL;
  });

  it('generates a 32-hex one-time token and stores only its SHA-256 hash', () => {
    const { rawToken, tokenHash } = generateApprovalToken();

    expect(rawToken).toMatch(new RegExp(`^[0-9a-f]{${APPROVAL_RAW_TOKEN_HEX_LENGTH}}$`));
    expect(rawToken).toHaveLength(32);
    expect(tokenHash).toBe(crypto.createHash('sha256').update(rawToken).digest('hex'));
    expect(tokenHash).toHaveLength(64);
    expect(tokenHash).not.toBe(rawToken);
    expect(hashApprovalToken(rawToken)).toBe(tokenHash);
  });

  it('produces Telegram callback_data within the 64-byte Bot API limit', () => {
    const { rawToken } = generateApprovalToken();
    const { approve, reject } = buildTelegramApprovalCallbackData(rawToken);

    expect(telegramCallbackDataFits(rawToken)).toBe(true);
    expect(Buffer.byteLength(approve, 'utf8')).toBeLessThanOrEqual(
      TELEGRAM_CALLBACK_DATA_MAX_BYTES
    );
    expect(Buffer.byteLength(reject, 'utf8')).toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_MAX_BYTES);
    expect(approve).toBe(`approve:${rawToken}`);
    expect(reject).toBe(`reject:${rawToken}`);
  });

  it('documents that a 64-hex token (32 raw bytes) overflows Telegram callback_data', () => {
    const legacyToken = crypto.randomBytes(32).toString('hex');
    expect(legacyToken).toHaveLength(64);
    expect(telegramCallbackDataFits(legacyToken)).toBe(false);
    expect(Buffer.byteLength(`approve:${legacyToken}`, 'utf8')).toBeGreaterThan(
      TELEGRAM_CALLBACK_DATA_MAX_BYTES
    );
  });

  it('builds a public magic-link URL that embeds the raw token once', () => {
    process.env.API_URL = 'https://api.scriora.test/';
    const { rawToken } = generateApprovalToken();
    expect(buildApprovalMagicLink(rawToken)).toBe(
      `https://api.scriora.test/v1/approve/${rawToken}`
    );
  });
});
