import { describe, expect, it } from 'vitest';
import {
  readTelegramWebhookSecret,
  telegramWebhookSecretMatches,
} from '../../src/lib/telegram-webhook-auth.js';

describe('readTelegramWebhookSecret', () => {
  it('returns empty when unset', () => {
    expect(readTelegramWebhookSecret({})).toBe('');
  });

  it('treats blank and whitespace-only values as unset', () => {
    expect(readTelegramWebhookSecret({ TELEGRAM_WEBHOOK_SECRET: '' })).toBe('');
    expect(readTelegramWebhookSecret({ TELEGRAM_WEBHOOK_SECRET: '   ' })).toBe('');
  });

  it('trims a configured secret', () => {
    expect(readTelegramWebhookSecret({ TELEGRAM_WEBHOOK_SECRET: '  secret-token  ' })).toBe(
      'secret-token'
    );
  });
});

describe('telegramWebhookSecretMatches', () => {
  it('rejects an empty expected secret (fail-closed)', () => {
    expect(telegramWebhookSecretMatches('anything', '')).toBe(false);
  });

  it('rejects missing or non-string headers', () => {
    expect(telegramWebhookSecretMatches(undefined, 'secret-token')).toBe(false);
    expect(telegramWebhookSecretMatches(['secret-token'], 'secret-token')).toBe(false);
  });

  it('rejects a mismatched secret', () => {
    expect(telegramWebhookSecretMatches('wrong-token', 'secret-token')).toBe(false);
  });

  it('accepts an exact match', () => {
    expect(telegramWebhookSecretMatches('secret-token', 'secret-token')).toBe(true);
  });
});
