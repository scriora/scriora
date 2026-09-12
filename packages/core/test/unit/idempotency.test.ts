import { describe, expect, it } from 'vitest';
import {
  isValidIdempotencyKey,
  parseIdempotencyKeyHeader,
  publicationIdempotencyKeys,
  resolveRequestIdempotencyKey,
} from '../../src/domain/publishing/idempotency.js';

const uuid = '44444444-4444-4444-8444-444444444444';
const accountId = '22222222-2222-4222-8222-222222222222';

describe('idempotency key helpers', () => {
  it('accepts UUIDs and rejects prefix / arbitrary header strings', () => {
    expect(isValidIdempotencyKey(uuid)).toBe(true);
    expect(isValidIdempotencyKey('not-a-uuid')).toBe(false);
    expect(isValidIdempotencyKey('44444444-4444')).toBe(false);
    expect(parseIdempotencyKeyHeader(undefined)).toEqual({ ok: true });
    expect(parseIdempotencyKeyHeader(uuid)).toEqual({ ok: true, key: uuid });
    expect(parseIdempotencyKeyHeader('abc')).toMatchObject({ ok: false });
    expect(parseIdempotencyKeyHeader(['abc'])).toMatchObject({ ok: false });
  });

  it('builds exact lookup keys rather than a prefix', () => {
    expect(publicationIdempotencyKeys(uuid, [accountId])).toEqual([uuid, `${uuid}:${accountId}`]);
  });

  it('prefers a valid header over the body key and generates otherwise', () => {
    expect(
      resolveRequestIdempotencyKey({
        header: uuid,
        bodyKey: '55555555-5555-4555-8555-555555555555',
      })
    ).toEqual({ ok: true, key: uuid });
    expect(
      resolveRequestIdempotencyKey({
        header: undefined,
        bodyKey: uuid,
      })
    ).toEqual({ ok: true, key: uuid });
    expect(
      resolveRequestIdempotencyKey({
        header: undefined,
        generate: () => '66666666-6666-4666-8666-666666666666',
      })
    ).toEqual({ ok: true, key: '66666666-6666-4666-8666-666666666666' });
    expect(resolveRequestIdempotencyKey({ header: 'short-prefix' })).toMatchObject({ ok: false });
  });
});
