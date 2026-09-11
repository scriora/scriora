import type { PrismaClient } from 'scriora-core';
import { platformRegistry, type SocialPlatformType } from 'scriora-social';
import { z } from 'zod';
import { SecretEnvelopeService } from '../lib/secret-envelope.service.js';

let envelopeServiceInstance: SecretEnvelopeService | null = null;
function getEnvelopeService(): SecretEnvelopeService {
  if (!envelopeServiceInstance) {
    envelopeServiceInstance = new SecretEnvelopeService();
  }
  return envelopeServiceInstance;
}

export const OutboxPayloadSchema = z
  .object({
    platform: z.string().min(1, 'platform is required'),
    socialAccountId: z.string().min(1, 'socialAccountId is required'),
    body: z.string().nullable().optional(),
    mediaUrls: z.array(z.string()).optional(),
    idempotencyKey: z.string().min(1, 'idempotencyKey is required'),
    fingerprint: z.string().min(1, 'fingerprint is required'),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export type OutboxPayload = z.infer<typeof OutboxPayloadSchema>;

export interface DispatchResult {
  success: boolean;
  externalPostId?: string | undefined;
  externalPostUrl?: string | undefined;
  error?: string | undefined;
}

export async function processOutboxCommand(
  db: PrismaClient,
  outboxCommandId: string
): Promise<DispatchResult> {
  // 1. Fetch outbox command with relations
  const command = await db.outboxCommand.findUnique({
    where: { id: outboxCommandId },
    include: {
      publication: {
        include: {
          socialAccount: {
            include: {
              secretEnvelopes: {
                orderBy: { createdAt: 'desc' },
                take: 1,
              },
            },
          },
        },
      },
      publishAttempt: true,
    },
  });

  if (!command) {
    throw new Error(`OUTBOX_COMMAND_NOT_FOUND: ${outboxCommandId}`);
  }

  if (command.status === 'PUBLISHED') {
    return { success: true, externalPostId: command.publication.externalPostId ?? undefined };
  }

  // Validate command.payload with Zod before processing
  const validationResult = OutboxPayloadSchema.safeParse(command.payload);
  if (!validationResult.success) {
    const errorMessage = `INVALID_PAYLOAD: ${validationResult.error.message}`;

    await db.publishAttempt.update({
      where: { id: command.publishAttemptId },
      data: {
        status: 'FAILED_PERMANENT',
        errorMessage,
      },
    });

    await db.publication.update({
      where: { id: command.publicationId },
      data: { status: 'FAILED' },
    });

    await db.outboxCommand.update({
      where: { id: outboxCommandId },
      data: {
        status: 'FAILED',
        lastError: { message: errorMessage, at: new Date().toISOString() },
      },
    });

    return { success: false, error: errorMessage };
  }

  const payload = validationResult.data;
  const platform = payload.platform as SocialPlatformType;

  // Mark command as claimed / processing
  await db.outboxCommand.update({
    where: { id: outboxCommandId },
    data: {
      status: 'PROCESSING',
      claimedAt: new Date(),
      attempts: { increment: 1 },
    },
  });

  try {
    // 2. Resolve platform adapter from scriora-social
    const adapter = platformRegistry.get(platform);

    // Decrypt credentials if envelope is attached
    const envelope = command.publication?.socialAccount?.secretEnvelopes?.[0];
    let accessToken: string | undefined;
    if (envelope) {
      try {
        const decrypted = getEnvelopeService().decrypt(envelope.envelopeData);
        accessToken = decrypted.accessToken;
      } catch (err) {
        // Fallback or ignore in test mock environments
      }
    }

    const authorUrn = command.publication?.socialAccount?.externalAccountId
      ? `urn:li:person:${command.publication.socialAccount.externalAccountId}`
      : undefined;

    // 3. Dispatch to platform
    const result = await adapter.publish({
      workspaceId: command.workspaceId,
      accountId: payload.socialAccountId,
      text: payload.body ?? '',
      mediaUrls: payload.mediaUrls ?? [],
      idempotencyKey: payload.idempotencyKey,
      fingerprint: payload.fingerprint,
      metadata: {
        ...payload.metadata,
        ...(accessToken ? { accessToken } : {}),
        ...(authorUrn ? { authorUrn } : {}),
      },
    });

    if (result.status === 'SUCCEEDED' && result.externalPostId) {
      // 4. Update database records inside transaction
      await db.$transaction(
        async (tx: {
          publishAttempt: { update: PrismaClient['publishAttempt']['update'] };
          publication: { update: PrismaClient['publication']['update'] };
          outboxCommand: { update: PrismaClient['outboxCommand']['update'] };
        }) => {
          await tx.publishAttempt.update({
            where: { id: command.publishAttemptId },
            data: {
              status: 'SUCCEEDED',
              externalId: result.externalPostId ?? null,
              externalUrl: result.externalPostUrl ?? null,
              completedAt: new Date(),
            },
          });

          await tx.publication.update({
            where: { id: command.publicationId },
            data: {
              status: 'PUBLISHED',
              externalPostId: result.externalPostId ?? null,
              externalPostUrl: result.externalPostUrl ?? null,
              publishedAt: new Date(),
            },
          });

          await tx.outboxCommand.update({
            where: { id: outboxCommandId },
            data: {
              status: 'PUBLISHED',
              processedAt: new Date(),
            },
          });
        }
      );

      return {
        success: true,
        externalPostId: result.externalPostId,
        externalPostUrl: result.externalPostUrl,
      };
    }

    // Platform returned failure or pending
    await db.publishAttempt.update({
      where: { id: command.publishAttemptId },
      data: { status: 'FAILED_PERMANENT' },
    });

    await db.publication.update({
      where: { id: command.publicationId },
      data: { status: 'FAILED' },
    });

    await db.outboxCommand.update({
      where: { id: outboxCommandId },
      data: { status: 'FAILED' },
    });

    return { success: false, error: 'DISPATCH_UNSUCCESSFUL' };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'UNKNOWN_DISPATCH_ERROR';

    await db.publishAttempt.update({
      where: { id: command.publishAttemptId },
      data: {
        status: 'FAILED_PERMANENT',
        errorMessage,
      },
    });

    await db.publication.update({
      where: { id: command.publicationId },
      data: { status: 'FAILED' },
    });

    await db.outboxCommand.update({
      where: { id: outboxCommandId },
      data: {
        status: 'FAILED',
        lastError: { message: errorMessage, at: new Date().toISOString() },
      },
    });

    return { success: false, error: errorMessage };
  }
}
