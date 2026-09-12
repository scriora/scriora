import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  apiKeyFingerprintCandidates,
  hashApiKey,
  isLegacyApiKeyFingerprint,
  prisma,
} from 'scriora-core';
import { normalizeApiKeyScopes } from '../lib/rbac.js';
import { err } from '../lib/response.js';

declare module 'fastify' {
  interface FastifyRequest {
    authContext?: {
      userId: string;
      email?: string | undefined;
    };
    apiKey?: {
      id: string;
      workspaceId: string;
      scopes: string[];
    };
  }
}

export async function verifyAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = request.headers.authorization;
  const apiKeyHeader = request.headers['x-api-key'];

  // 1. API Key Auth path
  if (typeof apiKeyHeader === 'string' && apiKeyHeader.startsWith('sk_')) {
    const keyRecord = await prisma.apiKey.findFirst({
      where: { keyHash: { in: apiKeyFingerprintCandidates(apiKeyHeader) } },
      include: { user: true },
    });

    if (!keyRecord) {
      reply
        .status(401)
        .send(
          err('INVALID_API_KEY', 'AUTHENTICATION_ERROR', 'Provided API Key is invalid', request.id)
        );
      return;
    }

    if (keyRecord.revokedAt !== null) {
      reply
        .status(401)
        .send(
          err(
            'REVOKED_API_KEY',
            'AUTHENTICATION_ERROR',
            'This API Key has been revoked',
            request.id
          )
        );
      return;
    }

    if (keyRecord.expiresAt && keyRecord.expiresAt < new Date()) {
      reply
        .status(401)
        .send(
          err('EXPIRED_API_KEY', 'AUTHENTICATION_ERROR', 'This API Key has expired', request.id)
        );
      return;
    }

    prisma.apiKey
      .update({
        where: { id: keyRecord.id },
        data: {
          lastUsedAt: new Date(),
          ...(isLegacyApiKeyFingerprint(keyRecord.keyHash, apiKeyHeader)
            ? { keyHash: hashApiKey(apiKeyHeader) }
            : {}),
        },
      })
      .catch(() => {});

    request.authContext = { userId: keyRecord.userId, email: keyRecord.user.email };
    request.apiKey = {
      id: keyRecord.id,
      workspaceId: keyRecord.workspaceId,
      scopes: normalizeApiKeyScopes(keyRecord.scopes),
    };
    return;
  }

  // 2. JWT Bearer token path
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    try {
      const decoded = await request.jwtVerify<{ sub: string; email?: string }>();
      request.authContext = { userId: decoded.sub, email: decoded.email };
      return;
    } catch {
      reply
        .status(401)
        .send(
          err(
            'INVALID_TOKEN',
            'AUTHENTICATION_ERROR',
            'JWT token is missing, expired, or invalid',
            request.id
          )
        );
      return;
    }
  }

  reply
    .status(401)
    .send(
      err(
        'UNAUTHORIZED',
        'AUTHENTICATION_ERROR',
        'Authentication required. Provide Bearer token or X-API-Key header.',
        request.id
      )
    );
}
