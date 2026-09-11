import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SecretEnvelopeService } from '../../src/lib/secret-envelope.service.js';

describe('Worker — SecretEnvelopeService (AES-256-GCM)', () => {
  const masterKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const service = new SecretEnvelopeService(masterKey);

  it('correctly decrypts an AES-256-GCM encrypted envelope', () => {
    const rawData = {
      accessToken: 'access_token_secret_123',
      refreshToken: 'refresh_token_secret_456',
      accountName: 'Test LinkedIn Account',
    };

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(masterKey, 'hex'), iv);
    const plaintext = Buffer.from(JSON.stringify(rawData), 'utf8');
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();

    const envelopeBuffer = Buffer.concat([iv, tag, encrypted]);

    const decrypted = service.decrypt(envelopeBuffer);

    expect(decrypted.accessToken).toBe(rawData.accessToken);
    expect(decrypted.refreshToken).toBe(rawData.refreshToken);
    expect(decrypted.accountName).toBe(rawData.accountName);
  });

  it('throws an error when payload is too short or corrupted', () => {
    const corrupted = Buffer.from('short_bytes');
    expect(() => service.decrypt(corrupted)).toThrow();
  });

  it('throws immediately when MASTER_ENCRYPTION_KEY is missing and not passed in constructor', () => {
    const originalEnv = process.env.MASTER_ENCRYPTION_KEY;
    delete process.env.MASTER_ENCRYPTION_KEY;

    try {
      expect(() => new SecretEnvelopeService()).toThrow(
        'MASTER_ENCRYPTION_KEY is required and was not provided'
      );
    } finally {
      if (originalEnv) {
        process.env.MASTER_ENCRYPTION_KEY = originalEnv;
      }
    }
  });

  it('throws immediately when MASTER_ENCRYPTION_KEY has invalid length or format', () => {
    expect(() => new SecretEnvelopeService('tooshort')).toThrow(
      'Invalid MASTER_ENCRYPTION_KEY: must be a 64-character hexadecimal string'
    );
    expect(() => new SecretEnvelopeService('g'.repeat(64))).toThrow(
      'Invalid MASTER_ENCRYPTION_KEY: must be a 64-character hexadecimal string'
    );
  });

  it('throws when decrypted JSON does not conform to DecryptedTokensSchema', () => {
    const invalidData = {
      // missing accessToken
      refreshToken: 'refresh_only',
    };

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(masterKey, 'hex'), iv);
    const plaintext = Buffer.from(JSON.stringify(invalidData), 'utf8');
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    const envelopeBuffer = Buffer.concat([iv, tag, encrypted]);

    expect(() => service.decrypt(envelopeBuffer)).toThrow();
  });
});
