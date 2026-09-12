import type { FastifyPluginAsync } from 'fastify';
import { adaptiveScheduleService, prisma } from 'scriora-core';
import { PlatformError, platformRegistry } from 'scriora-social';
import { z } from 'zod';
import { decryptEnvelopePayload } from '../../../lib/crypto.js';
import { err, ok } from '../../../lib/response.js';
import { verifyAuth } from '../../../middleware/auth.js';
import { verifyWorkspace } from '../../../middleware/workspace.js';

const AccountParamsSchema = z.object({
  accountId: z.string().uuid('Invalid accountId: must be a valid UUID'),
});

const SendMessageSchema = z.object({
  recipientId: z.string().min(1, 'recipientId is required'),
  text: z.string().min(1, 'text is required').max(10000, 'text exceeds max length'),
});

const ListMessagesQuerySchema = z.object({
  maxResults: z.coerce.number().int().min(1).max(100).default(20).optional(),
  paginationToken: z.string().optional(),
});

const SmartScheduleQuerySchema = z.object({
  daysAhead: z.coerce.number().int().min(1).max(30).default(7).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10).optional(),
  timezone: z.string().min(1).max(100).optional(),
  startDate: z.coerce.date().optional(),
});

interface DirectMessageCapableAdapter {
  sendDirectMessage(params: {
    recipientId: string;
    text: string;
    accessToken: string;
  }): Promise<unknown>;
  listDirectMessages(params: {
    maxResults?: number | undefined;
    paginationToken?: string | undefined;
    accessToken: string;
  }): Promise<unknown>;
}

