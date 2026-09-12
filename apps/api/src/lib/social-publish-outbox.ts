import type { Prisma } from 'scriora-core';

export interface SocialPublishOutboxPayload {
  workspaceId: string;
  body: string;
  platform: string;
  socialAccountId: string;
  mediaUrls: string[];
  idempotencyKey: string;
  fingerprint: string;
  options: Record<string, unknown> | object;
}

export function buildSocialPublishOutboxPayload(
  input: SocialPublishOutboxPayload
): SocialPublishOutboxPayload {
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

export function mediaUrlsFromVariantMetadata(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return [];
  }
  const mediaUrls = (metadata as Record<string, unknown>).mediaUrls;
  if (!Array.isArray(mediaUrls)) {
    return [];
  }
  return mediaUrls.filter((url): url is string => typeof url === 'string');
}

export function platformOptionsFromVariantMetadata(metadata: unknown): Record<string, unknown> {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }
  const { mediaUrls: _mediaUrls, ...options } = metadata as Record<string, unknown>;
  return options;
}

/**
 * After a PUBLICATION is APPROVED, create a sweepable PENDING outbox if one
 * does not already exist. availableAt honors scheduledAt so scheduled+approval
 * still waits for the scheduled time.
 */
export type EnqueuedApprovedOutbox = {
  outboxCommandId: string | null;
  availableAt: Date | null;
  status: 'PENDING' | 'PROCESSING' | null;
  created: boolean;
};

export async function enqueueApprovedPublicationOutbox(
  tx: Prisma.TransactionClient,
  publicationId: string
): Promise<EnqueuedApprovedOutbox> {
  const existing = await tx.outboxCommand.findFirst({
    where: {
      publicationId,
      status: { in: ['PENDING', 'PROCESSING'] },
    },
    select: { id: true, availableAt: true, status: true },
  });

  if (existing) {
    return {
      outboxCommandId: existing.id,
      availableAt: existing.availableAt,
      status: existing.status as 'PENDING' | 'PROCESSING',
      created: false,
    };
  }

  const publication = await tx.publication.findUnique({
    where: { id: publicationId },
    include: {
      contentVariant: true,
      socialAccount: { select: { platform: true } },
      publishAttempts: {
        orderBy: { attemptNumber: 'asc' },
        take: 1,
        select: { id: true },
      },
    },
  });

  if (!publication) {
    return { outboxCommandId: null, availableAt: null, status: null, created: false };
  }

  const attemptId = publication.publishAttempts[0]?.id;
  if (!attemptId) {
    return { outboxCommandId: null, availableAt: null, status: null, created: false };
  }

  const metadata = publication.contentVariant.metadata;
  const payload = buildSocialPublishOutboxPayload({
    workspaceId: publication.workspaceId,
    body: publication.contentVariant.body || '',
    platform: publication.socialAccount.platform,
    socialAccountId: publication.socialAccountId,
    mediaUrls: mediaUrlsFromVariantMetadata(metadata),
    idempotencyKey: publication.idempotencyKey,
    fingerprint: publication.fingerprint,
    options: platformOptionsFromVariantMetadata(metadata),
  });

  const outbox = await tx.outboxCommand.create({
    data: {
      workspaceId: publication.workspaceId,
      publicationId: publication.id,
      publishAttemptId: attemptId,
      commandType: 'SOCIAL_PUBLISH',
      payload: JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue,
      status: 'PENDING',
      availableAt: publication.scheduledAt ?? new Date(),
    },
  });

  return {
    outboxCommandId: outbox.id,
    availableAt: outbox.availableAt ?? null,
    status: 'PENDING',
    created: true,
  };
}
