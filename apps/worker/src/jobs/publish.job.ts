import { prisma } from 'scriora-core';
import { platformRegistry, type SocialPlatformType } from 'scriora-social';
import { inngest } from '../inngest/client.js';
import {
  failClaimedOutbox,
  prepareOutboxDispatch,
  recordPublishSuccessSafely,
  recordUnknownExternalState,
} from '../lib/outbox-safety.js';
import { abortPublishIfBlocked } from '../lib/publication-dispatch-guard.js';
import {
  dispatchToPlatformOnce,
  PUBLISH_JOB_OPTIONS,
  shouldScheduleVerify,
  stepOutputContainsPlaintextSecret,
} from '../lib/publish-mutation-policy.js';
import { SecretEnvelopeService } from '../lib/secret-envelope.service.js';

let envelopeServiceInstance: SecretEnvelopeService | null = null;
function getEnvelopeService(): SecretEnvelopeService {
  if (!envelopeServiceInstance) {
    envelopeServiceInstance = new SecretEnvelopeService();
  }
  return envelopeServiceInstance;
}

export const publishJob = inngest.createFunction(
  {
    id: PUBLISH_JOB_OPTIONS.id,
    name: PUBLISH_JOB_OPTIONS.name,
    retries: PUBLISH_JOB_OPTIONS.retries,
    triggers: [{ event: 'scriora/publication.requested' }],
  },
  async ({ event, step }) => {
    const rawOutboxCommandId = (event.data as { outboxCommandId?: unknown })?.outboxCommandId;
    if (typeof rawOutboxCommandId !== 'string' || !rawOutboxCommandId.trim()) {
      throw new Error(
        'INVALID_EVENT_DATA: outboxCommandId is required and must be a non-empty string'
      );
    }
    const outboxCommandId = rawOutboxCommandId.trim();

    // 1. Fetch Outbox Command & associated domain records
    const outboxRecord = await step.run('fetch-outbox-record', async () => {
      const cmd = await prisma.outboxCommand.findUnique({
        where: { id: outboxCommandId },
        include: {
          publication: {
            include: {
              contentVariant: {
                include: { content: true },
              },
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

      if (!cmd) {
        throw new Error(`OutboxCommand not found: ${outboxCommandId}`);
      }

      return cmd;
    });

    const gate = await step.run('claim-outbox', async () => {
      return prepareOutboxDispatch(prisma, {
        outboxCommandId,
        outboxStatus: outboxRecord.status,
        publicationId: outboxRecord.publicationId ?? outboxRecord.publication?.id,
        publicationStatus: outboxRecord.publication?.status,
      });
    });

    if (gate.action === 'NOOP') {
      return { status: 'NOOP', reason: gate.reason };
    }
    if (gate.action !== 'PROCEED') {
      return { status: 'ABORTED', reason: gate.reason };
    }

    const pub = outboxRecord.publication;
    if (!pub) {
      throw new Error(`Publication record missing for outboxCommand: ${outboxCommandId}`);
    }

    const account = pub.socialAccount;
    if (!account?.id || !account.platform || !account.externalAccountId) {
      await step.run('handle-invalid-account', async () => {
        await prisma.$transaction([
          prisma.publishAttempt.update({
            where: { id: outboxRecord.publishAttemptId },
            data: {
              status: 'FAILED_PERMANENT',
              errorCode: 'INVALID_ACCOUNT',
              errorMessage: 'Social account is missing or has invalid configuration',
              completedAt: new Date(),
            },
          }),
          prisma.publication.update({
            where: { id: pub.id },
            data: { status: 'FAILED' },
          }),
          prisma.outboxCommand.update({
            where: { id: outboxCommandId },
            data: { status: 'FAILED' },
          }),
        ]);
      });
      return { status: 'FAILED_PERMANENT', reason: 'Invalid social account' };
    }

    const envelope = account.secretEnvelopes?.[0];

    if (!envelope) {
      await step.run('handle-missing-credentials', async () => {
        await prisma.$transaction([
          prisma.publishAttempt.update({
            where: { id: outboxRecord.publishAttemptId },
            data: {
              status: 'FAILED_PERMANENT',
              errorCode: 'MISSING_CREDENTIALS',
              errorMessage: 'No active SecretEnvelope found for social account',
              completedAt: new Date(),
            },
          }),
          prisma.publication.update({
            where: { id: pub.id },
            data: { status: 'FAILED' },
          }),
          prisma.outboxCommand.update({
            where: { id: outboxCommandId },
            data: { status: 'FAILED' },
          }),
        ]);
      });
      return { status: 'FAILED_PERMANENT', reason: 'Missing credentials' };
    }

    // Decrypt inside the mutation step so plaintext tokens are never checkpointed.
    const publishResult = await step.run('dispatch-to-platform', async () => {
      const payload = outboxRecord.payload as Record<string, unknown>;
      const optionsObj =
        payload.options && typeof payload.options === 'object'
          ? (((payload.options as Record<string, unknown>).options as Record<string, unknown>) ??
            payload.options)
          : {};

      const result = await dispatchToPlatformOnce({
        isBlocked: async () => {
          const latestPublication = await prisma.publication.findUnique({
            where: { id: pub.id },
            select: { status: true },
          });
          const blocked = abortPublishIfBlocked(latestPublication?.status);
          return blocked ? { reason: blocked.reason } : null;
        },
        getAdapter: () => {
          if (!platformRegistry.has(account.platform as unknown as SocialPlatformType)) {
            return null;
          }
          return platformRegistry.get(account.platform as unknown as SocialPlatformType);
        },
        decryptCredentials: () => getEnvelopeService().decrypt(envelope.envelopeData),
        buildPublishRequest: (accessToken) => ({
          workspaceId: pub.workspaceId,
          accountId: account.externalAccountId,
          text: (payload.body as string) || pub.contentVariant.body || '',
          mediaUrls: (payload.mediaUrls as string[]) || [],
          idempotencyKey: outboxRecord.id,
          fingerprint: pub.fingerprint,
          metadata: {
            accessToken,
            authorUrn: account.externalAccountId
              ? `urn:li:person:${account.externalAccountId}`
              : undefined,
            chatId: account.externalAccountId,
            externalAccountId: account.externalAccountId,
            options: payload.options,
            ...(typeof optionsObj === 'object' && optionsObj !== null ? optionsObj : {}),
          },
        }),
      });

      if (stepOutputContainsPlaintextSecret(result)) {
        if (result.kind === 'success') {
          return {
            kind: 'success' as const,
            externalPostId: result.externalPostId,
            externalPostUrl: result.externalPostUrl ?? null,
          };
        }
        if (result.kind === 'unknown_external_state') {
          return {
            kind: 'unknown_external_state' as const,
            reason: result.reason,
            externalPostId: null,
            externalPostUrl: result.externalPostUrl ?? null,
          };
        }
        if (result.kind === 'failure') {
          return {
            kind: 'failure' as const,
            code: result.code,
            message: result.message,
            retryable: result.retryable,
          };
        }
        return { kind: 'aborted' as const, reason: result.reason };
      }
      return result;
    });

    if (publishResult.kind === 'aborted') {
      await step.run('abort-blocked-dispatch', async () => {
        await failClaimedOutbox(prisma, outboxCommandId, {
          code: 'DISPATCH_ABORTED',
          message: publishResult.reason,
        });
      });
      return { status: 'ABORTED', reason: publishResult.reason };
    }

    if (publishResult.kind === 'unknown_external_state') {
      const recorded = await step.run('record-unknown-external-state', async () => {
        return recordUnknownExternalState(prisma, {
          publicationId: pub.id,
          outboxCommandId,
          publishAttemptId: outboxRecord.publishAttemptId,
          externalPostId: publishResult.externalPostId,
          externalPostUrl: publishResult.externalPostUrl ?? null,
          reason: publishResult.reason,
        });
      });

      return {
        status: 'UNKNOWN_EXTERNAL_STATE',
        reason: publishResult.reason,
        recorded: recorded.outcome,
      };
    }

    if (publishResult.kind === 'success') {
      const { externalPostId, externalPostUrl } = publishResult;

      const recorded = await step.run('record-success', async () => {
        return recordPublishSuccessSafely(prisma, {
          publicationId: pub.id,
          outboxCommandId,
          publishAttemptId: outboxRecord.publishAttemptId,
          externalPostId,
          externalPostUrl: externalPostUrl ?? null,
        });
      });

      if (recorded.outcome === 'CONFLICT_TERMINAL') {
        return {
          status: 'UNKNOWN_EXTERNAL_STATE',
          reason: `Publication already ${recorded.publicationStatus}; refusing to overwrite with PUBLISHED`,
        };
      }

      if (recorded.outcome === 'ALREADY_PUBLISHED') {
        return { status: 'NOOP', reason: 'Publication already PUBLISHED' };
      }

      if (shouldScheduleVerify(externalPostId)) {
        await step.sleep('wait-for-platform-ingest', '60s');
        await step.sendEvent('trigger-verification', {
          name: 'scriora/publication.verify',
          data: {
            publicationId: pub.id,
            externalPostId,
            platform: account.platform,
          },
        });
      }

      return { status: 'PUBLISHED', externalPostId, externalPostUrl };
    }

    const errorData = publishResult;
    const isRetryable = errorData.retryable;

    await step.run('record-failure', async () => {
      await prisma.$transaction([
        prisma.publishAttempt.update({
          where: { id: outboxRecord.publishAttemptId },
          data: {
            status: isRetryable ? 'RESERVED' : 'FAILED_PERMANENT',
            errorCode: errorData.code,
            errorMessage: errorData.message,
            retryable: isRetryable,
            completedAt: new Date(),
          },
        }),
        prisma.publication.update({
          where: { id: pub.id },
          data: {
            status: isRetryable ? 'READY' : 'FAILED',
          },
        }),
        prisma.outboxCommand.update({
          where: { id: outboxCommandId },
          data: {
            status: isRetryable ? 'PENDING' : 'FAILED',
            lastError: { code: errorData.code, message: errorData.message },
          },
        }),
      ]);
    });

    // Retryable platform errors go back to PENDING for the outbox sweep.
    // Do not throw — Inngest would replay dispatch-to-platform.
    return {
      status: isRetryable ? 'RETRYABLE' : 'FAILED_PERMANENT',
      error: errorData,
    };
  }
);
