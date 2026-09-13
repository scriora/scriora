/**
 * Unified post creation used by POST /v1/posts and MCP `scriora_create_post`.
 *
 * Encodes the same §14 / PR-A / PR-B semantics:
 * - Content + variants + publications + publish attempts
 * - Sweepable SOCIAL_PUBLISH outbox only when the workspace does not require approval
 * - Approval + SHA-256 token (raw token returned once) when requiresApproval
 *
 * Telegram C2 delivery is returned as pending work for the caller — this module
 * does not import scriora-social.
 */

import crypto from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type { PrismaClient } from '../../db/client.js';
import type { MediaRef, PublishTarget } from '../../schemas/publish.schema.js';
import { assertSafePersistedRemoteUrls } from '../../security/persisted-remote-urls.js';
import { publicationIdempotencyKeys } from './idempotency.js';

const APPROVAL_RAW_TOKEN_BYTES = 16;
const APPROVAL_TOKEN_TTL_MS = 72 * 60 * 60 * 1000;
const IDEMPOTENCY_WINDOW_MS = 24 * 60 * 60 * 1000;

export class CreatePostError extends Error {
  readonly code:
    | 'SOCIAL_ACCOUNT_NOT_FOUND'
    | 'SOCIAL_ACCOUNT_PLATFORM_MISMATCH'
    | 'DUPLICATE_SOCIAL_ACCOUNT'
    | 'MEDIA_ASSET_NOT_FOUND'
    | 'MISSION_NOT_FOUND'
    | 'UNSAFE_REMOTE_URL';

  constructor(
    code:
      | 'SOCIAL_ACCOUNT_NOT_FOUND'
      | 'SOCIAL_ACCOUNT_PLATFORM_MISMATCH'
      | 'DUPLICATE_SOCIAL_ACCOUNT'
      | 'MEDIA_ASSET_NOT_FOUND'
      | 'MISSION_NOT_FOUND'
      | 'UNSAFE_REMOTE_URL',
    message: string
  ) {
    super(message);
    this.name = 'CreatePostError';
    this.code = code;
  }
}

export interface TelegramApprovalDeliveryRequest {
  approvalId: string;
  token: string;
  title: string;
  body: string;
  platform: string;
  scheduledAt?: string | undefined;
}

export interface CreatedPublicationResult {
  publicationId: string;
  platform: PublishTarget['platform'];
  status: string;
  outboxCommandId: string | null;
  approvalId?: string;
  approvalToken?: string;
  approvalUrl?: string;
}

export interface CreateUnifiedPostInput {
  workspaceId: string;
  createdByUserId?: string | null;
  requiresApproval: boolean;
  body: string;
  targets: PublishTarget[];
  media?: MediaRef[];
  mediaUrls?: string[];
  scheduledAt?: string;
  missionId?: string;
  idempotencyKey: string;
}

export type CreateUnifiedPostResult =
  | {
      kind: 'idempotent_replay';
      publicationId: string;
      status: string;
    }
  | {
      kind: 'created';
      contentId: string;
      publications: CreatedPublicationResult[];
      pendingTelegramApprovals: TelegramApprovalDeliveryRequest[];
      isScheduled: boolean;
      requiresApproval: boolean;
      message: string;
    };

function generateApprovalToken(): { rawToken: string; tokenHash: string } {
  const rawToken = crypto.randomBytes(APPROVAL_RAW_TOKEN_BYTES).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  return { rawToken, tokenHash };
}

function buildApprovalMagicLink(rawToken: string): string {
  const base = (
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    'http://localhost:4000'
  ).replace(/\/$/, '');
  return `${base}/v1/approve/${rawToken}`;
}

function buildSocialPublishOutboxPayload(input: {
  workspaceId: string;
  body: string;
  platform: string;
  socialAccountId: string;
  mediaUrls: string[];
  idempotencyKey: string;
  fingerprint: string;
  options: Record<string, unknown> | object;
}): Record<string, unknown> {
  return {
    workspaceId: input.workspaceId,
    body: input.body,
    platform: input.platform,
    socialAccountId: input.socialAccountId,
    mediaUrls: input.mediaUrls,
    idempotencyKey: input.idempotencyKey,
    fingerprint: input.fingerprint,
    options: input.options,
  };
}

export function createPostResponseMessage(input: {
  requiresApproval: boolean;
  isScheduled: boolean;
}): string {
  if (input.requiresApproval) {
    return 'Submitted for approval';
  }
  if (input.isScheduled) {
    return 'Publication scheduled';
  }
  return 'Publication queued for dispatch';
}

