import { describe, expect, it } from 'vitest';
import nextConfig from '../../next.config.js';

describe('web security headers', () => {
  it('applies a restrictive baseline to every route', async () => {
    const rules = await nextConfig.headers?.();
    const catchAll = rules?.find((rule) => rule.source === '/(.*)');
    const headers = Object.fromEntries(
      (catchAll?.headers ?? []).map(({ key, value }) => [key.toLowerCase(), value])
    );

    expect(headers['content-security-policy']).toContain("default-src 'self'");
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['permissions-policy']).toContain('camera=()');
  });
});
