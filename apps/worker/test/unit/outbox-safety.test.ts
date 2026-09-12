import { describe, expect, it, vi } from 'vitest';
import {
  buildOutboxClaimWhere,
  claimOutboxCommand,
  isTerminalOutboxStatus,
  isTerminalPublicationStatus,
  prepareOutboxDispatch,
  recordPublishSuccessSafely,
  TERMINAL_OUTBOX_STATUSES,
  TERMINAL_PUBLICATION_STATUSES,
} from '../../src/lib/outbox-safety.js';
import { STALE_PROCESSING_MS } from '../../src/lib/publication-dispatch-guard.js';

function claimDb(overrides?: {
  updateManyCount?: number;
  latestStatus?: string;
  latestPublicationStatus?: string;
  publicationStatusAfterClaim?: string;
}) {
  const updateMany = vi.fn().mockResolvedValue({ count: overrides?.updateManyCount ?? 1 });
  const findUniqueOutbox = vi.fn().mockResolvedValue(
    overrides?.latestStatus
      ? {
          status: overrides.latestStatus,
          publication: { status: overrides.latestPublicationStatus ?? 'READY' },
        }
      : null
  );
  const findUniquePublication = vi.fn().mockResolvedValue({
    status: overrides?.publicationStatusAfterClaim ?? 'READY',
  });

  return {
    db: {
      outboxCommand: { updateMany, findUnique: findUniqueOutbox },
      publication: { findUnique: findUniquePublication },
    },
    updateMany,
    findUniqueOutbox,
    findUniquePublication,
  };
}

