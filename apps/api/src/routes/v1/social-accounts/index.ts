import type { FastifyPluginAsync } from 'fastify';
import { prisma } from 'scriora-core';
import { z } from 'zod';
import { err, ok } from '../../../lib/response.js';
import { verifyAuth } from '../../../middleware/auth.js';
import { verifyWorkspace } from '../../../middleware/workspace.js';

const AccountParamsSchema = z.object({
  accountId: z.string().uuid('Invalid accountId: must be a valid UUID'),
});

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
};
