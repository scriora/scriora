import { createHash } from 'node:crypto';
import { nanoid } from 'nanoid';
import type { OutboxCommandPayload } from '../../contracts/outbox.contract.js';
import type {
  CreatePublicationDTO,
  PublicationResponseVO,
} from '../../contracts/publication.contract.js';
import type { PrismaClient } from '../../db/client.js';

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
  outboxCommandId: string;
}> {
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

  const publicationStatus = dto.scheduledAt && dto.scheduledAt > new Date() ? 'SCHEDULED' : 'READY';

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
      outboxCommandId: outbox.id,
    };
  });
}
