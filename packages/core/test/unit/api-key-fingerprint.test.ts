import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  apiKeyFingerprintCandidates,
  hashApiKey,
  isLegacyApiKeyFingerprint,
  legacySha256ApiKeyFingerprint,
  resolveApiKeyPepper,
} from '../../src/security/api-key-fingerprint.js';

const rawKey = 'sk_live_codeql_fingerprint_test';

describe('api-key fingerprint', () => {
  it('uses HMAC-SHA256 with API_KEY_PEPPER, not raw SHA-256, for new keys', () => {
    const env = { API_KEY_PEPPER: 'pepper-one' };
    const hmac = hashApiKey(rawKey, env);
    expect(hmac).toBe(crypto.createHmac('sha256', 'pepper-one').update(rawKey).digest('hex'));
    expect(hmac).not.toBe(crypto.createHash('sha256').update(rawKey).digest('hex'));
    expect(resolveApiKeyPepper(env)).toBe('pepper-one');
  });

  it('falls back to MCP_API_KEY_SALT then a stable default pepper', () => {
    expect(resolveApiKeyPepper({ MCP_API_KEY_SALT: 'mcp-salt' })).toBe('mcp-salt');
    expect(resolveApiKeyPepper({})).toBe('scriora-api-key-v1');
  });

  it('includes the legacy SHA-256 digest so pre-HMAC rows still verify', () => {
    const env = { API_KEY_PEPPER: 'pepper-two' };
    const candidates = apiKeyFingerprintCandidates(rawKey, env);
    const legacy = legacySha256ApiKeyFingerprint(rawKey);
    expect(candidates[0]).toBe(hashApiKey(rawKey, env));
    expect(candidates).toContain(legacy);
    expect(isLegacyApiKeyFingerprint(legacy, rawKey, env)).toBe(true);
    expect(isLegacyApiKeyFingerprint(hashApiKey(rawKey, env), rawKey, env)).toBe(false);
  });
});
