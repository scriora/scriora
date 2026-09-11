import { prisma } from 'scriora-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/app.js';

describe('API Routes — Approvals', () => {
  const app = buildApp();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('GET /v1/approve returns 401 when unauthenticated', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/approve',
    });

    expect(res.statusCode).toBe(401);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(false);
  });

  it('GET /v1/approve/:token returns 404 when approval token does not exist', async () => {
    vi.spyOn(prisma.approvalToken, 'findFirst').mockResolvedValue(null);

    const res = await app.inject({
      method: 'GET',
      url: '/v1/approve/non-existent-token-12345',
    });

    expect(res.statusCode).toBe(404);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('TOKEN_NOT_FOUND');
  });
});
