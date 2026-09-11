import { describe, expect, it } from 'vitest';
import { MockLinkedInAdapter } from '../../src/platforms/linkedin/mock.adapter.js';

describe('MockLinkedInAdapter Unit Tests', () => {
  const adapter = new MockLinkedInAdapter();

  it('declares valid LinkedIn capabilities', () => {
    const caps = adapter.getCapabilities();
    expect(caps.supportsText).toBe(true);
    expect(caps.supportsCarousel).toBe(true);
    expect(caps.maxTextLength).toBe(3000);
  });

  it('returns valid SUCCEEDED PublishResult with canonical URN', async () => {
    const res = await adapter.publish({
      workspaceId: '11111111-1111-1111-1111-111111111111',
      accountId: 'li_acc_1',
      text: 'Hello world from Scriora!',
      mediaUrls: [],
      idempotencyKey: 'idemp_test_123',
      fingerprint: 'a'.repeat(64),
      metadata: {},
    });

    expect(res.status).toBe('SUCCEEDED');
    expect(res.externalPostId).toMatch(/^urn:li:share:/);
    expect(res.externalPostUrl).toContain('linkedin.com/feed/update/');
    expect(res.operationId).toBe('idemp_test_123');
  });

  it('verifies canonical URN', async () => {
    expect(await adapter.verify('urn:li:share:abc12345')).toBe(true);
    expect(await adapter.verify('twitter_post_123')).toBe(false);
  });
});
