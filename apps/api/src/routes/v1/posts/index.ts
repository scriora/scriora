import type { FastifyPluginAsync } from 'fastify';
import {
  adaptiveScheduleService,
  CreatePostError,
  type CreateUnifiedPostResult,
  createUnifiedPost,
  crossPostOptimizer,
  defaultDateTimeService,
  PaginationQuerySchema,
  type PlatformTarget,
  PublishPayloadSchema,
  prisma,
  resolveRequestIdempotencyKey,
  SocialPlatformSchema,
} from 'scriora-core';
import { z } from 'zod';
import { maybeSendTelegramApprovalRequests } from '../../../lib/approval-delivery.js';
import { API_KEY_SCOPE, requireApiKeyScope, requireWorkspaceWrite } from '../../../lib/rbac.js';
import { err, ok } from '../../../lib/response.js';
import { verifyAuth } from '../../../middleware/auth.js';
import { verifyWorkspace } from '../../../middleware/workspace.js';

const requirePostWrite = [requireWorkspaceWrite, requireApiKeyScope(API_KEY_SCOPE.POSTS_WRITE)];

const PostParamsSchema = z.object({
  postId: z.string().uuid('Invalid postId: must be a valid UUID'),
});

const PostSmartScheduleQuerySchema = z.object({
  socialAccountId: z.string().uuid('Invalid socialAccountId: must be a valid UUID').optional(),
  platform: z
    .enum(['LINKEDIN', 'X', 'INSTAGRAM', 'THREADS', 'GENERAL'])
    .default('GENERAL')
    .optional(),
  daysAhead: z.coerce.number().int().min(1).max(30).default(7).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10).optional(),
  timezone: z.string().min(1).max(100).optional(),
  startDate: z.coerce.date().optional(),
});

