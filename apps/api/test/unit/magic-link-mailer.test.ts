import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildMagicLinkVerifyUrl,
  deliverMagicLink,
} from '../../src/lib/magic-link-mailer.js';

describe('deliverMagicLink', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.MAGIC_LINK_MAILER_URL;
  });

  it('builds verification links from the canonical API origin', () => {
    expect(
      buildMagicLinkVerifyUrl('raw token', {
        NODE_ENV: 'production',
        API_URL: 'https://api.scriora.example/base/',
      })
    ).toBe('https://api.scriora.example/v1/auth/verify?token=raw+token');
  });

  it('requires API_URL in production and uses an explicit development default', () => {
    expect(() => buildMagicLinkVerifyUrl('abc', { NODE_ENV: 'production' })).toThrow(
      'API_URL is required in production'
    );
    expect(buildMagicLinkVerifyUrl('abc', { NODE_ENV: 'development' })).toBe(
      'http://localhost:4000/v1/auth/verify?token=abc'
    );
  });

  it('returns note when no mailer hook is configured', async () => {
    const result = await deliverMagicLink({
      email: 'ops@scriora.io',
      url: 'https://app.example/v1/auth/verify?token=abc',
      expiresAt: new Date('2026-09-12T13:00:00.000Z'),
    });
    expect(result).toBe('note');
  });

  it('posts to MAGIC_LINK_MAILER_URL when configured', async () => {
    process.env.MAGIC_LINK_MAILER_URL = 'https://mailer.example/hooks/magic-link';
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 202 });
    vi.stubGlobal('fetch', fetchMock);

    const result = await deliverMagicLink({
      email: 'ops@scriora.io',
      url: 'https://app.example/v1/auth/verify?token=abc',
      expiresAt: new Date('2026-09-12T13:00:00.000Z'),
    });

    expect(result).toBe('hook');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://mailer.example/hooks/magic-link',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