describe('outbox claim / terminal-state safety', () => {
  it('treats PUBLISHED and FAILED outbox rows as terminal no-ops', () => {
    expect(isTerminalOutboxStatus('PUBLISHED')).toBe(true);
    expect(isTerminalOutboxStatus('FAILED')).toBe(true);
    expect(isTerminalOutboxStatus('PENDING')).toBe(false);
    expect(isTerminalOutboxStatus('PROCESSING')).toBe(false);
    expect(TERMINAL_OUTBOX_STATUSES).toEqual(['PUBLISHED', 'FAILED']);
  });

  it('treats PUBLISHED / FAILED / CANCELLED / UNKNOWN_EXTERNAL_STATE publications as terminal', () => {
    expect(isTerminalPublicationStatus('PUBLISHED')).toBe(true);
    expect(isTerminalPublicationStatus('FAILED')).toBe(true);
    expect(isTerminalPublicationStatus('CANCELLED')).toBe(true);
    expect(isTerminalPublicationStatus('UNKNOWN_EXTERNAL_STATE')).toBe(true);
    expect(isTerminalPublicationStatus('READY')).toBe(false);
    expect(isTerminalPublicationStatus('PROCESSING')).toBe(false);
    expect(TERMINAL_PUBLICATION_STATUSES).toEqual([
      'PUBLISHED',
      'FAILED',
      'CANCELLED',
      'UNKNOWN_EXTERNAL_STATE',
    ]);
  });

  it('CAS claim where clause allows PENDING or stale PROCESSING only', () => {
    const now = new Date('2026-09-12T12:00:00.000Z');
    const where = buildOutboxClaimWhere('outbox-1', now);

    expect(where).toEqual({
      id: 'outbox-1',
      OR: [
        { status: 'PENDING' },
        {
          status: 'PROCESSING',
          updatedAt: { lt: new Date(now.getTime() - STALE_PROCESSING_MS) },
        },
      ],
    });
  });

  it('claimOutboxCommand succeeds only when updateMany matches one row', async () => {
    const won = claimDb({ updateManyCount: 1 });
    await expect(claimOutboxCommand(won.db, 'outbox-1')).resolves.toBe(true);

    const lost = claimDb({ updateManyCount: 0 });
    await expect(claimOutboxCommand(lost.db, 'outbox-1')).resolves.toBe(false);
    expect(lost.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'outbox-1',
          OR: expect.arrayContaining([
            { status: 'PENDING' },
            expect.objectContaining({
              status: 'PROCESSING',
              updatedAt: { lt: expect.any(Date) },
            }),
          ]),
        }),
        data: expect.objectContaining({
          status: 'PROCESSING',
          attempts: { increment: 1 },
        }),
      })
    );
  });

  it('replay on PUBLISHED outbox is a no-op before any claim or adapter work', async () => {
    const { db, updateMany } = claimDb();

    const result = await prepareOutboxDispatch(db, {
      outboxCommandId: 'outbox-published',
      outboxStatus: 'PUBLISHED',
      publicationId: 'pub-1',
      publicationStatus: 'PUBLISHED',
    });

    expect(result).toEqual({
      action: 'NOOP',
      reason: 'Outbox already PUBLISHED',
      outboxStatus: 'PUBLISHED',
    });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('replay on FAILED outbox is also a terminal no-op', async () => {
    const { db, updateMany } = claimDb();

    const result = await prepareOutboxDispatch(db, {
      outboxCommandId: 'outbox-failed',
      outboxStatus: 'FAILED',
      publicationId: 'pub-1',
      publicationStatus: 'FAILED',
    });

    expect(result.action).toBe('NOOP');
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('concurrent claim fails closed when another worker already holds a fresh PROCESSING row', async () => {
    const { db, updateMany } = claimDb({
      updateManyCount: 0,
      latestStatus: 'PROCESSING',
      latestPublicationStatus: 'READY',
    });

    const result = await prepareOutboxDispatch(db, {
      outboxCommandId: 'outbox-race',
      outboxStatus: 'PENDING',
      publicationId: 'pub-1',
      publicationStatus: 'READY',
    });

    expect(result).toEqual({
      action: 'CLAIM_FAILED',
      reason: 'Outbox claim lost (status=PROCESSING)',
    });
    expect(updateMany).toHaveBeenCalledTimes(1);
  });

  it('lost claim against an already-PUBLISHED row fails closed as a no-op', async () => {
    const { db } = claimDb({
      updateManyCount: 0,
      latestStatus: 'PUBLISHED',
      latestPublicationStatus: 'PUBLISHED',
    });

    const result = await prepareOutboxDispatch(db, {
      outboxCommandId: 'outbox-replay',
      outboxStatus: 'PENDING',
      publicationId: 'pub-1',
      publicationStatus: 'READY',
    });

    expect(result.action).toBe('NOOP');
    expect(result).toMatchObject({ outboxStatus: 'PUBLISHED' });
  });

  it('abort after winning claim if publication was cancelled before adapter.publish', async () => {
    const { db, updateMany } = claimDb({
      updateManyCount: 1,
      publicationStatusAfterClaim: 'CANCELLED',
    });

    const result = await prepareOutboxDispatch(db, {
      outboxCommandId: 'outbox-cancel-race',
      outboxStatus: 'PENDING',
      publicationId: 'pub-1',
      publicationStatus: 'READY',
    });

    expect(result).toEqual({
      action: 'ABORT',
      reason: 'Publication status CANCELLED is not dispatchable',
    });
    expect(updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: 'outbox-cancel-race', status: 'PROCESSING' },
        data: expect.objectContaining({ status: 'FAILED' }),
      })
    );
  });

  it('proceeds when claim wins and publication is still dispatchable', async () => {
    const { db } = claimDb({ updateManyCount: 1, publicationStatusAfterClaim: 'READY' });

    const result = await prepareOutboxDispatch(db, {
      outboxCommandId: 'outbox-ok',
      outboxStatus: 'PENDING',
      publicationId: 'pub-1',
      publicationStatus: 'READY',
    });

    expect(result).toEqual({ action: 'PROCEED' });
  });
});

