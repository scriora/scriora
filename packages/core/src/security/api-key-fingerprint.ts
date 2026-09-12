/**
 * API-key fingerprinting — high-entropy random secrets (`sk_live_…`), not passwords.
 *
 * User passwords stay on Argon2id in `apps/api` auth routes. API keys need a
 * fast, deterministic lookup hash. New rows use HMAC-SHA256 with a server
 * pepper (`API_KEY_PEPPER`, then `MCP_API_KEY_SALT` / `API_KEY_HASH_PEPPER`).
 *
 * Rows created before this helper stored SHA-256(rawKey). Lookups accept both
 * fingerprints so existing keys keep working; callers may rewrite `keyHash`
 * to the HMAC form after a successful match.
 */

import { hmacSha256Hex, sha256Hex } from './hmac-sha256.js';

const DEFAULT_API_KEY_PEPPER = 'scriora-api-key-v1';

export function resolveApiKeyPepper(env: NodeJS.ProcessEnv = process.env): string {
  const pepper =
    env.API_KEY_PEPPER?.trim() || env.MCP_API_KEY_SALT?.trim() || env.API_KEY_HASH_PEPPER?.trim();
  return pepper || DEFAULT_API_KEY_PEPPER;
}

/** Canonical stored fingerprint for newly issued API keys. */
export function hashApiKey(rawApiKey: string, env: NodeJS.ProcessEnv = process.env): string {
  return hmacSha256Hex(resolveApiKeyPepper(env), rawApiKey);
}

/** Pre-HMAC fingerprint for existing `ApiKey.keyHash` rows (not user passwords). */
export function legacySha256ApiKeyFingerprint(rawApiKey: string): string {
  return sha256Hex(rawApiKey);
}

/** HMAC fingerprint first, then the legacy SHA-256 digest if it differs. */
export function apiKeyFingerprintCandidates(
  rawApiKey: string,
  env: NodeJS.ProcessEnv = process.env
): string[] {
  const current = hashApiKey(rawApiKey, env);
  const legacy = legacySha256ApiKeyFingerprint(rawApiKey);
  return current === legacy ? [current] : [current, legacy];
}

export function isLegacyApiKeyFingerprint(
  storedHash: string,
  rawApiKey: string,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return (
    storedHash === legacySha256ApiKeyFingerprint(rawApiKey) &&
    storedHash !== hashApiKey(rawApiKey, env)
  );
}
