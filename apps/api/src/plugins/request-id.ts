import crypto from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

const REQUEST_ID_REGEX = /^[a-zA-Z0-9_-]+$/;
const MAX_REQUEST_ID_LENGTH = 64;

export const requestIdPlugin: FastifyPluginAsync = fp(async (fastify) => {
  fastify.addHook('onRequest', async (request, reply) => {
    const existingId = request.headers['x-request-id'];
    const isValid =
      typeof existingId === 'string' &&
      existingId.length > 0 &&
      existingId.length <= MAX_REQUEST_ID_LENGTH &&
      REQUEST_ID_REGEX.test(existingId);

    const requestId = isValid
      ? existingId
      : `req_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

    request.id = requestId;
    reply.header('x-request-id', requestId);
  });
});
