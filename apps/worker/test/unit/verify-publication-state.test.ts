import { describe, expect, it, vi } from 'vitest';
import {
  applyVerificationOutcome,
  probePublicationLive,
  resolveVerifyAccessToken,
  STATUSES_ELIGIBLE_FOR_VERIFY_UNKNOWN,
} from '../../src/lib/verify-publication-state.js';

function createDb(updateManyCount: number) {
  const updateMany = vi.fn().mockResolvedValue({ count: updateManyCount });
  const attemptUpdate = vi.fn().mockResolvedValue({});
  const transaction = vi.fn().mockImplementation(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[]));
  return {
    db: {
      publication: { updateMany },
      publishAttempt: { update: attemptUpdate },
      $transaction: transaction,
    },
    updateMany,
    attemptUpdate,
    transaction,
  };
}

describe('verify publication state (N6)', () => {
  it('treats adapter throws (including missing Instagram token) as transient', async () => {
    const probe = await probePublicationLive({
      externalPostId: '17841400000000001',
      platform: 'INSTAGRAM',
      hasAdapter: () => true,
      getAdapter: () => ({
        verify: async () => {
          throw new Error('MISSING_ACCESS_TOKEN');
        },
      }),
    });
    expect(probe).toEqual({ kind: 'transient', reason: 'MISSING_ACCESS_TOKEN' });
  });

  it('does not mutate publication or attempt on transient verify failure', async () => {
    const { db, updateMany, attemptUpdate, transaction } = createDb(1);
    const result = await applyVerificationOutcome(db, {
      publicationId: 'pub-1',
      probe: { kind: 'transient', reason: 'MISSING_ACCESS_TOKEN' },
      latestAttemptId: 'att-1',
    });
    expect(result).toEqual({ outcome: 'TRANSIENT_NOOP', publicationUpdated: false });
    expect(updateMany).not.toHaveBeenCalled();
    expect(attemptUpdate).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('CAS-preserves PUBLISHED when not_live cannot match eligible statuses', async () => {
    const { db, updateMany, attemptUpdate } = createDb(0);
    const result = await applyVerificationOutcome(db, {
      publicationId: 'pub-1',
      probe: { kind: 'not_live' },
      latestAttemptId: 'att-1',
    });
    expect(result).toEqual({ outcome: 'PRESERVED_PUBLISHED', publicationUpdated: false });
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 'pub-1',
        status: { in: STATUSES_ELIGIBLE_FOR_VERIFY_UNKNOWN },
      },
      data: { status: 'UNKNOWN_EXTERNAL_STATE' },
    });
    expect(attemptUpdate).not.toHaveBeenCalled();
  });

  it('marks UNKNOWN only from non-PUBLISHED eligible statuses', async () => {
    const { db, updateMany, attemptUpdate } = createDb(1);
    const result = await applyVerificationOutcome(db, {
      publicationId: 'pub-1',
      probe: { kind: 'not_live' },
      latestAttemptId: 'att-1',
    });
    expect(result).toEqual({ outcome: 'MARKED_UNKNOWN', publicationUpdated: true });
    expect(updateMany.mock.calls[0]![0].where.status.in).not.toContain('PUBLISHED');
    expect(attemptUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'att-1' },
        data: expect.objectContaining({ status: 'UNKNOWN_EXTERNAL_STATE' }),
      })
    );
  });

  it('confirms live with CAS that skips CANCELLED', async () => {
    const { db, updateMany, attemptUpdate } = createDb(1);
    const result = await applyVerificationOutcome(db, {
      publicationId: 'pub-1',
      probe: { kind: 'live' },
      latestAttemptId: 'att-1',
    });
    expect(result.outcome).toBe('CONFIRMED_LIVE');
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'pub-1', status: { not: 'CANCELLED' } },
      data: { status: 'PUBLISHED' },
    });
    expect(attemptUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'SUCCEEDED' }),
      })
    );
  });

  it('does not treat decrypt failure as a verify token', () => {
    expect(
      resolveVerifyAccessToken({
        envelopeData: { broken: true },
        decrypt: () => {
          throw new Error('bad envelope');
        },
      })
    ).toBeUndefined();
    expect(
      resolveVerifyAccessToken({
        envelopeData: { ok: true },
        decrypt: () => ({ accessToken: 'ig-token' }),
      })
    ).toBe('ig-token');
  });
});