/**
 * Derive an honest aggregate status from created publications.
 * Never reports STAGED / published for a bare content draft.
 */
export function deriveCreatePostStatus(publications: CreatedPublicationResult[]): string {
  if (publications.length === 0) {
    return 'DRAFT';
  }
  const first = publications[0];
  if (!first) {
    return 'DRAFT';
  }
  const statuses = new Set(publications.map((p) => p.status));
  if (statuses.size === 1) {
    return first.status;
  }
  if (statuses.has('REQUIRES_APPROVAL')) {
    return 'REQUIRES_APPROVAL';
  }
  if (statuses.has('SCHEDULED')) {
    return 'SCHEDULED';
  }
  if (statuses.has('READY')) {
    return 'READY';
  }
  return first.status;
}

export async function createUnifiedPost(
  db: PrismaClient,
  input: CreateUnifiedPostInput
): Promise<CreateUnifiedPostResult> {
  const {
    workspaceId,
    createdByUserId,
    requiresApproval,
    body,
    targets,
    media,
    mediaUrls,
    scheduledAt,
    missionId,
    idempotencyKey,
  } = input;

  const accountIds = targets.map((target) => target.socialAccountId);
  if (new Set(accountIds).size !== accountIds.length) {
    throw new CreatePostError(
      'DUPLICATE_SOCIAL_ACCOUNT',
      'Each social account may be targeted only once per publish request'
    );
  }

  if (missionId) {
    const mission = await db.mission.findFirst({
      where: { id: missionId, workspaceId },
      select: { id: true },
    });
    if (!mission) {
      throw new CreatePostError(
        'MISSION_NOT_FOUND',
        'The selected mission does not exist in this workspace'
      );
    }
  }

  const existingPublication = await db.publication.findFirst({
    where: {
      workspaceId,
      idempotencyKey: {
        in: publicationIdempotencyKeys(
          idempotencyKey,
          targets.map((target) => target.socialAccountId)
        ),
      },
      createdAt: { gt: new Date(Date.now() - IDEMPOTENCY_WINDOW_MS) },
    },
  });

  if (existingPublication) {
    return {
      kind: 'idempotent_replay',
      publicationId: existingPublication.id,
      status: existingPublication.status,
    };
  }

  const validAccounts = await db.socialAccount.findMany({
    where: { id: { in: accountIds }, workspaceId },
    select: { id: true, platform: true },
  });

  if (validAccounts.length !== targets.length) {
    throw new CreatePostError(
      'SOCIAL_ACCOUNT_NOT_FOUND',
      'One or more targeted social accounts do not exist in this workspace'
    );
  }

  const platformByAccountId = new Map(
    validAccounts.map((account) => [account.id, account.platform] as const)
  );
  const mismatchedTarget = targets.find(
    (target) => platformByAccountId.get(target.socialAccountId) !== target.platform
  );
  if (mismatchedTarget) {
    throw new CreatePostError(
      'SOCIAL_ACCOUNT_PLATFORM_MISMATCH',
      `Target platform does not match social account ${mismatchedTarget.socialAccountId}`
    );
  }

  const isScheduled = !!scheduledAt;
  const initialStatus = requiresApproval
    ? 'REQUIRES_APPROVAL'
    : isScheduled
      ? 'SCHEDULED'
      : 'READY';

  let resolvedMediaUrls: string[] = mediaUrls || [];
  if (media && media.length > 0 && resolvedMediaUrls.length === 0) {
    const assetIds = media.map((m) => m.mediaAssetId);
    const distinctAssetIds = [...new Set(assetIds)];
    const assets = await db.mediaAsset.findMany({
      where: {
        id: { in: distinctAssetIds },
        workspaceId,
        deletedAt: null,
        processingState: 'READY',
      },
      select: { id: true, storageKey: true },
    });

    const storageKeyByAssetId = new Map(
      assets
        .filter((asset) => asset.storageKey.trim().length > 0)
        .map((asset) => [asset.id, asset.storageKey] as const)
    );
    if (storageKeyByAssetId.size !== distinctAssetIds.length) {
      throw new CreatePostError(
        'MEDIA_ASSET_NOT_FOUND',
        'One or more media assets are unavailable in this workspace'
      );
    }
    resolvedMediaUrls = assetIds.map((assetId) => {
      const storageKey = storageKeyByAssetId.get(assetId);
      if (!storageKey) {
        throw new CreatePostError(
          'MEDIA_ASSET_NOT_FOUND',
          'One or more media assets are unavailable in this workspace'
        );
      }
      return storageKey;
    });
  }

  try {
    assertSafePersistedRemoteUrls({
      mediaUrls: resolvedMediaUrls,
      platformOptions: targets.map((target) => target.platformOptions ?? {}),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unsafe remote URL';
    throw new CreatePostError('UNSAFE_REMOTE_URL', message);
  }

  const result = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const contentTitle = body.slice(0, 80);
    const content = await tx.content.create({
      data: {
        workspaceId,
        missionId: missionId ?? null,
        title: contentTitle,
        body,
        status: 'READY',
        createdByUserId: createdByUserId ?? null,
      },
    });

    const publications: CreatedPublicationResult[] = [];
    const pendingTelegramApprovals: TelegramApprovalDeliveryRequest[] = [];

    for (const target of targets) {
      const targetBody = target.customBody?.trim() || body;

      const variant = await tx.contentVariant.create({
        data: {
          workspaceId,
          contentId: content.id,
          socialAccountId: target.socialAccountId,
          body: targetBody,
          metadata: JSON.parse(
            JSON.stringify({
              ...(target.platformOptions || {}),
              mediaUrls: resolvedMediaUrls,
            })
          ),
          status: 'READY',
        },
      });

      const targetIdempotency = `${idempotencyKey}:${target.socialAccountId}`;
      const fingerprint = crypto
        .createHash('sha256')
        .update(`${content.id}:${target.socialAccountId}:${targetBody}`)
        .digest('hex');

      const publication = await tx.publication.create({
        data: {
          workspaceId,
          contentVariantId: variant.id,
          socialAccountId: target.socialAccountId,
          status: initialStatus,
          scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
          idempotencyKey: targetIdempotency,
          fingerprint,
          createdByUserId: createdByUserId ?? null,
        },
      });

      const attempt = await tx.publishAttempt.create({
        data: {
          workspaceId,
          publicationId: publication.id,
          attemptNumber: 1,
          status: 'RESERVED',
          idempotencyKey: targetIdempotency,
          fingerprint,
        },
      });

      let outboxCommandId: string | null = null;
      if (!requiresApproval) {
        const payloadJson = JSON.parse(
          JSON.stringify(
            buildSocialPublishOutboxPayload({
              workspaceId,
              body: targetBody,
              platform: target.platform,
              socialAccountId: target.socialAccountId,
              mediaUrls: resolvedMediaUrls,
              idempotencyKey: targetIdempotency,
              fingerprint,
              options: (target.platformOptions ?? {}) as Record<string, unknown>,
            })
          )
        );

        const outboxCmd = await tx.outboxCommand.create({
          data: {
            workspaceId,
            publicationId: publication.id,
            publishAttemptId: attempt.id,
            commandType: 'SOCIAL_PUBLISH',
            payload: payloadJson,
            status: 'PENDING',
            availableAt: scheduledAt ? new Date(scheduledAt) : new Date(),
          },
        });
        outboxCommandId = outboxCmd.id;
      }

      let approvalToken: string | undefined;
      let approvalUrl: string | undefined;
      let approvalId: string | undefined;
      if (requiresApproval) {
        const approval = await tx.approval.create({
          data: {
            workspaceId,
            resourceType: 'PUBLICATION',
            resourceId: publication.id,
            requestedByUserId: createdByUserId ?? null,
            status: 'PENDING',
          },
        });

        const { rawToken, tokenHash } = generateApprovalToken();
        const nonce = crypto.randomBytes(16).toString('hex');
        await tx.approvalToken.create({
          data: {
            workspaceId,
            approvalId: approval.id,
            tokenHash,
            nonce,
            expiresAt: new Date(Date.now() + APPROVAL_TOKEN_TTL_MS),
          },
        });

        approvalId = approval.id;
        approvalToken = rawToken;
        approvalUrl = buildApprovalMagicLink(rawToken);
        pendingTelegramApprovals.push({
          approvalId: approval.id,
          token: rawToken,
          title: contentTitle,
          body: targetBody,
          platform: target.platform,
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        });
      }

      publications.push({
        publicationId: publication.id,
        platform: target.platform,
        status: publication.status,
        outboxCommandId,
        ...(approvalId && approvalToken && approvalUrl
          ? { approvalId, approvalToken, approvalUrl }
          : {}),
      });
    }

    return {
      contentId: content.id,
      publications,
      pendingTelegramApprovals,
    };
  });

  return {
    kind: 'created',
    contentId: result.contentId,
    publications: result.publications,
    pendingTelegramApprovals: result.pendingTelegramApprovals,
    isScheduled,
    requiresApproval,
    message: createPostResponseMessage({ requiresApproval, isScheduled }),
  };
}
