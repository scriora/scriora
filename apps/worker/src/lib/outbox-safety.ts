import type { Prisma, PrismaClient } from 'scriora-core';
import { abortPublishIfBlocked, STALE_PROCESSING_MS } from './publication-dispatch-guard.js';

export const TERMINAL_OUTBOX_STATUSES = ['PUBLISHED', 'FAILED'] as const;
export type TerminalOutboxStatus = (typeof TERMINAL_OUTBOX_STATUSES)[number];

export const TERMINAL_PUBLICATION_STATUSES = [
  'PUBLISHED',
  'FAILED',
  'CANCELLED',
  'UNKNOWN_EXTERNAL_STATE',
] as const;
export type TerminalPublicationStatus = (typeof TERMINAL_PUBLICATION_STATUSES)[number];

export function isTerminalOutboxStatus(
  status: string | null | undefined
): status is TerminalOutboxStatus {
  return status === 'PUBLISHED' || status === 'FAILED';
}

export function isTerminalPublicationStatus(
  status: string | null | undefined
): status is TerminalPublicationStatus {
  return (
    status === 'PUBLISHED' ||
    status === 'FAILED' ||
    status === 'CANCELLED' ||
    status === 'UNKNOWN_EXTERNAL_STATE'
  );
}

export function buildOutboxClaimWhere(outboxCommandId: string, now = new Date()) {
  const staleBefore = new Date(now.getTime() - STALE_PROCESSING_MS);
  return {
    id: outboxCommandId,
    OR: [
      { status: 'PENDING' as const },
      { status: 'PROCESSING' as const, updatedAt: { lt: staleBefore } },
    ],
  };
}

type ClaimUpdateManyArgs = {
  where: ReturnType<typeof buildOutboxClaimWhere> | { id: string; status: 'PROCESSING' };
  data:
    | {
        status: 'PROCESSING';
        claimedAt: Date;
        attempts: { increment: number };
      }
    | {
        status: 'FAILED';
        lastError: Prisma.InputJsonValue;
        processedAt: Date;
      };
};

export type OutboxSafetyClient = {
  outboxCommand: {
    updateMany: (args: ClaimUpdateManyArgs) => Promise<{ count: number }>;
    findUnique: (args: {
      where: { id: string };
      select: { status: true; publication: { select: { status: true } } };
    }) => Promise<{
      status: string;
      publication: { status: string } | null;
    } | null>;
  };
  publication: {
    findUnique: (args: {
      where: { id: string };
      select: { status: true };
    }) => Promise<{ status: string } | null>;
  };
};

/**
 * Compare-and-swap claim: only PENDING, or PROCESSING that is stale enough to
 * match the sweep reclaim window, can move to PROCESSING.
 */
export async function claimOutboxCommand(
  db: Pick<OutboxSafetyClient, 'outboxCommand'>,
  outboxCommandId: string,
  now = new Date()
): Promise<boolean> {
  const result = await db.outboxCommand.updateMany({
    where: buildOutboxClaimWhere(outboxCommandId, now),
    data: {
      status: 'PROCESSING',
      claimedAt: now,
      attempts: { increment: 1 },
    },
  });
  return result.count === 1;
}

export type PrepareOutboxDispatchResult =
  | { action: 'NOOP'; reason: string; outboxStatus: string }
  | { action: 'ABORT'; reason: string }
  | { action: 'CLAIM_FAILED'; reason: string }
  | { action: 'PROCEED' };

export async function failClaimedOutbox(
  db: Pick<OutboxSafetyClient, 'outboxCommand'>,
  outboxCommandId: string,
  lastError: Prisma.InputJsonValue
): Promise<void> {
  await db.outboxCommand.updateMany({
    where: { id: outboxCommandId, status: 'PROCESSING' },
    data: {
      status: 'FAILED',
      lastError,
      processedAt: new Date(),
    },
  });
}

/**
 * Pre-adapter gate used by publish.job:
 * terminal outbox → no-op; blocked publication → abort; CAS claim or fail closed.
 */
