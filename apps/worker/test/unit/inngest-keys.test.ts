import { describe, expect, it } from 'vitest';
import { resolveInngestKeys } from '../../src/inngest/keys.js';

describe('resolveInngestKeys', () => {
  it('fails closed in production when INNGEST_SIGNING_KEY is missing', () => {
    expect(() =>
      resolveInngestKeys({
        NODE_ENV: 'production',
        INNGEST_EVENT_KEY: 'prod-event-key',
      })
    ).toThrow(/INNGEST_SIGNING_KEY/);
  });

  it('fails closed in production when INNGEST_EVENT_KEY is missing', () => {
    expect(() =>
      resolveInngestKeys({
        NODE_ENV: 'production',
        INNGEST_SIGNING_KEY: 'prod-signing-key',
      })
    ).toThrow(/INNGEST_EVENT_KEY/);
  });

  it('returns both keys when configured', () => {
    expect(
      resolveInngestKeys({
        NODE_ENV: 'production',
        INNGEST_EVENT_KEY: 'prod-event-key',
        INNGEST_SIGNING_KEY: 'prod-signing-key',
      })
    ).toEqual({
      eventKey: 'prod-event-key',
      signingKey: 'prod-signing-key',
    });
  });

  it('falls back in non-production when keys are absent', () => {
    expect(resolveInngestKeys({ NODE_ENV: 'test' })).toEqual({
      eventKey: 'dev-local-key',
      signingKey: undefined,
    });
  });
});
