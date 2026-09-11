import rateLimit from '@fastify/rate-limit';
import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

export const rateLimitPlugin: FastifyPluginAsync = fp(async (fastify) => {
  await fastify.register(rateLimit, {
    max: 120,
    timeWindow: '1 minute',
    keyGenerator: (request) => {
      const apiKey = request.headers['x-api-key'];
      if (typeof apiKey === 'string') return `apikey:${apiKey}`;
      const auth = request.headers.authorization;
      if (typeof auth === 'string') return `auth:${auth.slice(0, 32)}`;
      return request.ip;
    },
    errorResponseBuilder: (request, context) => {
      return {
        success: false,
        error: {
          code: 'RATE_LIMITED',
          category: 'RATE_LIMITED',
          message: `Too many requests. Limit is ${context.max} requests per ${context.after}.`,
          retryable: true,
          retryAfter: Math.ceil(context.ttl / 1000),
        },
        meta: {
          requestId: request.id,
          timestamp: new Date().toISOString(),
        },
      };
    },
  });
});