export async function prepareOutboxDispatch(
  db: OutboxSafetyClient,
  input: {
    outboxCommandId: string;
    outboxStatus: string;
    publicationId: string | null | undefined;
    publicationStatus: string | null | undefined;
  },
  now = new Date()
): Promise<PrepareOutboxDispatchResult> {
  if (isTerminalOutboxStatus(input.outboxStatus)) {
    return {
      action: 'NOOP',
      reason: `Outbox already ${input.outboxStatus}`,
      outboxStatus: input.outboxStatus,
    };
  }

  const blocked = abortPublishIfBlocked(input.publicationStatus);
  if (blocked) {
    return { action: 'ABORT', reason: blocked.reason };
  }

  const claimed = await claimOutboxCommand(db, input.outboxCommandId, now);
  if (!claimed) {
    const latest = await db.outboxCommand.findUnique({
      where: { id: input.outboxCommandId },
      select: { status: true, publication: { select: { status: true } } },
    });
    if (latest && isTerminalOutboxStatus(latest.status)) {
      return {
        action: 'NOOP',
        reason: `Outbox already ${latest.status}`,
        outboxStatus: latest.status,
      };
    }
    return {
      action: 'CLAIM_FAILED',
      reason: `Outbox claim lost (status=${latest?.status ?? 'missing'})`,
    };
  }

  if (input.publicationId) {
    const latestPublication = await db.publication.findUnique({
      where: { id: input.publicationId },
      select: { status: true },
    });
    const afterClaimBlock = abortPublishIfBlocked(latestPublication?.status);
    if (afterClaimBlock) {
      await failClaimedOutbox(db, input.outboxCommandId, {
        code: 'DISPATCH_ABORTED',
        message: afterClaimBlock.reason,
      });
      return { action: 'ABORT', reason: afterClaimBlock.reason };
    }
  }

  return { action: 'PROCEED' };
}

export type RecordPublishSuccessOutcome =
  | { outcome: 'PUBLISHED' }
  | { outcome: 'ALREADY_PUBLISHED' }
  | { outcome: 'CONFLICT_TERMINAL'; publicationStatus: string };

export type RecordPublishSuccessInput = {
  publicationId: string;
  outboxCommandId: string;
  publishAttemptId: string;
  externalPostId?: string | null;
  externalPostUrl?: string | null;
};

export type RecordPublishSuccessClient = Pick<PrismaClient, '$transaction'> & {
  publication: {
    updateMany: PrismaClient['publication']['updateMany'];
    findUnique: PrismaClient['publication']['findUnique'];
  };
  publishAttempt: { update: PrismaClient['publishAttempt']['update'] };
  outboxCommand: { update: PrismaClient['outboxCommand']['update'] };
};

/**
 * Write PUBLISHED only when the publication is still non-terminal.
 * A late success after CANCEL/REJECT/FAILED must not look like a clean publish.
 */
export async function recordPublishSuccessSafely(
  db: RecordPublishSuccessClient,
  input: RecordPublishSuccessInput,
  now = new Date()
): Promise<RecordPublishSuccessOutcome> {
  return db.$transaction(async (tx) => {
    const published = await tx.publication.updateMany({
      where: {
        id: input.publicationId,
        status: { notIn: [...TERMINAL_PUBLICATION_STATUSES] },
      },
      data: {
        status: 'PUBLISHED',
        publishedAt: now,
        externalPostId: input.externalPostId || null,
        externalPostUrl: input.externalPostUrl || null,
      },
    });

    if (published.count === 1) {
      await tx.publishAttempt.update({
        where: { id: input.publishAttemptId },
        data: {
          status: 'SUCCEEDED',
          externalId: input.externalPostId || null,
          externalUrl: input.externalPostUrl || null,
          completedAt: now,
        },
      });
      await tx.outboxCommand.update({
        where: { id: input.outboxCommandId },
        data: {
          status: 'PUBLISHED',
          processedAt: now,
        },
      });
      return { outcome: 'PUBLISHED' };
    }

    const current = await tx.publication.findUnique({
      where: { id: input.publicationId },
      select: { status: true },
    });
    const publicationStatus = current?.status ?? 'MISSING';

    if (publicationStatus === 'PUBLISHED') {
      await tx.publishAttempt.update({
        where: { id: input.publishAttemptId },
        data: {
          status: 'SUCCEEDED',
          externalId: input.externalPostId || null,
          externalUrl: input.externalPostUrl || null,
          completedAt: now,
        },
      });
      await tx.outboxCommand.update({
        where: { id: input.outboxCommandId },
        data: {
          status: 'PUBLISHED',
          processedAt: now,
        },
      });
      return { outcome: 'ALREADY_PUBLISHED' };
    }

    if (publicationStatus === 'CANCELLED' || publicationStatus === 'FAILED') {
      await tx.publication.updateMany({
        where: { id: input.publicationId, status: publicationStatus },
        data: { status: 'UNKNOWN_EXTERNAL_STATE' },
      });
    }

    await tx.publishAttempt.update({
      where: { id: input.publishAttemptId },
      data: {
        status: 'UNKNOWN_EXTERNAL_STATE',
        errorCode: 'UNKNOWN_EXTERNAL_STATE',
        errorMessage: `Late adapter success after terminal publication status ${publicationStatus}; refusing to mark PUBLISHED`,
        externalId: input.externalPostId || null,
        externalUrl: input.externalPostUrl || null,
        completedAt: now,
      },
    });
    await tx.outboxCommand.update({
      where: { id: input.outboxCommandId },
      data: {
        status: 'FAILED',
        lastError: {
          code: 'UNKNOWN_EXTERNAL_STATE',
          publicationStatus,
        },
        processedAt: now,
      },
    });

    return { outcome: 'CONFLICT_TERMINAL', publicationStatus };
  });
}
