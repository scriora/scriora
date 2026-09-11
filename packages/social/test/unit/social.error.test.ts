import { describe, expect, it } from 'vitest';
import { NormalizedSocialError } from '../../src/errors/social.error.js';

describe('NormalizedSocialError Unit Tests', () => {
  it('initializes with default retryable for RATE_LIMITED and TIMEOUT', () => {
    const rateLimitErr = new NormalizedSocialError({
      message: 'Rate limit exceeded',
      category: 'RATE_LIMITED',
    });
    expect(rateLimitErr.name).toBe('NormalizedSocialError');
    expect(rateLimitErr.message).toBe('Rate limit exceeded');
    expect(rateLimitErr.category).toBe('RATE_LIMITED');
    expect(rateLimitErr.retryable).toBe(true);
    expect(rateLimitErr.retryAfter).toBeNull();
    expect(rateLimitErr.platformCode).toBeUndefined();

    const timeoutErr = new NormalizedSocialError({
      message: 'Connection timed out',
      category: 'TIMEOUT',
    });
    expect(timeoutErr.retryable).toBe(true);
  });

  it('initializes with default non-retryable for other categories', () => {
    const authErr = new NormalizedSocialError({
      message: 'Unauthorized token',
      category: 'AUTHENTICATION',
    });
    expect(authErr.retryable).toBe(false);
  });

  it('allows explicit overrides for retryable, retryAfter, and platformCode', () => {
    const retryDate = new Date();
    const customErr = new NormalizedSocialError({
      message: 'Custom platform error',
      category: 'EXTERNAL',
      retryable: true,
      retryAfter: retryDate,
      platformCode: 'ERR_PLATFORM_429',
    });
    expect(customErr.retryable).toBe(true);
    expect(customErr.retryAfter).toBe(retryDate);
    expect(customErr.platformCode).toBe('ERR_PLATFORM_429');
  });
});
