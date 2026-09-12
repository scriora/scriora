import { describe, expect, it, vi } from 'vitest';
import {
  abortPublishIfBlocked,
  BLOCKED_DISPATCH_PUBLICATION_STATUSES,
  buildOutboxSweepWhere,
  findActionableOutboxCommands,
  isPublicationDispatchBlocked,
} from '../../src/lib/publication-dispatch-guard.js';

describe('publication dispatch guard (§14 approval gate)', () => {
  it('blocks REQUIRES_APPROVAL and CANCELLED, and allows READY / SCHEDULED / PROCESSING', () => {
    expect(isPublicationDispatchBlocked('REQUIRES_APPROVAL')).toBe(true);
    expect(isPublicationDispatchBlocked('CANCELLED')).toBe(true);
    expect(isPublicationDispatchBlocked('READY')).toBe(false);
    expect(isPublicationDispatchBlocked('SCHEDULED')).toBe(false);
    expect(isPublicationDispatchBlocked('PROCESSING')).toBe(false);
    expect(isPublicationDispatchBlocked('PUBLISHED')).toBe(false);
    expect(isPublicationDispatchBlocked(undefined)).toBe(false);
    expect(BLOCKED_DISPATCH_PUBLICATION_STATUSES).toEqual(['REQUIRES_APPROVAL', 'CANCELLED']);
    expect(abortPublishIfBlocked('REQUIRES_APPROVAL')).toEqual({
      status: 'ABORTED',
      reason: 'Publication status REQUIRES_APPROVAL is not dispatchable',
    });
    expect(abortPublishIfBlocked('CANCELLED')).toEqual({
      status: 'ABORTED',
      reason: 'Publication status CANCELLED is not dispatchable',
    });
    expect(abortPublishIfBlocked('READY')).toBeNull();
  });

  it('sweep where clause excludes approval-held and cancelled publications', () => {
    const now = new Date('2026-09-12T12:00:00.000Z');
    const where = buildOutboxSweepWhere(now);

    expect(where.publication.status.notIn).toEqual(['REQUIRES_APPROVAL', 'CANCELLED']);
    expect(where.OR).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'PENDING',
          availableAt: { lte: now },
        }),
      ])
    );
  });

  it('findActionableOutboxCommands does not select PENDING rows held by REQUIRES_APPROVAL', async () => {
    const now = new Date('2026-09-12T12:00:00.000Z');
    const findMany = vi.fn().mockImplementation(async ({ where }) => {
      expect(where.publication.status.notIn).toContain('REQUIRES_APPROVAL');
      expect(where.publication.status.notIn).toContain('CANCELLED');
      // Simulate DB-side filter: a PENDING+available row on a held publication is excluded.
      return [];
    });

    const result = await findActionableOutboxCommands({ outboxCommand: { findMany } }, now);

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(result).toEqual([]);
    const where = findMany.mock.calls[0][0].where;
    expect(where.OR[0]).toEqual({ status: 'PENDING', availableAt: { lte: now } });
  });

  it('findActionableOutboxCommands still selects PENDING rows for READY publications', async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: 'outbox-ready-1' }]);

    const result = await findActionableOutboxCommands({ outboxCommand: { findMany } });

    expect(result).toEqual([{ id: 'outbox-ready-1' }]);
    expect(findMany.mock.calls[0][0].where.publication.status.notIn).toEqual([
      'REQUIRES_APPROVAL',
      'CANCELLED',
    ]);
  });

  it('scheduled+approval: sweep still requires availableAt <= now even after approval (READY)', () => {
    const now = new Date('2026-09-12T12:00:00.000Z');
    const where = buildOutboxSweepWhere(now);
    const pendingBranch = where.OR.find((clause) => 'availableAt' in clause);

    expect(pendingBranch).toEqual({
      status: 'PENDING',
      availableAt: { lte: now },
    });
  });
});
