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
    const { publicationId, externalPostId, platform } = event.data as {
      publicationId: string;
      externalPostId: string;
      platform: string;
    };

    const isVerified = await step.run('verify-with-platform', async () => {
      const adapter = platformRegistry.get(platform as unknown as SocialPlatformType);
      if (!adapter) return false;
      return adapter.verify(externalPostId);
    });

    await step.run('update-verification-state', async () => {
      if (isVerified) {
        await prisma.publication.update({
          where: { id: publicationId },
          data: {
            status: 'PUBLISHED',
          },
        });
      } else {
        await prisma.publication.update({
          where: { id: publicationId },
          data: {
            status: 'UNKNOWN_EXTERNAL_STATE',
          },
        });
      }
    });

    return { publicationId, isVerified };
  }
);
