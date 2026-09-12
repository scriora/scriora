import rateLimit from '@fastify/rate-limit';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';

/**
 * Global rate limiting runs before route authentication, so only the socket IP
 * is a server-observed identity at this boundary. Credential headers are fully
 * caller-controlled here and must never select a rate-limit bucket.
 */
export function rateLimitKey(request: Pick<FastifyRequest, 'ip'>): string {
  return `ip:${request.ip}`;
}

export const rateLimitPlugin: FastifyPluginAsync = fp(async (fastify) => {
  await fastify.register(rateLimit, {
    max: 120,
    timeWindow: '1 minute',
    keyGenerator: rateLimitKey,
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
