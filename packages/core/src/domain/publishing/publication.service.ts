import { createHash, randomBytes } from 'node:crypto';
import { nanoid } from 'nanoid';
import type { OutboxCommandPayload } from '../../contracts/outbox.contract.js';
import type {
  CreatePublicationDTO,
  PublicationResponseVO,
} from '../../contracts/publication.contract.js';
import type { PrismaClient } from '../../db/client.js';

const APPROVAL_RAW_TOKEN_BYTES = 16;
const APPROVAL_TOKEN_TTL_MS = 72 * 60 * 60 * 1000;

function generateApprovalToken(): { rawToken: string; tokenHash: string } {
  const rawToken = randomBytes(APPROVAL_RAW_TOKEN_BYTES).toString('hex');
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
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

export function computePublicationFingerprint(payload: {
  workspaceId: string;
  variantId: string;
  socialAccountId: string;
  scheduledAt?: Date | null | undefined;
}): string {
  const serialized = JSON.stringify({
    w: payload.workspaceId,
    v: payload.variantId,
    a: payload.socialAccountId,
    s: payload.scheduledAt?.toISOString() ?? 'now',
  });
  return createHash('sha256').update(serialized).digest('hex');
}

export async function createPublicationWithOutbox(
  db: PrismaClient,
  dto: CreatePublicationDTO
): Promise<{
  publication: PublicationResponseVO;
  publishAttemptId: string;
  outboxCommandId: string | null;
  requiresApproval: boolean;
  approvalId?: string;
  approvalToken?: string;
  approvalUrl?: string;
}> {
  const workspace = await db.workspace.findUnique({
    where: { id: dto.workspaceId },
    select: { id: true, requiresApproval: true },
  });
  if (!workspace) {
    throw new Error('WORKSPACE_NOT_FOUND');
  }

  // 1. Invariant check: Variant and Account must belong to the specified workspace
  const variant = await db.contentVariant.findFirst({
    where: { id: dto.contentVariantId, workspaceId: dto.workspaceId },
  });
  if (!variant) {
    throw new Error('CONTENT_VARIANT_NOT_FOUND_IN_WORKSPACE');
  }

  const account = await db.socialAccount.findFirst({
    where: { id: dto.socialAccountId, workspaceId: dto.workspaceId },
  });
  if (!account) {
    throw new Error('SOCIAL_ACCOUNT_NOT_FOUND_IN_WORKSPACE');
  }

  const idempotencyKey = `pub_${nanoid(24)}`;
  const fingerprint = computePublicationFingerprint({
    workspaceId: dto.workspaceId,
    variantId: dto.contentVariantId,
    socialAccountId: dto.socialAccountId,
    scheduledAt: dto.scheduledAt ?? null,
  });

  const requiresApproval = workspace.requiresApproval;
  const publicationStatus = requiresApproval
    ? 'REQUIRES_APPROVAL'
    : dto.scheduledAt && dto.scheduledAt > new Date()
      ? 'SCHEDULED'
      : 'READY';

  // 2. Atomic Database Transaction Boundary
  return await db.$transaction(async (tx) => {
    const publication = await tx.publication.create({
      data: {
        workspaceId: dto.workspaceId,
        contentVariantId: dto.contentVariantId,
        socialAccountId: dto.socialAccountId,
        status: publicationStatus,
        scheduledAt: dto.scheduledAt ?? null,
        timezone: dto.timezone,
        idempotencyKey,
        fingerprint,
        createdByUserId: dto.createdByUserId ?? null,
      },
    });

    const attempt = await tx.publishAttempt.create({
      data: {
        workspaceId: dto.workspaceId,
        publicationId: publication.id,
        attemptNumber: 1,
        status: 'RESERVED',
        idempotencyKey,
        fingerprint,
      },
    });

    let outboxCommandId: string | null = null;
    let approvalId: string | undefined;
    let approvalToken: string | undefined;
    let approvalUrl: string | undefined;

    if (!requiresApproval) {
      const outboxPayload: OutboxCommandPayload = {
        publicationId: publication.id,
        publishAttemptId: attempt.id,
        workspaceId: dto.workspaceId,
        socialAccountId: dto.socialAccountId,
        contentVariantId: dto.contentVariantId,
        platform: account.platform,
        body: variant.body,
        scheduledAt: dto.scheduledAt ? dto.scheduledAt.toISOString() : null,
        fingerprint,
        idempotencyKey,
      };

      const outbox = await tx.outboxCommand.create({
        data: {
          workspaceId: dto.workspaceId,
          publicationId: publication.id,
          publishAttemptId: attempt.id,
          commandType: 'DISPATCH_PUBLICATION',
          payload: outboxPayload as unknown as object,
          status: 'PENDING',
          availableAt: dto.scheduledAt ?? new Date(),
        },
      });
      outboxCommandId = outbox.id;
    } else {
      const approval = await tx.approval.create({
        data: {
          workspaceId: dto.workspaceId,
          resourceType: 'PUBLICATION',
          resourceId: publication.id,
          requestedByUserId: dto.createdByUserId ?? null,
          status: 'PENDING',
        },
      });

      const { rawToken, tokenHash } = generateApprovalToken();
      const nonce = randomBytes(16).toString('hex');
      await tx.approvalToken.create({
        data: {
          workspaceId: dto.workspaceId,
          approvalId: approval.id,
          tokenHash,
          nonce,
          expiresAt: new Date(Date.now() + APPROVAL_TOKEN_TTL_MS),
        },
      });

      approvalId = approval.id;
      approvalToken = rawToken;
      approvalUrl = buildApprovalMagicLink(rawToken);
    }

    return {
      publication: {
        id: publication.id,
        workspaceId: publication.workspaceId,
        contentVariantId: publication.contentVariantId,
        socialAccountId: publication.socialAccountId,
        status: publication.status,
        scheduledAt: publication.scheduledAt,
        publishedAt: publication.publishedAt,
        externalPostId: publication.externalPostId,
        externalPostUrl: publication.externalPostUrl,
        idempotencyKey: publication.idempotencyKey,
        fingerprint: publication.fingerprint,
        createdAt: publication.createdAt,
        updatedAt: publication.updatedAt,
      },
      publishAttemptId: attempt.id,
      outboxCommandId,
      requiresApproval,
      ...(approvalId && approvalToken && approvalUrl
        ? { approvalId, approvalToken, approvalUrl }
        : {}),
    };
  });
}
