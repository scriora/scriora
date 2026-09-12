import crypto from 'node:crypto';
import { z } from 'zod';

/** Same UUID rule as PublishPayloadSchema.idempotencyKey / Idempotency-Key. */
export const IdempotencyKeyFormatSchema = z.string().uuid();

export function isValidIdempotencyKey(value: string): boolean {
  return IdempotencyKeyFormatSchema.safeParse(value).success;
}

/**
 * Exact keys we persist and replay: the request key plus per-target
 * `${key}:${socialAccountId}` rows (unique constraint on publications).
 */
export function publicationIdempotencyKeys(
  requestKey: string,
  socialAccountIds: readonly string[]
): string[] {
  const keys = new Set<string>([requestKey]);
  for (const socialAccountId of socialAccountIds) {
    keys.add(`${requestKey}:${socialAccountId}`);
  }
  return [...keys];
}

export type ParsedIdempotencyKeyHeader =
  | { ok: true; key?: string }
  | { ok: false; message: string };

/**
 * Validate an HTTP Idempotency-Key header when present.
 * Absent header is valid (caller may fall back to body or a generated UUID).
 */
export function parseIdempotencyKeyHeader(header: unknown): ParsedIdempotencyKeyHeader {
  if (header === undefined) {
    return { ok: true };
  }

  const value = Array.isArray(header) ? header[0] : header;
  if (typeof value !== 'string' || !isValidIdempotencyKey(value)) {
    return {
      ok: false,
      message: 'Idempotency-Key header must be a UUID',
    };
  }

  return { ok: true, key: value };
}

export function resolveRequestIdempotencyKey(input: {
  header: unknown;
  bodyKey?: string | undefined;
  generate?: () => string;
}): { ok: true; key: string } | { ok: false; message: string } {
  const parsedHeader = parseIdempotencyKeyHeader(input.header);
  if (!parsedHeader.ok) {
    return parsedHeader;
  }
  if (parsedHeader.key) {
    return { ok: true, key: parsedHeader.key };
  }
  if (input.bodyKey) {
    return { ok: true, key: input.bodyKey };
  }
  return { ok: true, key: (input.generate ?? crypto.randomUUID)() };
}
