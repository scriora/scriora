import { prisma } from 'scriora-core';
import type { SocialPlatformType } from 'scriora-social';
import { platformRegistry } from 'scriora-social';
import { inngest } from '../inngest/client.js';

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

    const isVerified = await step.run('verify-with-platform', async () => {
      const platformType = platform as SocialPlatformType;
      if (!platformRegistry.has(platformType)) {
        return false;
      }
      try {
        const adapter = platformRegistry.get(platformType);
        return await adapter.verify(externalPostId);
      } catch {
        return false;
      }
    });

    await step.run('update-verification-state', async () => {
      const latestAttempt = await prisma.publishAttempt.findFirst({
        where: { publicationId },
        orderBy: { attemptNumber: 'desc' },
      });

      if (isVerified) {
        await prisma.$transaction([
          prisma.publication.update({
            where: { id: publicationId },
            data: {
              status: 'PUBLISHED',
            },
          }),
          ...(latestAttempt
            ? [
                prisma.publishAttempt.update({
                  where: { id: latestAttempt.id },
                  data: {
                    status: 'SUCCEEDED',
                    completedAt: new Date(),
                  },
                }),
              ]
            : []),
        ]);
      } else {
        await prisma.$transaction([
          prisma.publication.update({
            where: { id: publicationId },
            data: {
              status: 'UNKNOWN_EXTERNAL_STATE',
            },
          }),
          ...(latestAttempt
            ? [
                prisma.publishAttempt.update({
                  where: { id: latestAttempt.id },
                  data: {
                    status: 'UNKNOWN_EXTERNAL_STATE',
                    completedAt: new Date(),
                  },
                }),
              ]
            : []),
        ]);
      }
    });

    return { publicationId, isVerified };
  }
);
