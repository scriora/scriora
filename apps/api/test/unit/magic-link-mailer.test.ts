import { afterEach, describe, expect, it, vi } from 'vitest';
import { deliverMagicLink } from '../../src/lib/magic-link-mailer.js';

describe('deliverMagicLink', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.MAGIC_LINK_MAILER_URL;
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
