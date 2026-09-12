import type { FastifyPluginAsync } from 'fastify';
import * as scrioraCore from 'scriora-core';
import { prisma } from 'scriora-core';
import { z } from 'zod';
import { err, ok } from '../../../lib/response.js';
import { verifyAuth } from '../../../middleware/auth.js';
import { verifyWorkspace } from '../../../middleware/workspace.js';

const AuthUserIdSchema = z.string().uuid();

/**
 * Legacy POST /api/v1/publications bridge.
 * Same auth + workspace membership gates as POST /v1/posts.
 * Tenant comes from the resolved membership workspace, never from an untrusted body id.
 */
export const publicationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', verifyAuth);
  fastify.addHook('preHandler', verifyWorkspace);

  fastify.post('/', async (request, reply) => {
    const workspaceId = request.workspace!.id;
    const userId = request.authContext!.userId;

    try {
      const parsedBody = scrioraCore.CreatePublicationSchema.parse(request.body);

      if (parsedBody.workspaceId !== workspaceId) {
        return reply
          .status(403)
          .send(
            err(
              'FORBIDDEN_WORKSPACE',
              'AUTHORIZATION_ERROR',
              'You do not have access to this workspace',
              request.id
            )
          );
      }

      const attributedUserId = AuthUserIdSchema.safeParse(userId).success ? userId : undefined;
      const result = await scrioraCore.createPublicationWithOutbox(prisma, {
        ...parsedBody,
        workspaceId,
        ...(attributedUserId ? { createdByUserId: attributedUserId } : {}),
      });
      return reply.status(201).send(ok(result, request.id));
    } catch (e: unknown) {
      const errObj = e as { name?: string; message?: string; issues?: unknown[] } | null;
      if (errObj?.name === 'ZodError') {
        return reply.status(422).send({
          success: false,
          error: 'VALIDATION_ERROR',
          details: errObj.issues,
          meta: {
            requestId: request.id,
            timestamp: new Date().toISOString(),
          },
        });
      }
      if (
        errObj?.message === 'CONTENT_VARIANT_NOT_FOUND_IN_WORKSPACE' ||
        errObj?.message === 'SOCIAL_ACCOUNT_NOT_FOUND_IN_WORKSPACE'
      ) {
        return reply.status(404).send({
          success: false,
          error: errObj.message,
          meta: {
            requestId: request.id,
            timestamp: new Date().toISOString(),
          },
        });
      }
      return reply.status(500).send({
        success: false,
        error: errObj?.message || 'INTERNAL_SERVER_ERROR',
        meta: {
          requestId: request.id,
          timestamp: new Date().toISOString(),
        },
      });
    }
  });
};