export const socialAccountRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', verifyAuth);
  fastify.addHook('preHandler', verifyWorkspace);

  // 1. List accounts in workspace
  fastify.get('/', async (request, reply) => {
    const workspaceId = request.workspace!.id;
    const accounts = await prisma.socialAccount.findMany({
      where: { workspaceId },
      select: {
        id: true,
        platform: true,
        externalAccountId: true,
        accountName: true,
        status: true,
        capabilities: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return reply.status(200).send(ok(accounts, request.id));
  });

  // 2. Get single account
  fastify.get('/:accountId', async (request, reply) => {
    const paramResult = AccountParamsSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply
        .status(400)
        .send(
          err(
            'VALIDATION_ERROR',
            'VALIDATION_ERROR',
            'Invalid accountId: must be a valid UUID',
            request.id
          )
        );
    }
    const { accountId } = paramResult.data;
    const workspaceId = request.workspace!.id;

    const account = await prisma.socialAccount.findFirst({
      where: { id: accountId, workspaceId },
      select: {
        id: true,
        platform: true,
        externalAccountId: true,
        accountName: true,
        status: true,
        capabilities: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!account) {
      return reply
        .status(404)
        .send(
          err(
            'ACCOUNT_NOT_FOUND',
            'NOT_FOUND',
            'Social account not found in this workspace',
            request.id
          )
        );
    }

    return reply.status(200).send(ok(account, request.id));
  });

  // 3. Disconnect account
  fastify.delete('/:accountId', async (request, reply) => {
    const paramResult = AccountParamsSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply
        .status(400)
        .send(
          err(
            'VALIDATION_ERROR',
            'VALIDATION_ERROR',
            'Invalid accountId: must be a valid UUID',
            request.id
          )
        );
    }
    const { accountId } = paramResult.data;
    const workspaceId = request.workspace!.id;

    if (request.workspace!.role === 'VIEWER') {
      return reply
        .status(403)
        .send(err('FORBIDDEN', 'AUTHORIZATION_ERROR', 'Permission denied', request.id));
    }

    const deleted = await prisma.socialAccount.deleteMany({
      where: { id: accountId, workspaceId },
    });

    if (deleted.count === 0) {
      return reply
        .status(404)
        .send(err('ACCOUNT_NOT_FOUND', 'NOT_FOUND', 'Social account not found', request.id));
    }

    return reply.status(204).send();
  });

  // 4. Send Direct Message via Account
  fastify.post('/:accountId/messages', async (request, reply) => {
    const paramResult = AccountParamsSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply
        .status(400)
        .send(
          err(
            'VALIDATION_ERROR',
            'VALIDATION_ERROR',
            'Invalid accountId: must be a valid UUID',
            request.id
          )
        );
    }
    const { accountId } = paramResult.data;
    const workspaceId = request.workspace!.id;

    if (request.workspace!.role === 'VIEWER') {
      return reply
        .status(403)
        .send(err('FORBIDDEN', 'AUTHORIZATION_ERROR', 'Permission denied', request.id));
    }

    const bodyResult = SendMessageSchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.status(400).send(
        err(
          'VALIDATION_ERROR',
          'VALIDATION_ERROR',
          'Invalid message payload',
          request.id,
          false,
          bodyResult.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
        )
      );
    }

    const account = await prisma.socialAccount.findFirst({
      where: { id: accountId, workspaceId },
      include: {
        secretEnvelopes: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!account) {
      return reply
        .status(404)
        .send(err('ACCOUNT_NOT_FOUND', 'NOT_FOUND', 'Social account not found', request.id));
    }

    const envelope = account.secretEnvelopes[0];
    if (!envelope) {
      return reply
        .status(400)
        .send(
          err(
            'CREDENTIALS_NOT_FOUND',
            'AUTHENTICATION_ERROR',
            'No credentials found for this account',
            request.id
          )
        );
    }

    let accessToken: string;
    try {
      const decrypted = decryptEnvelopePayload(envelope.envelopeData);
      accessToken = (decrypted.accessToken as string) || '';
    } catch {
      return reply
        .status(500)
        .send(
          err(
            'DECRYPTION_FAILED',
            'INTERNAL_ERROR',
            'Failed to decrypt account credentials',
            request.id
          )
        );
    }

    if (!accessToken) {
      return reply
        .status(401)
        .send(
          err(
            'MISSING_ACCESS_TOKEN',
            'AUTHENTICATION_ERROR',
            'Account has no valid access token',
            request.id
          )
        );
    }

    if (!platformRegistry.has(account.platform as Parameters<typeof platformRegistry.has>[0])) {
      return reply
        .status(400)
        .send(
          err(
            'PLATFORM_NOT_SUPPORTED',
            'VALIDATION_ERROR',
            `Platform ${account.platform} adapter not registered`,
            request.id
          )
        );
    }

    const adapter = platformRegistry.get(
      account.platform as Parameters<typeof platformRegistry.get>[0]
    );
    const dmAdapter = adapter as unknown as Partial<DirectMessageCapableAdapter>;
    if (typeof dmAdapter.sendDirectMessage !== 'function') {
      return reply
        .status(400)
        .send(
          err(
            'NOT_SUPPORTED',
            'VALIDATION_ERROR',
            `Direct Messages are not supported for platform ${account.platform}`,
            request.id
          )
        );
    }

    try {
      const result = await dmAdapter.sendDirectMessage({
        recipientId: bodyResult.data.recipientId,
        text: bodyResult.data.text,
        accessToken,
      });

      return reply.status(201).send(ok(result, request.id));
    } catch (e: unknown) {
      if (e instanceof PlatformError) {
        const httpStatus =
          e.code === 'PAYMENT_REQUIRED' ? 402 : e.code === 'RATE_LIMITED' ? 429 : 502;
        const apiCategory =
          e.code === 'PAYMENT_REQUIRED'
            ? 'AUTHORIZATION_ERROR'
            : e.code === 'RATE_LIMITED'
              ? 'RATE_LIMITED'
              : 'PLATFORM_ERROR';
        return reply
          .status(httpStatus)
          .send(err(e.code, apiCategory, e.message, request.id, e.retryable));
      }
      const message = e instanceof Error ? e.message : 'Unknown error sending direct message';
      return reply.status(500).send(err('DM_SEND_FAILED', 'PLATFORM_ERROR', message, request.id));
    }
  });

  // 5. List Direct Messages via Account
  fastify.get('/:accountId/messages', async (request, reply) => {
    const paramResult = AccountParamsSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply
        .status(400)
        .send(
          err(
            'VALIDATION_ERROR',
            'VALIDATION_ERROR',
            'Invalid accountId: must be a valid UUID',
            request.id
          )
        );
    }
    const { accountId } = paramResult.data;
    const workspaceId = request.workspace!.id;

    const queryResult = ListMessagesQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      return reply.status(400).send(
        err(
          'VALIDATION_ERROR',
          'VALIDATION_ERROR',
          'Invalid query parameters',
          request.id,
          false,
          queryResult.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
        )
      );
    }

    const account = await prisma.socialAccount.findFirst({
      where: { id: accountId, workspaceId },
      include: {
        secretEnvelopes: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!account) {
      return reply
        .status(404)
        .send(err('ACCOUNT_NOT_FOUND', 'NOT_FOUND', 'Social account not found', request.id));
    }

    const envelope = account.secretEnvelopes[0];
    if (!envelope) {
      return reply
        .status(400)
        .send(
          err(
            'CREDENTIALS_NOT_FOUND',
            'AUTHENTICATION_ERROR',
            'No credentials found for this account',
            request.id
          )
        );
    }

    let accessToken: string;
    try {
      const decrypted = decryptEnvelopePayload(envelope.envelopeData);
      accessToken = (decrypted.accessToken as string) || '';
    } catch {
      return reply
        .status(500)
        .send(
          err(
            'DECRYPTION_FAILED',
            'INTERNAL_ERROR',
            'Failed to decrypt account credentials',
            request.id
          )
        );
    }

    if (!accessToken) {
      return reply
        .status(401)
        .send(
          err(
            'MISSING_ACCESS_TOKEN',
            'AUTHENTICATION_ERROR',
            'Account has no valid access token',
            request.id
          )
        );
    }

    if (!platformRegistry.has(account.platform as Parameters<typeof platformRegistry.has>[0])) {
      return reply
        .status(400)
        .send(
          err(
            'PLATFORM_NOT_SUPPORTED',
            'VALIDATION_ERROR',
            `Platform ${account.platform} adapter not registered`,
            request.id
          )
        );
    }

    const adapter = platformRegistry.get(
      account.platform as Parameters<typeof platformRegistry.get>[0]
    );
    const dmAdapter = adapter as unknown as Partial<DirectMessageCapableAdapter>;
    if (typeof dmAdapter.listDirectMessages !== 'function') {
      return reply
        .status(400)
        .send(
          err(
            'NOT_SUPPORTED',
            'VALIDATION_ERROR',
            `Direct Messages are not supported for platform ${account.platform}`,
            request.id
          )
        );
    }

    try {
      const result = await dmAdapter.listDirectMessages({
        ...(queryResult.data.maxResults !== undefined
          ? { maxResults: queryResult.data.maxResults }
          : {}),
        ...(queryResult.data.paginationToken !== undefined
          ? { paginationToken: queryResult.data.paginationToken }
          : {}),
        accessToken,
      });

      return reply.status(200).send(ok(result, request.id));
    } catch (e: unknown) {
      if (e instanceof PlatformError) {
        const httpStatus =
          e.code === 'PAYMENT_REQUIRED' ? 402 : e.code === 'RATE_LIMITED' ? 429 : 502;
        const apiCategory =
          e.code === 'PAYMENT_REQUIRED'
            ? 'AUTHORIZATION_ERROR'
            : e.code === 'RATE_LIMITED'
              ? 'RATE_LIMITED'
              : 'PLATFORM_ERROR';
        return reply
          .status(httpStatus)
          .send(err(e.code, apiCategory, e.message, request.id, e.retryable));
      }
      const message = e instanceof Error ? e.message : 'Unknown error listing direct messages';
      return reply.status(500).send(err('DM_LIST_FAILED', 'PLATFORM_ERROR', message, request.id));
    }
  });

  // 6. Get Adaptive Smart Schedule Slots for Account
  fastify.get('/:accountId/smart-schedule', async (request, reply) => {
    const paramResult = AccountParamsSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply
        .status(400)
        .send(
          err(
            'VALIDATION_ERROR',
            'VALIDATION_ERROR',
            'Invalid accountId: must be a valid UUID',
            request.id
          )
        );
    }
    const { accountId } = paramResult.data;
    const workspaceId = request.workspace!.id;

    const queryResult = SmartScheduleQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      return reply.status(400).send(
        err(
          'VALIDATION_ERROR',
          'VALIDATION_ERROR',
          'Invalid query parameters',
          request.id,
          false,
          queryResult.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
        )
      );
    }

    try {
      const slots = await adaptiveScheduleService.getLearnedSlotsForAccount({
        socialAccountId: accountId,
        workspaceId,
        daysAhead: queryResult.data.daysAhead,
        limit: queryResult.data.limit,
        timezone: queryResult.data.timezone,
        startDate: queryResult.data.startDate,
      });

      return reply.status(200).send(ok(slots, request.id));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to calculate smart schedule slots';
      if (message.includes('not found')) {
        return reply.status(404).send(err('ACCOUNT_NOT_FOUND', 'NOT_FOUND', message, request.id));
      }
      return reply
        .status(500)
        .send(err('SCHEDULE_CALCULATION_FAILED', 'INTERNAL_ERROR', message, request.id));
    }
  });
};
