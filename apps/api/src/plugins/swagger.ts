import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

export const swaggerPlugin: FastifyPluginAsync = fp(async (fastify) => {
  await fastify.register(swagger, {
    openapi: {
      info: {
        title: 'Scriora Developer API',
        description:
          'Universal B2B Omnichannel Social Publishing, Scheduling, and Human Governance Engine — Canonical REST Gateway.',
        version: '1.0.0',
        contact: {
          name: 'Scriora Developer Relations',
          url: 'https://scriora.io/docs',
          email: 'api@scriora.io',
        },
        license: {
          name: 'Apache-2.0',
          url: 'https://www.apache.org/licenses/LICENSE-2.0.html',
        },
      },
      servers: [
        {
          url: process.env.API_URL ?? 'http://localhost:4000',
          description: 'Development Server (Port 4000)',
        },
        {
          url: 'https://api.scriora.io',
          description: 'Production Global Gateway (Edge CDN)',
        },
      ],
      tags: [
        { name: 'Auth', description: 'User authentication, session tokens, and magic links' },
        {
          name: 'Workspaces',
          description: 'Multi-tenant workspace management and scoped API keys',
        },
        {
          name: 'Connect',
          description: 'Omnichannel social destination onboarding (Telegram, Discord, LinkedIn, X)',
        },
        {
          name: 'Social Accounts',
          description: 'Connected destination management and capabilities',
        },
        {
          name: 'Posts',
          description: 'Unified multi-platform publishing, scheduling, and outbox orchestration',
        },
        {
          name: 'Approvals',
          description: 'Human-in-the-Loop (§14) interactive governance and decisions',
        },
        { name: 'Health', description: 'System health, liveness, and database latency checks' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'User JWT session token obtained via /v1/auth/login or /v1/auth/register',
          },
          apiKeyAuth: {
            type: 'apiKey',
            in: 'header',
            name: 'X-API-Key',
            description: 'Workspace developer API key (sk_live_...)',
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
