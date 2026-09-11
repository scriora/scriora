import crypto from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

export const requestIdPlugin: FastifyPluginAsync = fp(async (fastify) => {
  fastify.addHook('onRequest', async (request, reply) => {
    const existingId = request.headers['x-request-id'];
    const requestId =
      typeof existingId === 'string' && existingId.length > 0
        ? existingId
        : `req_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

    request.id = requestId;
    reply.header('x-request-id', requestId);
  });
});
