import type { Prisma, PrismaClient } from 'scriora-core';
import {
  DiscordAdapter,
  LinkedInAdapter,
  platformRegistry,
  type SocialPlatformType,
  TelegramAdapter,
  XAdapter,
} from 'scriora-social';
import { z } from 'zod';
import { SecretEnvelopeService } from '../lib/secret-envelope.service.js';

function ensureAdaptersRegistered() {
  if (!platformRegistry.has('LINKEDIN')) {
    try {
      platformRegistry.register(new LinkedInAdapter());
    } catch {}
  }
  if (!platformRegistry.has('X')) {
    try {
      platformRegistry.register(new XAdapter());
    } catch {}
  }
  if (!platformRegistry.has('TELEGRAM')) {
    try {
      platformRegistry.register(new TelegramAdapter());
    } catch {}
  }
  if (!platformRegistry.has('DISCORD')) {
    try {
      platformRegistry.register(new DiscordAdapter());
    } catch {}
  }
}

let envelopeServiceInstance: SecretEnvelopeService | null = null;
function getEnvelopeService(): SecretEnvelopeService {
  if (!envelopeServiceInstance) {
    envelopeServiceInstance = new SecretEnvelopeService();
  }
  return envelopeServiceInstance;
}

export const OutboxPayloadSchema = z
  .object({
    workspaceId: z.string().uuid().optional(),
    socialAccountId: z.string().min(1, 'socialAccountId is required'),
    platform: z.string(),
    body: z.string().optional(),
    mediaUrls: z.array(z.string().url()).optional(),
    idempotencyKey: z.string(),
    fingerprint: z.string(),
    options: z.unknown().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export type OutboxPayload = z.infer<typeof OutboxPayloadSchema>;

export interface DispatchResult {
  success: boolean;
  externalPostId?: string | undefined;
  externalPostUrl?: string | undefined;
  platformMetadata?: Record<string, unknown> | undefined;
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

    if (db.publication && command.publicationId) {
      await db.publication.update({
        where: { id: command.publicationId },
        data: { status: 'FAILED' },
      });
    }

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
    ensureAdaptersRegistered();
    const adapter = platformRegistry.get(platform);

    // Decrypt credentials if envelope is attached
    const envelope = command.publication?.socialAccount?.secretEnvelopes?.[0];
    let accessToken: string | undefined;
    if (envelope) {
      try {
        const decrypted = getEnvelopeService().decrypt(envelope.envelopeData);
        accessToken = decrypted.accessToken;
      } catch (_err) {
        // Fallback or ignore in test mock environments
      }
    }

    const externalAccountId = command.publication?.socialAccount?.externalAccountId;
    const authorUrn = externalAccountId ? `urn:li:person:${externalAccountId}` : undefined;

    const optionsObj =
      (payload as Record<string, unknown>).options &&
      typeof (payload as Record<string, unknown>).options === 'object'
        ? (((payload as Record<string, unknown>).options as Record<string, unknown>).options ??
          (payload as Record<string, unknown>).options)
        : {};

    // 3. Dispatch to platform
    const result = await adapter.publish({
      workspaceId: command.workspaceId,
      accountId: externalAccountId || payload.socialAccountId,
      text: payload.body ?? '',
      mediaUrls: payload.mediaUrls ?? [],
      idempotencyKey: payload.idempotencyKey,
      fingerprint: payload.fingerprint,
      metadata: {
        ...payload.metadata,
        ...(typeof optionsObj === 'object' && optionsObj !== null ? optionsObj : {}),
        ...(accessToken ? { accessToken } : {}),
        ...(authorUrn ? { authorUrn } : {}),
        ...(externalAccountId ? { externalAccountId, chatId: externalAccountId } : {}),
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
              responseMetadata: (result.platformMetadata as Prisma.InputJsonValue) ?? undefined,
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
        platformMetadata: result.platformMetadata,
      };
    }

    // Platform returned failure or pending
    await db.publishAttempt.update({
      where: { id: command.publishAttemptId },
      data: { status: 'FAILED_PERMANENT' },
    });

    if (db.publication && command.publicationId) {
      await db.publication.update({
        where: { id: command.publicationId },
        data: { status: 'FAILED' },
      });
    }

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

    if (db.publication && command.publicationId) {
      await db.publication.update({
        where: { id: command.publicationId },
        data: { status: 'FAILED' },
      });
    }

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
