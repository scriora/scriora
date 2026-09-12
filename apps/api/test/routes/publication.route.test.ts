import * as scrioraCore from 'scriora-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/app.js';

describe('API Routes — Health & Publications', () => {
  const app = buildApp();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('GET /health returns status 200 with service info', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('ok');
    expect(body.service).toBe('scriora-api');
  });

  it('POST /api/v1/publications returns 201 on valid payload', async () => {
    vi.spyOn(scrioraCore, 'createPublicationWithOutbox').mockResolvedValue({
      publication: {
        id: 'pub-test-uuid',
        workspaceId: '11111111-1111-4111-8111-111111111111',
        contentVariantId: '22222222-2222-4222-8222-222222222222',
        socialAccountId: '33333333-3333-4333-8333-333333333333',
        status: 'READY',
        scheduledAt: null,
        publishedAt: null,
        externalPostId: null,
        externalPostUrl: null,
        idempotencyKey: 'idemp-123',
        fingerprint: 'a'.repeat(64),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      publishAttemptId: 'attempt-test-uuid',
      outboxCommandId: 'outbox-test-uuid',
      requiresApproval: false,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/publications',
      payload: {
        workspaceId: '11111111-1111-4111-8111-111111111111',
        contentVariantId: '22222222-2222-4222-8222-222222222222',
        socialAccountId: '33333333-3333-4333-8333-333333333333',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.publication.id).toBe('pub-test-uuid');
    expect(body.data.publishAttemptId).toBe('attempt-test-uuid');
    expect(body.data.outboxCommandId).toBe('outbox-test-uuid');
  });

  it('POST /api/v1/publications returns 422 on invalid payload (missing required UUIDs)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/publications',
      payload: {
        workspaceId: 'not-a-uuid',
      },
    });

    expect(response.statusCode).toBe(422);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.error).toBe('VALIDATION_ERROR');
    expect(body.details.length).toBeGreaterThan(0);
  });

  it('POST /api/v1/publications returns 404 when content variant or social account is not found', async () => {
    vi.spyOn(scrioraCore, 'createPublicationWithOutbox').mockRejectedValueOnce(
      new Error('CONTENT_VARIANT_NOT_FOUND_IN_WORKSPACE')
    );

    const res1 = await app.inject({
      method: 'POST',
      url: '/api/v1/publications',
      payload: {
        workspaceId: '11111111-1111-4111-8111-111111111111',
        contentVariantId: '22222222-2222-4222-8222-222222222222',
        socialAccountId: '33333333-3333-4333-8333-333333333333',
      },
    });

    expect(res1.statusCode).toBe(404);
    expect(JSON.parse(res1.body).error).toBe('CONTENT_VARIANT_NOT_FOUND_IN_WORKSPACE');

    vi.spyOn(scrioraCore, 'createPublicationWithOutbox').mockRejectedValueOnce(
      new Error('SOCIAL_ACCOUNT_NOT_FOUND_IN_WORKSPACE')
    );

    const res2 = await app.inject({
      method: 'POST',
      url: '/api/v1/publications',
      payload: {
        workspaceId: '11111111-1111-4111-8111-111111111111',
        contentVariantId: '22222222-2222-4222-8222-222222222222',
        socialAccountId: '33333333-3333-4333-8333-333333333333',
      },
    });

    expect(res2.statusCode).toBe(404);
    expect(JSON.parse(res2.body).error).toBe('SOCIAL_ACCOUNT_NOT_FOUND_IN_WORKSPACE');
  });

  it('POST /api/v1/publications returns 500 on unexpected errors', async () => {
    vi.spyOn(scrioraCore, 'createPublicationWithOutbox').mockRejectedValueOnce(
      new Error('DATABASE_CONNECTION_ERROR')
    );

    const res1 = await app.inject({
      method: 'POST',
      url: '/api/v1/publications',
      payload: {
        workspaceId: '11111111-1111-4111-8111-111111111111',
        contentVariantId: '22222222-2222-4222-8222-222222222222',
        socialAccountId: '33333333-3333-4333-8333-333333333333',
      },
    });

    expect(res1.statusCode).toBe(500);
    expect(JSON.parse(res1.body).error).toBe('DATABASE_CONNECTION_ERROR');

    vi.spyOn(scrioraCore, 'createPublicationWithOutbox').mockRejectedValueOnce(
      'STRING_NON_ERROR_EXCEPTION'
    );

    const res2 = await app.inject({
      method: 'POST',
      url: '/api/v1/publications',
      payload: {
        workspaceId: '11111111-1111-4111-8111-111111111111',
        contentVariantId: '22222222-2222-4222-8222-222222222222',
        socialAccountId: '33333333-3333-4333-8333-333333333333',
      },
    });

    expect(res2.statusCode).toBe(500);
    expect(JSON.parse(res2.body).error).toBe('INTERNAL_SERVER_ERROR');
  });

  it('initializes logger when not in test env', () => {
    const originalEnv = process.env.NODE_ENV;
    const originalSecret = process.env.JWT_SECRET;
    try {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'valid_production_secret_32_characters_long_minimum!';
      const prodApp = buildApp();
      expect(prodApp).toBeDefined();
    } finally {
      process.env.NODE_ENV = originalEnv;
      process.env.JWT_SECRET = originalSecret;
    }
  });
});