describe('recordPublishSuccessSafely', () => {
  function successDb(opts: {
    publishCount: number;
    currentStatus?: string;
  }) {
    const publicationUpdateMany = vi
      .fn()
      .mockResolvedValueOnce({ count: opts.publishCount })
      .mockResolvedValue({ count: 1 });
    const publicationFindUnique = vi.fn().mockResolvedValue(
      opts.currentStatus ? { status: opts.currentStatus } : null
    );
    const publishAttemptUpdate = vi.fn().mockResolvedValue({});
    const outboxUpdate = vi.fn().mockResolvedValue({});
    const tx = {
      publication: { updateMany: publicationUpdateMany, findUnique: publicationFindUnique },
      publishAttempt: { update: publishAttemptUpdate },
      outboxCommand: { update: outboxUpdate },
    };
    const db = {
      $transaction: vi.fn(async (fn: (tx: typeof tx) => unknown) => fn(tx)),
      publication: tx.publication,
      publishAttempt: tx.publishAttempt,
      outboxCommand: tx.outboxCommand,
    };
    return { db, tx, publicationUpdateMany, publishAttemptUpdate, outboxUpdate };
  }

  const input = {
    publicationId: 'pub-1',
    outboxCommandId: 'outbox-1',
    publishAttemptId: 'attempt-1',
    externalPostId: 'ext-1',
    externalPostUrl: 'https://example.test/p/1',
  };

  it('writes PUBLISHED when the publication is still non-terminal', async () => {
    const { db, publicationUpdateMany, publishAttemptUpdate, outboxUpdate } = successDb({
      publishCount: 1,
    });

    const result = await recordPublishSuccessSafely(db as any, input);

    expect(result).toEqual({ outcome: 'PUBLISHED' });
    expect(publicationUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'pub-1',
          status: { notIn: ['PUBLISHED', 'FAILED', 'CANCELLED', 'UNKNOWN_EXTERNAL_STATE'] },
        },
        data: expect.objectContaining({ status: 'PUBLISHED' }),
      })
    );
    expect(publishAttemptUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'SUCCEEDED' }),
      })
    );
    expect(outboxUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PUBLISHED' }),
      })
    );
  });

  it('cancel/reject race does not overwrite CANCELLED with PUBLISHED', async () => {
    const { db, publicationUpdateMany, publishAttemptUpdate, outboxUpdate } = successDb({
      publishCount: 0,
      currentStatus: 'CANCELLED',
    });

    const result = await recordPublishSuccessSafely(db as any, input);

    expect(result).toEqual({ outcome: 'CONFLICT_TERMINAL', publicationStatus: 'CANCELLED' });
    expect(publicationUpdateMany.mock.calls[0][0].data.status).toBe('PUBLISHED');
    expect(publicationUpdateMany.mock.calls[0][0].where.status.notIn).toContain('CANCELLED');
    expect(publicationUpdateMany.mock.calls[1][0]).toEqual({
      where: { id: 'pub-1', status: 'CANCELLED' },
      data: { status: 'UNKNOWN_EXTERNAL_STATE' },
    });
    expect(publicationUpdateMany.mock.calls.some((call) => call[0].where.id === 'pub-1' && call[0].data.status === 'PUBLISHED' && !call[0].where.status)).toBe(false);
    expect(publishAttemptUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'UNKNOWN_EXTERNAL_STATE',
          errorCode: 'UNKNOWN_EXTERNAL_STATE',
        }),
      })
    );
    expect(outboxUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          lastError: expect.objectContaining({
            code: 'UNKNOWN_EXTERNAL_STATE',
            publicationStatus: 'CANCELLED',
          }),
        }),
      })
    );
  });

  it('does not overwrite an already-PUBLISHED publication on late success', async () => {
    const { db, publicationUpdateMany } = successDb({
      publishCount: 0,
      currentStatus: 'PUBLISHED',
    });

    const result = await recordPublishSuccessSafely(db as any, input);

    expect(result).toEqual({ outcome: 'ALREADY_PUBLISHED' });
    expect(publicationUpdateMany).toHaveBeenCalledTimes(1);
    expect(publicationUpdateMany.mock.calls[0][0].data.status).toBe('PUBLISHED');
    expect(publicationUpdateMany.mock.calls[0][0].where.status).toEqual({
      notIn: ['PUBLISHED', 'FAILED', 'CANCELLED', 'UNKNOWN_EXTERNAL_STATE'],
    });
  });
});