export const postRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', verifyAuth);
  fastify.addHook('preHandler', verifyWorkspace);

  // 1. POST /v1/posts (Unified Gateway — 202 Accepted per §7.3 & §8.4)
  fastify.post('/', { preHandler: requirePostWrite }, async (request, reply) => {
    const parseResult = PublishPayloadSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send(
        err(
          'VALIDATION_ERROR',
          'VALIDATION_ERROR',
          'Invalid publish payload',
          request.id,
          false,
          parseResult.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
        )
      );
    }

    const {
      body,
      targets,
      media,
      mediaUrls,
      scheduledAt,
      idempotencyKey: bodyKey,
    } = parseResult.data;
    const resolvedKey = resolveRequestIdempotencyKey({
      header: request.headers['idempotency-key'],
      bodyKey,
    });
    if (!resolvedKey.ok) {
      return reply
        .status(400)
        .send(
          err('VALIDATION_ERROR', 'VALIDATION_ERROR', resolvedKey.message, request.id, false, [
            { field: 'Idempotency-Key', message: resolvedKey.message },
          ])
        );
    }
    const idempotencyKey = resolvedKey.key;
    const workspaceId = request.workspace!.id;
    const userId = request.authContext!.userId;
    const requiresApproval = request.workspace!.requiresApproval;

    let result: CreateUnifiedPostResult;
    try {
      result = await createUnifiedPost(prisma, {
        workspaceId,
        createdByUserId: userId,
        requiresApproval,
        body,
        targets,
        ...(media ? { media } : {}),
        ...(mediaUrls ? { mediaUrls } : {}),
        ...(scheduledAt ? { scheduledAt } : {}),
        idempotencyKey,
      });
    } catch (error: unknown) {
      if (error instanceof CreatePostError && error.code === 'SOCIAL_ACCOUNT_NOT_FOUND') {
        return reply
          .status(404)
          .send(err('SOCIAL_ACCOUNT_NOT_FOUND', 'NOT_FOUND', error.message, request.id));
      }
      throw error;
    }

    if (result.kind === 'idempotent_replay') {
      return reply.status(202).send(
        ok(
          {
            publicationId: result.publicationId,
            status: result.status,
            idempotentReplay: true,
          },
          request.id
        )
      );
    }

    if (result.pendingTelegramApprovals.length > 0) {
      try {
        await maybeSendTelegramApprovalRequests(result.pendingTelegramApprovals);
      } catch (deliveryError: unknown) {
        request.log.warn(
          { err: deliveryError },
          'Telegram approval delivery failed; raw token still in API response'
        );
      }
    }

    return reply.status(202).send(
      ok(
        {
          message: result.message,
          contentId: result.contentId,
          publications: result.publications,
        },
        request.id
      )
    );
  });

  // 2. GET /v1/posts (Cursor-based paginated list per §16.1)
  fastify.get('/', async (request, reply) => {
    const parseResult = PaginationQuerySchema.safeParse(request.query);
    const { cursor, limit, order } = parseResult.success
      ? parseResult.data
      : { limit: 20, order: 'desc' as const };
    const workspaceId = request.workspace!.id;

    const publications = await prisma.publication.findMany({
      where: { workspaceId },
      take: limit + 1,
      ...(cursor
        ? {
            cursor: { id: cursor },
            skip: 1,
          }
        : {}),
      orderBy: { createdAt: order },
      include: {
        contentVariant: {
          include: {
            content: {
              select: { title: true, body: true },
            },
          },
        },
        socialAccount: {
          select: { platform: true, accountName: true },
        },
        publishAttempts: {
          take: 3,
          orderBy: { attemptNumber: 'desc' },
          select: {
            id: true,
            attemptNumber: true,
            status: true,
            externalId: true,
            externalUrl: true,
            createdAt: true,
          },
        },
      },
    });

    const hasMore = publications.length > limit;
    const items = hasMore ? publications.slice(0, limit) : publications;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : undefined;

    return reply.status(200).send(
      ok(items, request.id, {
        nextCursor,
        hasMore,
        total: items.length,
      })
    );
  });

  // 3. GET /v1/posts/smart-schedule (Adaptive Smart Posting Recommendations)
  fastify.get('/smart-schedule', async (request, reply) => {
    const queryResult = PostSmartScheduleQuerySchema.safeParse(request.query);
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

    const workspaceId = request.workspace!.id;
    const { socialAccountId, platform, daysAhead, limit, timezone, startDate } = queryResult.data;

    if (socialAccountId) {
      try {
        const slots = await adaptiveScheduleService.getLearnedSlotsForAccount({
          socialAccountId,
          workspaceId,
          daysAhead,
          limit,
          timezone,
          startDate,
        });
        return reply.status(200).send(ok(slots, request.id));
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Failed to compute smart schedule';
        if (message.includes('not found')) {
          return reply.status(404).send(err('ACCOUNT_NOT_FOUND', 'NOT_FOUND', message, request.id));
        }
        return reply
          .status(500)
          .send(err('SCHEDULE_CALCULATION_FAILED', 'INTERNAL_ERROR', message, request.id));
      }
    }

    // Fallback to workspace benchmark schedule
    let effectiveTimezone =
      timezone || (request.workspace as { timezone?: string } | undefined)?.timezone;
    if (!effectiveTimezone) {
      try {
        const workspace = await prisma.workspace.findUnique({
          where: { id: workspaceId },
          select: { timezone: true },
        });
        effectiveTimezone = workspace?.timezone || 'UTC';
      } catch {
        effectiveTimezone = 'UTC';
      }
    }
    const slots = defaultDateTimeService.getSmartScheduleSlots({
      timezone: effectiveTimezone,
      platform: platform ?? 'GENERAL',
      daysAhead: daysAhead ?? 7,
      startDate,
    });

    const results = limit ? slots.slice(0, limit) : slots;
    return reply.status(200).send(ok(results, request.id));
  });

  // 4. GET /v1/posts/:postId (Detail)
  fastify.get('/:postId', async (request, reply) => {
    const paramResult = PostParamsSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply
        .status(400)
        .send(
          err(
            'VALIDATION_ERROR',
            'VALIDATION_ERROR',
            'Invalid postId: must be a valid UUID',
            request.id
          )
        );
    }
    const { postId } = paramResult.data;
    const workspaceId = request.workspace!.id;

    const publication = await prisma.publication.findFirst({
      where: { id: postId, workspaceId },
      include: {
        contentVariant: {
          include: {
            content: true,
          },
        },
        socialAccount: true,
        publishAttempts: {
          orderBy: { attemptNumber: 'asc' },
        },
      },
    });

    if (!publication) {
      return reply
        .status(404)
        .send(err('PUBLICATION_NOT_FOUND', 'NOT_FOUND', 'Publication not found', request.id));
    }

    return reply.status(200).send(ok(publication, request.id));
  });

  // 5. POST /v1/posts/:postId/cancel
  fastify.post('/:postId/cancel', { preHandler: requirePostWrite }, async (request, reply) => {
    const paramResult = PostParamsSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply
        .status(400)
        .send(
          err(
            'VALIDATION_ERROR',
            'VALIDATION_ERROR',
            'Invalid postId: must be a valid UUID',
            request.id
          )
        );
    }
    const { postId } = paramResult.data;
    const workspaceId = request.workspace!.id;

    const pub = await prisma.publication.findFirst({
      where: { id: postId, workspaceId },
    });

    if (!pub) {
      return reply
        .status(404)
        .send(err('PUBLICATION_NOT_FOUND', 'NOT_FOUND', 'Publication not found', request.id));
    }

    if (
      pub.status !== 'SCHEDULED' &&
      pub.status !== 'READY' &&
      pub.status !== 'REQUIRES_APPROVAL'
    ) {
      return reply
        .status(422)
        .send(
          err(
            'CANNOT_CANCEL',
            'BUSINESS_RULE_VIOLATION',
            `Cannot cancel publication in state ${pub.status}`,
            request.id
          )
        );
    }

    await prisma.$transaction([
      prisma.publication.update({
        where: { id: pub.id },
        data: { status: 'CANCELLED' },
      }),
      prisma.outboxCommand.deleteMany({
        where: { publicationId: pub.id, status: 'PENDING' },
      }),
    ]);

    return reply
      .status(200)
      .send(
        ok({ message: 'Publication cancelled successfully', publicationId: pub.id }, request.id)
      );
  });

  // 6. POST /v1/posts/optimize-cross-post (Cross-platform intelligence & adaptation heuristics)
  fastify.post('/optimize-cross-post', { preHandler: requirePostWrite }, async (request, reply) => {
    const OptimizeSchema = z.object({
      body: z.string().min(1, 'Post body cannot be empty'),
      mediaUrls: z.array(z.string().url()).optional(),
      targetPlatforms: z
        .array(SocialPlatformSchema)
        .min(1, 'At least one target platform is required'),
    });

    const parseResult = OptimizeSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send(
        err(
          'VALIDATION_ERROR',
          'VALIDATION_ERROR',
          'Invalid optimize request payload',
          request.id,
          false,
          parseResult.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
        )
      );
    }

    const { body, mediaUrls, targetPlatforms } = parseResult.data;
    const analysis = crossPostOptimizer.optimize({
      body,
      mediaUrls,
      targetPlatforms: targetPlatforms as PlatformTarget[],
    });

    return reply.status(200).send(ok(analysis, request.id));
  });
};
