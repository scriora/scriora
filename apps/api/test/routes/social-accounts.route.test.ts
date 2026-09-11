import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from 'scriora-core';
import { buildApp } from '../../src/app.js';

describe('API Routes — Social Accounts', () => {
  const app = buildApp();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('GET /v1/social-accounts returns 401 when unauthenticated', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/social-accounts',
    });

    expect(res.statusCode).toBe(401);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(false);
  });

  it('GET /v1/social-accounts/:accountId returns 400 when accountId is invalid UUID', async () => {
    const token = app.jwt.sign({ sub: 'user-123' });

    vi.spyOn(prisma.workspaceMember, 'findUnique').mockResolvedValue({
      workspaceId: '11111111-1111-4111-8111-111111111111',
      userId: 'user-123',
      workspaceRole: 'OWNER',
      joinedAt: new Date(),
      workspace: {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Primary Workspace',
        slug: 'primary-ws',
        purpose: 'WORK',
        defaultOperatingMode: 'MANUAL',
        ownerUserId: 'user-123',
        country: null,
        timezone: 'UTC',
        requiresApproval: false,
        settings: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    } as any);

    const res = await app.inject({
      method: 'GET',
      url: '/v1/social-accounts/invalid-account-uuid',
      headers: {
        authorization: `Bearer ${token}`,
        'x-workspace-id': '11111111-1111-4111-8111-111111111111',
      },
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });
});
