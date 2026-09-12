import { describe, expect, it, vi } from 'vitest';
import { applyApprovalDecisionToPublication } from '../../src/lib/approval-publication-decision.js';

function publicationTx(overrides: {
  updateManyCount: number;
  currentStatus?: string | null;
}) {
  return {
    publication: {
      updateMany: vi.fn().mockResolvedValue({ count: overrides.updateManyCount }),
      findUnique: vi.fn().mockResolvedValue(
        overrides.currentStatus === undefined
          ? null
          : overrides.currentStatus === null
            ? null
            : { status: overrides.currentStatus }
      ),
    },
    outboxCommand: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({
        id: 'outbox-1',
        availableAt: new Date(),
        status: 'PENDING',
      }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

describe('applyApprovalDecisionToPublication', () => {
  it('CAS-transitions REQUIRES_APPROVAL → READY and enqueues outbox', async () => {
    const tx = publicationTx({ updateManyCount: 1 });
    tx.publication.findUnique.mockResolvedValue({
      id: 'pub-1',
      workspaceId: 'ws-1',
      socialAccountId: 'acc-1',
      scheduledAt: null,
      idempotencyKey: 'idemp',
      fingerprint: 'f'.repeat(64),
      contentVariant: { body: 'Body', metadata: {} },
      socialAccount: { platform: 'X' },
      publishAttempts: [{ id: 'attempt-1' }],
    });

    const result = await applyApprovalDecisionToPublication(tx as any, 'pub-1', 'APPROVED');

    expect(tx.publication.updateMany).toHaveBeenCalledWith({
      where: { id: 'pub-1', status: 'REQUIRES_APPROVAL' },
      data: { status: 'READY' },
    });
    expect(result).toEqual(
      expect.objectContaining({
        applied: true,
        publicationStatus: 'READY',
        queued: expect.objectContaining({ created: true, outboxCommandId: 'outbox-1' }),
      })
    );
    expect(tx.outboxCommand.create).toHaveBeenCalled();
  });

  it('does not clobber PUBLISHED on APPROVED (N4)', async () => {
    const tx = publicationTx({ updateManyCount: 0, currentStatus: 'PUBLISHED' });

    const result = await applyApprovalDecisionToPublication(tx as any, 'pub-1', 'APPROVED');

    expect(result).toEqual({
      applied: false,
      publicationStatus: 'PUBLISHED',
      queued: { outboxCommandId: null, availableAt: null, status: null, created: false },
    });
    expect(tx.publication.updateMany).toHaveBeenCalledWith({
      where: { id: 'pub-1', status: 'REQUIRES_APPROVAL' },
      data: { status: 'READY' },
    });
    expect(tx.outboxCommand.create).not.toHaveBeenCalled();
    expect(tx.outboxCommand.deleteMany).not.toHaveBeenCalled();
  });

  it('does not clobber PUBLISHED on REJECTED (N4)', async () => {
    const tx = publicationTx({ updateManyCount: 0, currentStatus: 'PUBLISHED' });

    const result = await applyApprovalDecisionToPublication(tx as any, 'pub-1', 'REJECTED');

    expect(result.applied).toBe(false);
    expect(result.publicationStatus).toBe('PUBLISHED');
    expect(tx.publication.updateMany).toHaveBeenCalledWith({
      where: { id: 'pub-1', status: 'REQUIRES_APPROVAL' },
      data: { status: 'CANCELLED' },
    });
    expect(tx.outboxCommand.deleteMany).not.toHaveBeenCalled();
  });

  it('does not clobber CANCELLED / UNKNOWN_EXTERNAL_STATE', async () => {
    for (const status of ['CANCELLED', 'UNKNOWN_EXTERNAL_STATE', 'FAILED']) {
      const tx = publicationTx({ updateManyCount: 0, currentStatus: status });
      const result = await applyApprovalDecisionToPublication(tx as any, 'pub-1', 'APPROVED');
      expect(result.applied).toBe(false);
      expect(result.publicationStatus).toBe(status);
      expect(tx.outboxCommand.create).not.toHaveBeenCalled();
    }
  });
});
