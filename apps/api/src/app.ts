import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import { prisma } from 'scriora-core';
import { err, ok } from './lib/response.js';
import { rateLimitPlugin } from './plugins/rate-limit.js';
import { requestIdPlugin } from './plugins/request-id.js';
import { swaggerPlugin } from './plugins/swagger.js';
import { approvalRoutes } from './routes/v1/approvals/index.js';
import { authRoutes } from './routes/v1/auth/index.js';
import { connectRoutes } from './routes/v1/connect/index.js';
import { postRoutes } from './routes/v1/posts/index.js';
import { socialAccountRoutes } from './routes/v1/social-accounts/index.js';
import { telegramWebhookRoutes } from './routes/v1/webhooks/telegram.js';
import { workspaceRoutes } from './routes/v1/workspaces/index.js';

export function buildApp(): FastifyInstance {
  const isTest = process.env.NODE_ENV === 'test';
  const isProd = process.env.NODE_ENV === 'production';

  // JWT Secret validation: production requires >= 32 chars, development requires >= 32 chars
  let jwtSecret = process.env.JWT_SECRET;
  if (isProd) {
    if (!jwtSecret) {
      throw new Error('JWT_SECRET environment variable is required in production');
    }
    if (jwtSecret.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters long in production');
    }
  } else if (!isTest) {
    if (!jwtSecret || jwtSecret.length < 32) {
      throw new Error(
        'JWT_SECRET environment variable is required and must be at least 32 characters long'
      );
    }
  } else {
    // In test environment, fallback if unset
    jwtSecret = jwtSecret || 'test_jwt_secret_at_least_32_characters_long_0987654321';
  }

  const app = Fastify({
    logger: !isTest,
  });

  // 1. Core Plugins
  const allowedOrigins: string[] = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
        .map((o) => o.trim())
        .filter(Boolean)
    : isProd
      ? []
      : ['http://localhost:3000', 'http://127.0.0.1:3000'];

  app.register(cors, {
    origin: allowedOrigins,
    credentials: true,
  });
  app.register(cookie);
  app.register(jwt, {
    secret: jwtSecret,
  });
  app.register(requestIdPlugin);
  app.register(swaggerPlugin);
  app.register(rateLimitPlugin);

  // 2. Health & Readiness Routes (§8.11)
  app.get('/health', async (_request, reply) => {
    return reply.status(200).send({
      status: 'ok',
      service: 'scriora-api',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/ready', async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return reply.status(200).send({
        status: 'ready',
        service: 'scriora-api',
        database: 'connected',
        timestamp: new Date().toISOString(),
      });
    } catch {
      return reply.status(503).send({
        status: 'not_ready',
        service: 'scriora-api',
        database: 'disconnected',
        timestamp: new Date().toISOString(),
      });
    }
  });

  // 3. API v1 Route Groups
  app.register(authRoutes, { prefix: '/v1/auth' });
  app.register(workspaceRoutes, { prefix: '/v1/workspaces' });
  app.register(connectRoutes, { prefix: '/v1/connect' });
  app.register(socialAccountRoutes, { prefix: '/v1/social-accounts' });
  app.register(postRoutes, { prefix: '/v1/posts' });
  app.register(approvalRoutes, { prefix: '/v1/approve' });
  app.register(telegramWebhookRoutes, { prefix: '/v1/webhooks/telegram' });

  // Legacy route bridge for backward compatibility
  app.post('/api/v1/publications', async (request, reply) => {
    const scrioraCore = await import('scriora-core');
    try {
      const parsedBody = scrioraCore.CreatePublicationSchema.parse(request.body);
      const result = await scrioraCore.createPublicationWithOutbox(prisma, parsedBody);
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

  // 4. Global Error Handler (RFC 7807/9457 compliant)
  app.setErrorHandler((error: FastifyError, request, reply) => {
    request.log.error(error);

    const errWithValidation = error as {
      validation?: Array<{
        instancePath?: string;
        message?: string;
        params?: { missingProperty?: string };
      }>;
    };
    if (errWithValidation.validation) {
      return reply.status(400).send(
        err(
          'VALIDATION_ERROR',
          'VALIDATION_ERROR',
          error.message || 'Validation error',
          request.id,
          false,
          errWithValidation.validation.map((v) => ({
            field: v.instancePath || v.params?.missingProperty,
            message: v.message || 'Invalid value',
          }))
        )
      );
    }

    const statusCode =
      typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 600
        ? error.statusCode
        : 500;
    const isInternal = statusCode >= 500;

    return reply
      .status(statusCode)
      .send(
        err(
          error.code || 'INTERNAL_SERVER_ERROR',
          isInternal ? 'INTERNAL_ERROR' : 'BUSINESS_RULE_VIOLATION',
          isInternal && process.env.NODE_ENV === 'production'
            ? 'An unexpected error occurred'
            : error.message || 'Server error',
          request.id,
          isInternal
        )
      );
  });

  return app;
}
