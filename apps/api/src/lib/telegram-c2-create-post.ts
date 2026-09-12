/**
 * Telegram C2 `/post` create path.
 *
 * Uses the same createUnifiedPost semantics as POST /v1/posts and MCP
 * `scriora_create_post` (PR-C): honors workspace.requiresApproval, does not
 * create a sweepable outbox until approved, and delivers the one-time raw
 * token via the PR-B Telegram approval card when credentials exist.
 */

import crypto from 'node:crypto';
import {
  type CreateUnifiedPostResult,
  createUnifiedPost,
  type PrismaClient,
  type PublishTarget,
} from 'scriora-core';
import { maybeSendTelegramApprovalRequests } from './approval-delivery.js';
import { applyApprovalDecisionToPublication } from './approval-publication-decision.js';
import type { PublicationRequestedSender } from './publication-requested.js';
import { maybeDispatchPublicationRequested } from './publication-requested.js';

export interface TelegramC2Workspace {
  id: string;
  name: string;
  ownerUserId: string;
  requiresApproval: boolean;
}

export interface TelegramC2CreatePostParams {
  text: string;
  mediaUrls?: string[] | undefined;
}

export interface TelegramC2CreatePostResult {
  publicationCount: number;
  requiresApproval: boolean;
  message: string;
}

export interface TelegramC2CreatePostDeps {
  createPost?: typeof createUnifiedPost;
  deliverApprovals?: typeof maybeSendTelegramApprovalRequests;
}

const TELEGRAM_C2_WORKSPACE_SELECT = {
  id: true,
  name: true,
  ownerUserId: true,
  requiresApproval: true,
} as const;

/**
 * Resolve the workspace Telegram C2 should write into.
 * Prefer TELEGRAM_WORKSPACE_ID. If unset, allow a single workspace only —
 * never silently pick the oldest of many.
 */
export async function resolveTelegramC2Workspace(db: PrismaClient): Promise<TelegramC2Workspace> {
  const configuredId = process.env.TELEGRAM_WORKSPACE_ID?.trim();
  if (configuredId) {
    const workspace = await db.workspace.findUnique({
      where: { id: configuredId },
      select: TELEGRAM_C2_WORKSPACE_SELECT,
    });
    if (!workspace) {
      throw new Error('TELEGRAM_WORKSPACE_NOT_FOUND');
    }
    return workspace;
  }

  const workspaces = await db.workspace.findMany({
    orderBy: { createdAt: 'asc' },
    take: 2,
    select: TELEGRAM_C2_WORKSPACE_SELECT,
  });

  if (workspaces.length === 0) {
    throw new Error('No active workspace found');
  }
  if (workspaces.length > 1) {
    throw new Error(
      'Multiple workspaces exist; set TELEGRAM_WORKSPACE_ID to choose the Telegram C2 workspace'
    );
  }

  return workspaces[0]!;
}

export async function createTelegramC2Post(
  db: PrismaClient,
  params: TelegramC2CreatePostParams,
  deps: TelegramC2CreatePostDeps = {}
): Promise<TelegramC2CreatePostResult> {
  const createPost = deps.createPost ?? createUnifiedPost;
  const deliverApprovals = deps.deliverApprovals ?? maybeSendTelegramApprovalRequests;

  const workspace = await resolveTelegramC2Workspace(db);
  const body = params.text.trim() || '📷';

  const activeAccounts = await db.socialAccount.findMany({
    where: { workspaceId: workspace.id, status: 'CONNECTED' },
    select: { id: true, platform: true },
  });

  if (activeAccounts.length === 0) {
    throw new Error('No connected social accounts found in workspace');
  }

  const targets: PublishTarget[] = activeAccounts.map((account) => ({
    socialAccountId: account.id,
    platform: account.platform as PublishTarget['platform'],
  }));

  const result: CreateUnifiedPostResult = await createPost(db, {
    workspaceId: workspace.id,
    createdByUserId: workspace.ownerUserId,
    requiresApproval: workspace.requiresApproval,
    body,
    targets,
    ...(params.mediaUrls && params.mediaUrls.length > 0 ? { mediaUrls: params.mediaUrls } : {}),
    idempotencyKey: crypto.randomUUID(),
  });

  if (result.kind === 'idempotent_replay') {
    return {
      publicationCount: 1,
      requiresApproval: workspace.requiresApproval,
      message: 'Idempotent replay of an existing publication',
    };
  }

  if (result.pendingTelegramApprovals.length > 0) {
    try {
      await deliverApprovals(result.pendingTelegramApprovals);
    } catch {
      // Best-effort; publications are already held at REQUIRES_APPROVAL.
    }
  }

  return {
    publicationCount: result.publications.length,
    requiresApproval: result.requiresApproval,
    message: result.message,
  };
}

export interface TelegramC2ApprovalDecisionDeps {
  dispatchPublicationRequested?: typeof maybeDispatchPublicationRequested;
  sendPublicationRequested?: PublicationRequestedSender;
}

/**
 * Apply a Telegram inline-button decision using the same CAS + outbox gate as
 * POST /v1/approve/:token/decision: only REQUIRES_APPROVAL transitions to
 * READY/CANCELLED. APPROVED then creates a sweepable SOCIAL_PUBLISH outbox
 * and emits scriora/publication.requested when available.
 */
export async function handleTelegramC2ApprovalDecision(
  db: PrismaClient,
  token: string,
  decision: 'APPROVED' | 'REJECTED',
  deps: TelegramC2ApprovalDecisionDeps = {}
): Promise<boolean> {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const tokenRecord = await db.approvalToken.findFirst({
    where: { tokenHash },
    include: { approval: true },
  });

  if (!tokenRecord || tokenRecord.usedAt !== null || tokenRecord.expiresAt < new Date()) {
    return false;
  }

  const outcome = await db.$transaction(async (tx) => {
    await tx.approvalToken.update({
      where: { id: tokenRecord.id },
      data: { usedAt: new Date() },
    });

    await tx.approval.update({
      where: { id: tokenRecord.approval.id },
      data: {
        status: decision,
        decidedAt: new Date(),
        decisionNote: 'Decided via Telegram Admin C2 by authorized owner',
      },
    });

    if (tokenRecord.approval.resourceType !== 'PUBLICATION') {
      return {
        applied: true,
        publicationStatus: null,
        queued: { outboxCommandId: null, availableAt: null, status: null, created: false },
      };
    }

    return applyApprovalDecisionToPublication(tx, tokenRecord.approval.resourceId, decision);
  });

  if (decision === 'APPROVED' && outcome.applied) {
    const dispatch = deps.dispatchPublicationRequested ?? maybeDispatchPublicationRequested;
    await dispatch(outcome.queued, {
      ...(deps.sendPublicationRequested ? { send: deps.sendPublicationRequested } : {}),
    });
  }

  return true;
}
