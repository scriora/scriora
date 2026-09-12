import { prisma } from 'scriora-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

  it('POST /v1/social-accounts/:accountId/messages returns 401 when unauthenticated', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/social-accounts/11111111-1111-4111-8111-111111111111/messages',
      payload: {
        recipientId: '12345',
        text: 'Hello via DM',
      },
    });

    expect(res.statusCode).toBe(401);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(false);
  });

  it('POST /v1/social-accounts/:accountId/messages returns 400 when body is invalid', async () => {
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
      method: 'POST',
      url: '/v1/social-accounts/11111111-1111-4111-8111-111111111111/messages',
      headers: {
        authorization: `Bearer ${token}`,
        'x-workspace-id': '11111111-1111-4111-8111-111111111111',
      },
      payload: {
        // missing text & recipientId
      },
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('GET /v1/social-accounts/:accountId/messages returns 401 when unauthenticated', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/social-accounts/11111111-1111-4111-8111-111111111111/messages',
    });

    expect(res.statusCode).toBe(401);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(false);
  });

  it('GET /v1/social-accounts/:accountId/smart-schedule returns 401 when unauthenticated', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/social-accounts/11111111-1111-4111-8111-111111111111/smart-schedule',
    });

    expect(res.statusCode).toBe(401);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(false);
  });

  it('GET /v1/social-accounts/:accountId/smart-schedule returns 400 when accountId is invalid UUID', async () => {
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
      url: '/v1/social-accounts/invalid-uuid/smart-schedule',
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

  it('GET /v1/social-accounts/:accountId/smart-schedule returns 200 with learned slots', async () => {
    const { adaptiveScheduleService } = await import('scriora-core');
    const token = app.jwt.sign({ sub: 'user-123' });
    const wsId = '11111111-1111-4111-8111-111111111111';
    const accId = '22222222-2222-4222-8222-222222222222';

    vi.spyOn(prisma.workspaceMember, 'findUnique').mockResolvedValue({
      workspaceId: wsId,
      userId: 'user-123',
      workspaceRole: 'OWNER',
      joinedAt: new Date(),
      workspace: {
        id: wsId,
        name: 'Primary Workspace',
        slug: 'primary-ws',
        purpose: 'WORK',
        defaultOperatingMode: 'MANUAL',
        ownerUserId: 'user-123',
        country: null,
        timezone: 'Asia/Riyadh',
        requiresApproval: false,
        settings: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    } as any);

    vi.spyOn(adaptiveScheduleService, 'getLearnedSlotsForAccount').mockResolvedValue([
      {
        datetimeUtc: '2026-09-15T12:00:00.000Z',
        localTime: '15:00',
        localDay: 'Tue',
        formattedArabic: 'الثلاثاء 15:00',
        formattedEnglish: 'Tue 15:00',
        score: 95,
        recommendationReason: 'Learned peak engagement window',
        source: 'USER_ANALYTICS',
        sampleCount: 5,
        confidence: 0.95,
        performanceMultiplier: 1.45,
      },
    ]);

    const res = await app.inject({
      method: 'GET',
      url: `/v1/social-accounts/${accId}/smart-schedule?daysAhead=7&limit=5`,
      headers: {
        authorization: `Bearer ${token}`,
        'x-workspace-id': wsId,
      },
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(1);
    expect(json.data[0].source).toBe('USER_ANALYTICS');
    expect(json.data[0].performanceMultiplier).toBe(1.45);
  });

  it('DELETE /v1/social-accounts/:accountId revokes and wipes envelopes without hard delete', async () => {
    const token = app.jwt.sign({ sub: 'user-123' });
    const wsId = '11111111-1111-4111-8111-111111111111';
    const accId = '22222222-2222-4222-8222-222222222222';

    vi.spyOn(prisma.workspaceMember, 'findUnique').mockResolvedValue({
      workspaceId: wsId,
      userId: 'user-123',
      workspaceRole: 'OWNER',
      joinedAt: new Date(),
      workspace: {
        id: wsId,
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

    vi.spyOn(prisma.socialAccount, 'findFirst').mockResolvedValue({ id: accId } as any);
    const updateSpy = vi.fn().mockResolvedValue({ id: accId, status: 'REVOKED' });
    const wipeSpy = vi.fn().mockResolvedValue({ count: 1 });
    const hardDeleteSpy = vi.spyOn(prisma.socialAccount, 'deleteMany');
    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) =>
      callback({
        socialAccount: { update: updateSpy },
        secretEnvelope: { deleteMany: wipeSpy },
      })
    );

    const res = await app.inject({
      method: 'DELETE',
      url: `/v1/social-accounts/${accId}`,
      headers: {
        authorization: `Bearer ${token}`,
        'x-workspace-id': wsId,
      },
    });

    expect(res.statusCode).toBe(204);
    expect(updateSpy).toHaveBeenCalledWith({
      where: { id: accId },
      data: { status: 'REVOKED' },
    });
    expect(wipeSpy).toHaveBeenCalledWith({ where: { socialAccountId: accId } });
    expect(hardDeleteSpy).not.toHaveBeenCalled();
  });
});
