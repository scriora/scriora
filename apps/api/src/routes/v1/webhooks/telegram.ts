import type { FastifyPluginAsync } from 'fastify';
import { prisma } from 'scriora-core';
import { TelegramBotService, type TelegramDbContext, type TelegramUpdate } from 'scriora-social';
import { err } from '../../../lib/response.js';
import {
  createTelegramC2Post,
  handleTelegramC2ApprovalDecision,
  resolveTelegramC2Workspace,
} from '../../../lib/telegram-c2-create-post.js';

export const telegramWebhookRoutes: FastifyPluginAsync = async (fastify) => {
  const botToken = process.env.TELEGRAM_BOT_TOKEN ?? '';
  const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID?.trim();
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (!botToken) {
    fastify.log.warn('TELEGRAM_BOT_TOKEN is not configured in environment variables.');
    return;
  }

  if (!adminChatId) {
    fastify.log.warn(
      'TELEGRAM_ADMIN_CHAT_ID is unset; Telegram C2 commands including /post are denied (fail-closed).'
    );
  }

  const botService = new TelegramBotService({
    botToken,
    ...(adminChatId ? { adminChatId } : {}),
  });

  const dbContext: TelegramDbContext = {
    getSystemStatus: async () => {
      const workspace = await resolveTelegramC2Workspace(prisma);

      const [accountsCount, pendingOutbox, recentPubs] = await Promise.all([
        prisma.socialAccount.count({
          where: { workspaceId: workspace.id, status: 'CONNECTED' },
        }),
        prisma.outboxCommand.count({
          where: { workspaceId: workspace.id, status: 'PENDING' },
        }),
        prisma.publication.count({
          where: { workspaceId: workspace.id },
        }),
      ]);

      return {
        workspaceName: workspace.name || 'Scriora HQ',
        connectedAccounts: accountsCount,
        pendingOutboxCount: pendingOutbox,
        recentPublicationsCount: recentPubs,
      };
    },

    listAccounts: async () => {
      const workspace = await resolveTelegramC2Workspace(prisma);
      const accounts = await prisma.socialAccount.findMany({
        where: { workspaceId: workspace.id, status: 'CONNECTED' },
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
      return createTelegramC2Post(prisma, params);
    },

    handleApprovalDecision: async (token: string, decision: 'APPROVED' | 'REJECTED') => {
      return handleTelegramC2ApprovalDecision(prisma, token, decision);
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
