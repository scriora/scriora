import crypto from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { prisma } from 'scriora-core';
import { TelegramBotService, type TelegramDbContext, type TelegramUpdate } from 'scriora-social';
import { err } from '../../../lib/response.js';

export const telegramWebhookRoutes: FastifyPluginAsync = async (fastify) => {
  const botToken = process.env.TELEGRAM_BOT_TOKEN ?? '';
  const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (!botToken) {
    fastify.log.warn('TELEGRAM_BOT_TOKEN is not configured in environment variables.');
    return;
  }

  const botService = new TelegramBotService({
    botToken,
    ...(adminChatId ? { adminChatId } : {}),
  });

  const dbContext: TelegramDbContext = {
    getSystemStatus: async () => {
      const workspace = await prisma.workspace.findFirst({
        orderBy: { createdAt: 'asc' },
      });
      const wsId = workspace?.id;

      const [accountsCount, pendingOutbox, recentPubs] = await Promise.all([
        prisma.socialAccount.count({
          where: wsId ? { workspaceId: wsId, status: 'CONNECTED' } : { status: 'CONNECTED' },
        }),
        prisma.outboxCommand.count({
          where: { status: 'PENDING' },
        }),
        prisma.publication.count({
          where: wsId ? { workspaceId: wsId } : {},
        }),
      ]);

      return {
        workspaceName: workspace?.name || 'Scriora HQ',
        connectedAccounts: accountsCount,
        pendingOutboxCount: pendingOutbox,
        recentPublicationsCount: recentPubs,
      };
    },

    listAccounts: async () => {
      const accounts = await prisma.socialAccount.findMany({
        where: { status: 'CONNECTED' },
        select: { platform: true, accountName: true, status: true },
        orderBy: { platform: 'asc' },
      });

      return accounts.map((a) => ({
        platform: a.platform,
        name: a.accountName,
        status: a.status,
      }));
    },

    createPost: async (params: { text: string; mediaUrls?: string[] | undefined }) => {
      const workspace = await prisma.workspace.findFirst({
        orderBy: { createdAt: 'asc' },
        include: { members: { take: 1 } },
      });

      if (!workspace) {
        throw new Error('No active workspace found');
      }

      const activeAccounts = await prisma.socialAccount.findMany({
        where: { workspaceId: workspace.id, status: 'CONNECTED' },
      });

      if (activeAccounts.length === 0) {
        throw new Error('No connected social accounts found in workspace');
      }

      const userId = workspace.ownerUserId;
      const idempotencyBase = crypto.randomUUID();

      const created = await prisma.$transaction(async (tx) => {
        const content = await tx.content.create({
          data: {
            workspaceId: workspace.id,
            title: params.text.slice(0, 80),
            body: params.text,
            status: 'READY',
            createdByUserId: userId,
          },
        });

        const outboxCommands = [];

        for (const account of activeAccounts) {
          const variant = await tx.contentVariant.create({
            data: {
              workspaceId: workspace.id,
              contentId: content.id,
              socialAccountId: account.id,
              body: params.text,
              metadata: { mediaUrls: params.mediaUrls || [] },
              status: 'READY',
            },
          });

          const targetIdempotency = `${idempotencyBase}:${account.id}`;
          const fingerprint = crypto
            .createHash('sha256')
            .update(`${content.id}:${account.id}:${params.text}`)
            .digest('hex');

          const publication = await tx.publication.create({
            data: {
              workspaceId: workspace.id,
              contentVariantId: variant.id,
              socialAccountId: account.id,
              status: 'READY',
              idempotencyKey: targetIdempotency,
              fingerprint,
              createdByUserId: userId,
            },
          });

          const attempt = await tx.publishAttempt.create({
            data: {
              workspaceId: workspace.id,
              publicationId: publication.id,
              attemptNumber: 1,
              status: 'RESERVED',
              idempotencyKey: targetIdempotency,
              fingerprint,
            },
          });

          const payloadJson = {
            body: params.text,
            platform: account.platform,
            socialAccountId: account.id,
            mediaUrls: params.mediaUrls || [],
            idempotencyKey: targetIdempotency,
            fingerprint,
            options: {},
          };

          const outboxCmd = await tx.outboxCommand.create({
            data: {
              workspaceId: workspace.id,
              publicationId: publication.id,
              publishAttemptId: attempt.id,
              commandType: 'SOCIAL_PUBLISH',
              payload: payloadJson,
              status: 'PENDING',
              availableAt: new Date(),
            },
          });

          outboxCommands.push(outboxCmd);
        }

        return { publicationCount: outboxCommands.length, outboxCommands };
      });

      return { publicationCount: created.publicationCount };
    },

    handleApprovalDecision: async (token: string, decision: 'APPROVED' | 'REJECTED') => {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      const tokenRecord = await prisma.approvalToken.findFirst({
        where: { tokenHash },
        include: { approval: true },
      });

      if (!tokenRecord || tokenRecord.usedAt !== null || tokenRecord.expiresAt < new Date()) {
        return false;
      }

      await prisma.$transaction(async (tx) => {
        await tx.approvalToken.update({
          where: { id: tokenRecord.id },
          data: { usedAt: new Date() },
        });

        await tx.approval.update({
          where: { id: tokenRecord.approval.id },
          data: {
            status: decision,
            decidedAt: new Date(),
            decisionNote: `Decided via Telegram Admin C2 by authorized owner`,
          },
        });

        if (tokenRecord.approval.resourceType === 'PUBLICATION') {
          const newStatus = decision === 'APPROVED' ? 'READY' : 'CANCELLED';
          const pub = await tx.publication.findUnique({
            where: { id: tokenRecord.approval.resourceId },
            include: { contentVariant: true },
          });

          if (pub) {
            const relatedPubs = await tx.publication.findMany({
              where: { contentVariant: { contentId: pub.contentVariant.contentId } },
              select: { id: true },
            });
            const allPubIds = relatedPubs.map((p) => p.id);

            await tx.publication.updateMany({
              where: { id: { in: allPubIds } },
              data: { status: newStatus },
            });

            if (decision === 'REJECTED') {
              await tx.outboxCommand.deleteMany({
                where: { publicationId: { in: allPubIds }, status: 'PENDING' },
              });
            }
          }
        }
      });

      return true;
    },
  };

  fastify.post('/', async (request, reply) => {
    // 1. Verify Webhook Secret if configured
    if (webhookSecret) {
      const headerSecret = request.headers['x-telegram-bot-api-secret-token'];
      if (headerSecret !== webhookSecret) {
        return reply
          .status(401)
          .send(err('INVALID_WEBHOOK_SECRET', 'AUTHENTICATION_ERROR', 'Unauthorized', request.id));
      }
    }

    // 2. Pass update to TelegramBotService
    const update = request.body as TelegramUpdate;
    if (update) {
      // Fire-and-forget or await handling
      await botService.handleUpdate(update, dbContext);
    }

    return reply.status(200).send({ ok: true });
  });
};
