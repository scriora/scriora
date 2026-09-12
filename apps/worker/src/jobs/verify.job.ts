import { prisma } from 'scriora-core';
import type { SocialPlatformType } from 'scriora-social';
import { platformRegistry } from 'scriora-social';
import { inngest } from '../inngest/client.js';
import { SecretEnvelopeService } from '../lib/secret-envelope.service.js';
import {
  applyVerificationOutcome,
  probePublicationLive,
  resolveVerifyAccessToken,
} from '../lib/verify-publication-state.js';

let envelopeServiceInstance: SecretEnvelopeService | null = null;
function getEnvelopeService(): SecretEnvelopeService {
  if (!envelopeServiceInstance) {
    envelopeServiceInstance = new SecretEnvelopeService();
  }
  return envelopeServiceInstance;
}

export const verifyJob = inngest.createFunction(
  {
    id: 'verify-social-publication',
    name: 'Verify Social Publication Status',
    retries: 2,
    triggers: [{ event: 'scriora/publication.verify' }],
  },
  async ({ event, step }) => {
    const rawData = event.data as {
      publicationId?: unknown;
      externalPostId?: unknown;
      platform?: unknown;
    };

    if (
      typeof rawData?.publicationId !== 'string' ||
      typeof rawData?.externalPostId !== 'string' ||
      typeof rawData?.platform !== 'string'
    ) {
      throw new Error(
        'INVALID_EVENT_DATA: publicationId, externalPostId, and platform must be non-empty strings'
      );
    }

    const { publicationId, externalPostId, platform } = rawData;

    const probe = await step.run('verify-with-platform', async () => {
      const publication = await prisma.publication.findUnique({
        where: { id: publicationId },
        select: {
          socialAccount: {
            select: {
              secretEnvelopes: {
                take: 1,
                select: { envelopeData: true },
              },
            },
          },
        },
      });

      const envelopeData = publication?.socialAccount?.secretEnvelopes?.[0]?.envelopeData;
      let accessToken: string | undefined;
      if (envelopeData) {
        try {
          accessToken = resolveVerifyAccessToken({
            envelopeData,
            decrypt: (data) => getEnvelopeService().decrypt(data as never),
          });
        } catch {
          accessToken = undefined;
        }
      }

      const platformType = platform as SocialPlatformType;
      return probePublicationLive({
        externalPostId,
        platform: platformType,
        accessToken,
        hasAdapter: (candidate) => platformRegistry.has(candidate as SocialPlatformType),
        getAdapter: (candidate) => platformRegistry.get(candidate as SocialPlatformType),
      });
    });

    const applied = await step.run('update-verification-state', async () => {
      const latestAttempt = await prisma.publishAttempt.findFirst({
        where: { publicationId },
        orderBy: { attemptNumber: 'desc' },
        select: { id: true },
      });

      return applyVerificationOutcome(prisma, {
        publicationId,
        probe,
        latestAttemptId: latestAttempt?.id,
      });
    });

    return { publicationId, probe, applied };
  }
);
