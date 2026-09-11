import { prisma } from 'scriora-core';
import { PlatformError, platformRegistry, type SocialPlatformType } from 'scriora-social';
import { inngest } from '../inngest/client.js';
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
    id: 'publish-social-post',
    name: 'Publish Social Post via Transactional Outbox',
    retries: 3,
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

    // Mark Outbox PROCESSING
    await step.run('claim-outbox', async () => {
      await prisma.outboxCommand.update({
        where: { id: outboxCommandId },
        data: {
          status: 'PROCESSING',
          claimedAt: new Date(),
          attempts: { increment: 1 },
        },
      });
    });

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

    // 2. Decrypt OAuth access token directly from fetched envelope (no redundant DB query)
    const decrypted = await step.run('decrypt-credentials', async () => {
      return getEnvelopeService().decrypt(envelope.envelopeData);
    });

    // 3. Dispatch to Social Adapter
    const publishResult = await step.run('dispatch-to-platform', async () => {
      const adapter = platformRegistry.get(account.platform as unknown as SocialPlatformType);
      if (!adapter) {
        throw new Error(`No adapter registered for platform: ${account.platform}`);
      }

      const payload = outboxRecord.payload as Record<string, unknown>;

      try {
        const result = await adapter.publish({
          workspaceId: pub.workspaceId,
          accountId: account.externalAccountId,
          text: (payload.body as string) || pub.contentVariant.body || '',
          mediaUrls: (payload.mediaUrls as string[]) || [],
          idempotencyKey: outboxRecord.id,
          fingerprint: pub.fingerprint,
          metadata: {
            accessToken: decrypted.accessToken,
            authorUrn: account.externalAccountId
              ? `urn:li:person:${account.externalAccountId}`
              : undefined,
            chatId: account.externalAccountId,
            externalAccountId: account.externalAccountId,
            options: payload.options,
          },
        });

        return { success: true as const, result };
      } catch (err: unknown) {
        if (err instanceof PlatformError) {
          return {
            success: false as const,
            code: err.code,
            message: err.message,
            retryable: err.retryable,
            retryAfterMs: err.retryAfterMs,
          };
        }

        return {
          success: false as const,
          code: 'UNEXPECTED_FAILURE',
          message: err instanceof Error ? err.message : String(err),
          retryable: false,
        };
      }
    });

    // 4. Record result in Database
    if (publishResult.success && publishResult.result) {
      const { externalPostId, externalPostUrl } = publishResult.result;

      await step.run('record-success', async () => {
        await prisma.$transaction([
          prisma.publishAttempt.update({
            where: { id: outboxRecord.publishAttemptId },
            data: {
              status: 'SUCCEEDED',
              externalId: externalPostId || null,
              externalUrl: externalPostUrl || null,
              completedAt: new Date(),
            },
          }),
          prisma.publication.update({
            where: { id: pub.id },
            data: {
              status: 'PUBLISHED',
              publishedAt: new Date(),
              externalPostId: externalPostId || null,
              externalPostUrl: externalPostUrl || null,
            },
          }),
          prisma.outboxCommand.update({
            where: { id: outboxCommandId },
            data: {
              status: 'PUBLISHED',
              processedAt: new Date(),
            },
          }),
        ]);
      });

      // 5. Trigger post verification after 60 seconds (§3.1 Intent != Result)
      if (externalPostId) {
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
    } else {
      // Handle failure
      const errorData = publishResult as {
        success: false;
        code: string;
        message: string;
        retryable: boolean;
      };
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

      if (isRetryable) {
        throw new Error(`Retryable platform error (${errorData.code}): ${errorData.message}`);
      }

      return { status: 'FAILED_PERMANENT', error: errorData };
    }
  }
);
