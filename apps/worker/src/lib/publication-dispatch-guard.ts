/**
 * Publication statuses that must never be dispatched to a platform adapter.
 * REQUIRES_APPROVAL is the §14 human gate; CANCELLED is a terminal hold.
 */
export const BLOCKED_DISPATCH_PUBLICATION_STATUSES = ['REQUIRES_APPROVAL', 'CANCELLED'] as const;

export type BlockedDispatchPublicationStatus =
  (typeof BLOCKED_DISPATCH_PUBLICATION_STATUSES)[number];

export function isPublicationDispatchBlocked(
  status: string | null | undefined
): status is BlockedDispatchPublicationStatus {
  return status === 'REQUIRES_APPROVAL' || status === 'CANCELLED';
}

export function abortPublishIfBlocked(
  status: string | null | undefined
): { status: 'ABORTED'; reason: string } | null {
  if (!isPublicationDispatchBlocked(status)) {
    return null;
  }
  return {
    status: 'ABORTED',
    reason: `Publication status ${status} is not dispatchable`,
  };
}

export function buildOutboxSweepWhere(now: Date) {
  const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);

  return {
    attempts: { lt: 5 },
    publication: {
      status: { notIn: [...BLOCKED_DISPATCH_PUBLICATION_STATUSES] },
    },
    OR: [
      {
        status: 'PENDING' as const,
        availableAt: { lte: now },
      },
      {
        status: 'PROCESSING' as const,
        updatedAt: { lt: tenMinutesAgo },
      },
    ],
  };
}

export async function findActionableOutboxCommands(
  db: {
    outboxCommand: {
      findMany: (args: {
        where: ReturnType<typeof buildOutboxSweepWhere>;
        take: number;
        select: { id: true };
      }) => Promise<Array<{ id: string }>>;
    };
  },
  now = new Date()
): Promise<Array<{ id: string }>> {
  return db.outboxCommand.findMany({
    where: buildOutboxSweepWhere(now),
    take: 20,
    select: { id: true },
  });
}
