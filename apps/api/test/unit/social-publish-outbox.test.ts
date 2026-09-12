import { describe, expect, it, vi } from 'vitest';
import {
  buildSocialPublishOutboxPayload,
  enqueueApprovedPublicationOutbox,
  mediaUrlsFromVariantMetadata,
  platformOptionsFromVariantMetadata,
} from '../../src/lib/social-publish-outbox.js';

describe('social-publish-outbox helpers', () => {
  it('splits variant metadata into mediaUrls and platform options', () => {
    const metadata = {
      mediaUrls: ['https://cdn.example.com/a.png', 12, null],
      platform: 'LINKEDIN',
      options: { visibility: 'PUBLIC' },
    };

    expect(mediaUrlsFromVariantMetadata(metadata)).toEqual(['https://cdn.example.com/a.png']);
    expect(platformOptionsFromVariantMetadata(metadata)).toEqual({
      platform: 'LINKEDIN',
      options: { visibility: 'PUBLIC' },
    });
    expect(mediaUrlsFromVariantMetadata(null)).toEqual([]);
    expect(platformOptionsFromVariantMetadata(undefined)).toEqual({});
  });

  it('reuses an existing PENDING outbox instead of creating a second command', async () => {
    const tx = {
      outboxCommand: {
        findFirst: vi.fn().mockResolvedValue({ id: 'existing-outbox' }),
        create: vi.fn(),
      },
      publication: { findUnique: vi.fn() },
    };

    const result = await enqueueApprovedPublicationOutbox(tx as any, 'pub-1');

    expect(result).toEqual({ outboxCommandId: 'existing-outbox' });
    expect(tx.outboxCommand.create).not.toHaveBeenCalled();
    expect(tx.publication.findUnique).not.toHaveBeenCalled();
  });

  it('creates a PENDING outbox after approval using publication payload and scheduledAt', async () => {
    const scheduledAt = new Date('2026-09-13T09:00:00.000Z');
    const tx = {
      outboxCommand: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'new-outbox' }),
      },
      publication: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'pub-1',
          workspaceId: 'ws-1',
          socialAccountId: 'acc-1',
          scheduledAt,
          idempotencyKey: 'key-1',
          fingerprint: 'fp-1',
          contentVariant: {
            body: 'Hello',
            metadata: { mediaUrls: ['https://cdn.example.com/a.png'] },
          },
          socialAccount: { platform: 'X' },
          publishAttempts: [{ id: 'attempt-1' }],
        }),
      },
    };

    const result = await enqueueApprovedPublicationOutbox(tx as any, 'pub-1');

    expect(result).toEqual({ outboxCommandId: 'new-outbox' });
    expect(tx.outboxCommand.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        publicationId: 'pub-1',
        publishAttemptId: 'attempt-1',
        status: 'PENDING',
        availableAt: scheduledAt,
        payload: buildSocialPublishOutboxPayload({
          workspaceId: 'ws-1',
          body: 'Hello',
          platform: 'X',
          socialAccountId: 'acc-1',
          mediaUrls: ['https://cdn.example.com/a.png'],
          idempotencyKey: 'key-1',
          fingerprint: 'fp-1',
          options: {},
        }),
      }),
    });
  });
});
