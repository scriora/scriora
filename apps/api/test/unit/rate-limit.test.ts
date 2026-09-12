import { describe, expect, it } from 'vitest';
import { rateLimitKey } from '../../src/plugins/rate-limit.js';

describe('rateLimitKey', () => {
  it('does not let unauthenticated callers rotate buckets with credential headers', () => {
    const ip = '203.0.113.10';
    const firstRequest = { ip, headers: { authorization: 'Bearer attacker-a' } };
    const secondRequest = { ip, headers: { 'x-api-key': 'sk_attacker-b' } };

    expect(rateLimitKey(firstRequest)).toBe(`ip:${ip}`);
    expect(rateLimitKey(secondRequest)).toBe(`ip:${ip}`);
  });

  it('keeps ordinary requests on the same stable IP bucket', () => {
    expect(rateLimitKey({ ip: '127.0.0.1' })).toBe('ip:127.0.0.1');
  });
});
