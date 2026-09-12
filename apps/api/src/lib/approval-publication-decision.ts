import type { Prisma } from 'scriora-core';
import {
  type EnqueuedApprovedOutbox,
  enqueueApprovedPublicationOutbox,
} from './social-publish-outbox.js';

export const APPROVAL_GATE_PUBLICATION_STATUS = 'REQUIRES_APPROVAL' as const;

const EMPTY_QUEUED: EnqueuedApprovedOutbox = {
  outboxCommandId: null,
  availableAt: null,
  status: null,
  created: false,
};

export type ApprovalPublicationDecisionResult =
  | { applied: true; publicationStatus: 'READY' | 'CANCELLED'; queued: EnqueuedApprovedOutbox }
  | { applied: false; publicationStatus: string | null; queued: EnqueuedApprovedOutbox };

/**
 * Compare-and-swap the publication out of REQUIRES_APPROVAL only.
 * Already PUBLISHED / CANCELLED / READY / etc. is a no-op — never clobber.
 */
export async function applyApprovalDecisionToPublication(
  tx: Prisma.TransactionClient,
  publicationId: string,
  decision: 'APPROVED' | 'REJECTED'
): Promise<ApprovalPublicationDecisionResult> {
  const nextStatus = decision === 'APPROVED' ? 'READY' : 'CANCELLED';
  const updated = await tx.publication.updateMany({
    where: { id: publicationId, status: APPROVAL_GATE_PUBLICATION_STATUS },
    data: { status: nextStatus },
  });

  if (updated.count === 0) {
    const current = await tx.publication.findUnique({
      where: { id: publicationId },
      select: { status: true },
    });
    return {
      applied: false,
      publicationStatus: current?.status ?? null,
      queued: EMPTY_QUEUED,
    };
  }

  if (decision === 'APPROVED') {
    return {
      applied: true,
      publicationStatus: 'READY',
      queued: await enqueueApprovedPublicationOutbox(tx, publicationId),
    };
  }

  await tx.outboxCommand.deleteMany({
    where: { publicationId, status: 'PENDING' },
  });
  return { applied: true, publicationStatus: 'CANCELLED', queued: EMPTY_QUEUED };
}
