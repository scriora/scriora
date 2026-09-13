import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from 'scriora-core';
import { TelegramBotService, type TelegramDbContext, type TelegramUpdate } from 'scriora-social';
import { err } from '../../../lib/response.js';
import {
  createTelegramC2Post,
  handleTelegramC2ApprovalDecision,
  resolveTelegramC2Workspace,
} from '../../../lib/telegram-c2-create-post.js';
import {
  readTelegramWebhookSecret,
  TELEGRAM_WEBHOOK_SECRET_HEADER,
  telegramWebhookSecretMatches,
} from '../../../lib/telegram-webhook-auth.js';

function rejectTelegramWebhook(request: FastifyRequest, reply: FastifyReply) {
  return reply
    .status(401)
    .send(err('INVALID_WEBHOOK_SECRET', 'AUTHENTICATION_ERROR', 'Unauthorized', request.id));
}

export const telegramWebhookRoutes: FastifyPluginAsync = async (fastify) => {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim() ?? '';
  const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID?.trim();
  const webhookSecret = readTelegramWebhookSecret();

  if (!botToken) {
    fastify.log.warn('TELEGRAM_BOT_TOKEN is not configured; Telegram webhook is disabled.');
  }

  if (!webhookSecret) {
    fastify.log.warn(
      'TELEGRAM_WEBHOOK_SECRET is unset; Telegram webhook POST is rejected (fail-closed).'
    );
  }

  if (!adminChatId) {
    fastify.log.warn(
      'TELEGRAM_ADMIN_CHAT_ID is unset; Telegram C2 commands including /post are denied (fail-closed).'
    );
  }

  const botService = botToken
    ? new TelegramBotService({
        botToken,
        ...(adminChatId ? { adminChatId } : {}),
      })
    : null;

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
    if (!botService || !webhookSecret) {
      return rejectTelegramWebhook(request, reply);
    }
    const headerSecret = request.headers[TELEGRAM_WEBHOOK_SECRET_HEADER];
    if (!telegramWebhookSecretMatches(headerSecret, webhookSecret)) {
      return rejectTelegramWebhook(request, reply);
    }

    const update = request.body as TelegramUpdate;
    if (update) {
      await botService.handleUpdate(update, dbContext);
    }

    return reply.status(200).send({ ok: true });
  });
};
