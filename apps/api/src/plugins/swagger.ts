import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

export const swaggerPlugin: FastifyPluginAsync = fp(async (fastify) => {
  await fastify.register(swagger, {
    openapi: {
      info: {
        title: 'Scriora Platform API',
        description: 'AI Social Growth Operating System — Canonical REST Gateway',
        version: '0.1.0',
      },
      servers: [
        {
          url: process.env.API_URL ?? 'http://localhost:4000',
          description: 'Canonical API Server',
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'Provide JWT token obtained from /v1/auth',
          },
          apiKeyAuth: {
            type: 'apiKey',
            in: 'header',
            name: 'X-API-Key',
            description: 'Provide workspace API Key (sk_live_...)',
          },
        },
      },
    },
  });

  if (process.env.NODE_ENV !== 'production') {
    await fastify.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: false,
      },
    });
  }

  // Expose /openapi.json per Section 8.11
  fastify.get('/openapi.json', { schema: { hide: true } }, async () => {
    return fastify.swagger();
  });
});
