import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { CreatePublicationSchema, createPublicationWithOutbox, prisma } from 'scriora-core';
import { ZodError } from 'zod';

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: process.env.NODE_ENV === 'test' ? false : { level: 'info' },
  });

  app.register(cors, {
    origin: true,
  });

  // 1. Health check route
  app.get('/health', async () => ({
    status: 'ok',
    service: 'scriora-api',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  }));

  // 2. Publication creation route
  app.post('/api/v1/publications', async (request, reply) => {
    try {
      const parsedBody = CreatePublicationSchema.parse(request.body);
      const result = await createPublicationWithOutbox(prisma, parsedBody);
      return reply.status(201).send({
        success: true,
        data: result,
      });
    } catch (err: unknown) {
      if (err instanceof ZodError) {
        return reply.status(422).send({
          success: false,
          error: 'VALIDATION_ERROR',
          details: err.issues,
        });
      }

      if (err instanceof Error) {
        if (
          err.message === 'CONTENT_VARIANT_NOT_FOUND_IN_WORKSPACE' ||
          err.message === 'SOCIAL_ACCOUNT_NOT_FOUND_IN_WORKSPACE'
        ) {
          return reply.status(404).send({
            success: false,
            error: err.message,
          });
        }
        return reply.status(500).send({
          success: false,
          error: err.message,
        });
      }

      return reply.status(500).send({
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
      });
    }
  });

  return app;
}
