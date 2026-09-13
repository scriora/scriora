import type { PrismaClient } from 'scriora-core';
import {
  type ApprovalPublicationDecisionResult,
  applyApprovalDecisionToPublication,
} from './approval-publication-decision.js';
import type { EnqueuedApprovedOutbox } from './social-publish-outbox.js';

export type ApprovalTokenDecision = 'APPROVED' | 'REJECTED';

export interface ApprovalTokenDecisionRecord {
  id: string;
  workspaceId: string;
  approval: {
    id: string;
    resourceType: string;
    resourceId: string;
  };
}

export type ApprovalDecisionConflictCode =
  | 'TOKEN_ALREADY_USED'
  | 'APPROVAL_ALREADY_DECIDED'
  | 'PUBLICATION_STATUS_CONFLICT';

export class ApprovalDecisionConflictError extends Error {
  constructor(
    readonly code: ApprovalDecisionConflictCode,
    readonly publicationStatus: string | null = null
  ) {
    super(code);
    this.name = 'ApprovalDecisionConflictError';
  }
}

export type ApprovalTokenDecisionOutcome =
  | ApprovalPublicationDecisionResult
  | { applied: true; publicationStatus: null; queued: EnqueuedApprovedOutbox };

const EMPTY_OUTCOME: ApprovalTokenDecisionOutcome = {
  applied: true,
  publicationStatus: null,
  queued: { outboxCommandId: null, availableAt: null, status: null, created: false },
};

/**
 * Atomically consumes a one-time token, decides its pending Approval, and
 * applies the governed publication transition. Throwing on any lost CAS makes
 * Prisma roll the entire transaction back, including the token claim.
 */
export async function applyApprovalTokenDecision(
  db: PrismaClient,
  tokenRecord: ApprovalTokenDecisionRecord,
  decision: ApprovalTokenDecision,
  decisionNote: string | null
): Promise<ApprovalTokenDecisionOutcome> {
  return db.$transaction(async (tx) => {
    const decidedAt = new Date();
    const consumed = await tx.approvalToken.updateMany({
      where: {
        id: tokenRecord.id,
        workspaceId: tokenRecord.workspaceId,
        approvalId: tokenRecord.approval.id,
        usedAt: null,
        expiresAt: { gt: decidedAt },
      },
      data: { usedAt: decidedAt },
    });
    if (consumed.count !== 1) {
      throw new ApprovalDecisionConflictError('TOKEN_ALREADY_USED');
    }

    const approvalClaim = await tx.approval.updateMany({
      where: {
        id: tokenRecord.approval.id,
        workspaceId: tokenRecord.workspaceId,
        status: 'PENDING',
      },
      data: {
        status: decision,
        decidedAt,
        decisionNote,
      },
    });
    if (approvalClaim.count !== 1) {
      throw new ApprovalDecisionConflictError('APPROVAL_ALREADY_DECIDED');
    }

    if (tokenRecord.approval.resourceType !== 'PUBLICATION') {
      return EMPTY_OUTCOME;
    }

    const outcome = await applyApprovalDecisionToPublication(
      tx,
      tokenRecord.approval.resourceId,
      decision
    );
    if (!outcome.applied) {
      throw new ApprovalDecisionConflictError(
        'PUBLICATION_STATUS_CONFLICT',
        outcome.publicationStatus
      );
    }
    return outcome;
  });
}
