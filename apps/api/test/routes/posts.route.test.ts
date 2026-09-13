import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import * as approvalDelivery from '../../src/lib/approval-delivery.js';
import {
  APPROVAL_RAW_TOKEN_HEX_LENGTH,
  hashApprovalToken,
  TELEGRAM_CALLBACK_DATA_MAX_BYTES,
} from '../../src/lib/approval-token.js';

interface TxDataArgs {
  data: Record<string, unknown>;
}

describe('API Routes — Posts (Unified Gateway)', () => {
  const app = buildApp();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('POST /v1/posts returns 401 when unauthenticated', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/posts',
      payload: {
        body: 'Hello world from Scriora!',
        targets: [
          {
            socialAccountId: '11111111-1111-4111-8111-111111111111',
            platform: 'LINKEDIN',
          },
        ],
      },
    });

    expect(res.statusCode).toBe(401);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(false);
    expect(json.error.category).toBe('AUTHENTICATION_ERROR');
    expect(json.meta.requestId).toBeDefined();
  });

  it('POST /v1/posts returns 400 when payload is missing required fields', async () => {
    const { prisma } = await import('scriora-core');
    vi.spyOn(prisma.workspaceMember, 'findUnique').mockResolvedValue({
      workspaceId: '22222222-2222-4222-8222-222222222222',
      userId: 'user-123',
      workspaceRole: 'OWNER',
      joinedAt: new Date(),
      workspace: {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Test Workspace',
        slug: 'test-ws',
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

    // Generate valid JWT token using app.jwt
    const token = app.jwt.sign({ sub: 'user-123' });

    const res = await app.inject({
      method: 'POST',
      url: '/v1/posts',
      headers: {
        authorization: `Bearer ${token}`,
        'x-workspace-id': '22222222-2222-4222-8222-222222222222',
      },
      payload: {
        body: '', // Empty body is invalid
        targets: [],
      },
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(json.error.details).toBeDefined();
  });

  it('POST /v1/posts rejects a mission outside the active workspace', async () => {
    const { prisma } = await import('scriora-core');
    const wsId = '22222222-2222-4222-8222-222222222222';
    vi.spyOn(prisma.workspaceMember, 'findUnique').mockResolvedValue({
      workspaceId: wsId,
      userId: 'user-123',
      workspaceRole: 'OWNER',
      joinedAt: new Date(),
      workspace: {
        id: wsId,
        name: 'Test Workspace',
        slug: 'test-ws',
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
    vi.spyOn(prisma.mission, 'findFirst').mockResolvedValue(null);
    const transactionSpy = vi.spyOn(prisma, '$transaction');
    const token = app.jwt.sign({ sub: 'user-123' });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/posts',
      headers: { authorization: `Bearer ${token}`, 'x-workspace-id': wsId },
      payload: {
        body: 'Mission-bound post',
        missionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        targets: [
          {
            socialAccountId: '33333333-3333-4333-8333-333333333333',
            platform: 'LINKEDIN',
          },
        ],
      },
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error.code).toBe('MISSION_NOT_FOUND');
    expect(transactionSpy).not.toHaveBeenCalled();
  });

  it('POST /v1/posts schedules post with media, Arabic hashtags, and platform-specific options', async () => {
    const { prisma } = await import('scriora-core');
    const wsId = '22222222-2222-4222-8222-222222222222';
    const userId = 'user-123';
    const linkedinAccId = '33333333-3333-4333-8333-333333333333';
    const xAccId = '44444444-4444-4444-8444-444444444444';
    const mediaAssetId = '55555555-5555-4555-8555-555555555555';

    vi.spyOn(prisma.workspaceMember, 'findUnique').mockResolvedValue({
      workspaceId: wsId,
      userId,
      workspaceRole: 'OWNER',
      joinedAt: new Date(),
      workspace: {
        id: wsId,
        name: 'Enterprise Growth WS',
        slug: 'growth-ws',
        purpose: 'WORK',
        defaultOperatingMode: 'MANUAL',
        ownerUserId: userId,
        country: null,
        timezone: 'UTC',
        requiresApproval: false,
        settings: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    } as any);

    vi.spyOn(prisma.publication, 'findFirst').mockResolvedValue(null);
    vi.spyOn(prisma.socialAccount, 'findMany').mockResolvedValue([
      { id: linkedinAccId, workspaceId: wsId, platform: 'LINKEDIN' },
      { id: xAccId, workspaceId: wsId, platform: 'X' },
    ] as any);
    vi.spyOn(prisma.mediaAsset, 'findMany').mockResolvedValue([
      { id: mediaAssetId, storageKey: mediaAssetId },
    ] as any);

    const mockTx = {
      content: {
        create: vi.fn().mockResolvedValue({ id: 'content-uuid-001' }),
      },
      contentVariant: {
        create: vi
          .fn()
          .mockImplementation((args: TxDataArgs) =>
            Promise.resolve({ id: `variant-${args.data.socialAccountId as string}`, ...args.data })
          ),
      },
      publication: {
        create: vi
          .fn()
          .mockImplementation((args: TxDataArgs) =>
            Promise.resolve({ id: `pub-${args.data.socialAccountId as string}`, ...args.data })
          ),
      },
      publishAttempt: {
        create: vi
          .fn()
          .mockImplementation((args: TxDataArgs) =>
            Promise.resolve({ id: `att-${args.data.publicationId as string}`, ...args.data })
          ),
      },
      outboxCommand: {
        create: vi
          .fn()
          .mockImplementation((args: TxDataArgs) =>
            Promise.resolve({ id: `outbox-${args.data.publicationId as string}`, ...args.data })
          ),
      },
    };

    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => cb(mockTx));

    const token = app.jwt.sign({ sub: userId });
    // Schedule 2 days in the future
    const futureDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const arabicPostWithHashtags =
      'إطلاق التقرير الهندسي الشامل لسكريورا 📊⚡\n\nنستعرض معمارية الأنظمة الموزعة وكيفية جدولة المنشورات بدقة.\n\n#ريادة_الأعمال #بناء_في_العلن #تقنية_المعلومات';

    const res = await app.inject({
      method: 'POST',
      url: '/v1/posts',
      headers: {
        authorization: `Bearer ${token}`,
        'x-workspace-id': wsId,
      },
      payload: {
        body: arabicPostWithHashtags,
        scheduledAt: futureDate,
        media: [
          {
            mediaAssetId,
            altText: 'Scriora Architecture Diagram',
          },
        ],
        targets: [
          {
            socialAccountId: linkedinAccId,
            platform: 'LINKEDIN',
            platformOptions: {
              platform: 'LINKEDIN',
              options: {
                visibility: 'CONNECTIONS',
                documentTitle: 'Scriora Distributed Architecture PDF',
              },
            },
          },
          {
            socialAccountId: xAccId,
            platform: 'X',
            platformOptions: {
              platform: 'X',
              options: {
                threadMode: true,
                replyToId: '1234567890123456789',
              },
            },
          },
        ],
      },
    });

    expect(res.statusCode).toBe(202);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(true);
    expect(json.data.message).toBe('Publication scheduled');
    expect(json.data.publications).toHaveLength(2);
    expect(json.data.publications[0].status).toBe('SCHEDULED');
    expect(json.data.publications[1].status).toBe('SCHEDULED');

    // Verify mockTx publication calls
    expect(mockTx.publication.create).toHaveBeenCalledTimes(2);
    const firstPubCall = mockTx.publication.create.mock.calls[0][0];
    expect(firstPubCall.data.status).toBe('SCHEDULED');
    expect(firstPubCall.data.scheduledAt).toEqual(new Date(futureDate));

    // Verify mockTx outboxCommand calls
    expect(mockTx.outboxCommand.create).toHaveBeenCalledTimes(2);
    const firstOutboxCall = mockTx.outboxCommand.create.mock.calls[0][0];
    expect(firstOutboxCall.data.availableAt).toEqual(new Date(futureDate));
    expect(firstOutboxCall.data.payload.body).toBe(arabicPostWithHashtags);
    expect(firstOutboxCall.data.payload.mediaUrls).toEqual([mediaAssetId]);
    expect(firstOutboxCall.data.payload.options).toEqual({
      platform: 'LINKEDIN',
      options: {
        visibility: 'CONNECTIONS',
        documentTitle: 'Scriora Distributed Architecture PDF',
      },
    });

    const secondOutboxCall = mockTx.outboxCommand.create.mock.calls[1][0];
    expect(secondOutboxCall.data.payload.options).toEqual({
      platform: 'X',
      options: {
        threadMode: true,
        replyToId: '1234567890123456789',
      },
    });
  });

  it('POST /v1/posts queues post for immediate dispatch with status READY when scheduledAt is omitted', async () => {
    const { prisma } = await import('scriora-core');
    const wsId = '22222222-2222-4222-8222-222222222222';
    const userId = 'user-123';
    const linkedinAccId = '33333333-3333-4333-8333-333333333333';

    vi.spyOn(prisma.workspaceMember, 'findUnique').mockResolvedValue({
      workspaceId: wsId,
      userId,
      workspaceRole: 'OWNER',
      joinedAt: new Date(),
      workspace: {
        id: wsId,
        name: 'Immediate WS',
        slug: 'immediate-ws',
        purpose: 'WORK',
        defaultOperatingMode: 'MANUAL',
        ownerUserId: userId,
        country: null,
        timezone: 'UTC',
        requiresApproval: false,
        settings: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    } as any);

    vi.spyOn(prisma.publication, 'findFirst').mockResolvedValue(null);
    vi.spyOn(prisma.socialAccount, 'findMany').mockResolvedValue([
      { id: linkedinAccId, workspaceId: wsId, platform: 'LINKEDIN' },
    ] as any);

    const mockTx = {
      content: { create: vi.fn().mockResolvedValue({ id: 'content-uuid-immediate' }) },
      contentVariant: {
        create: vi
          .fn()
          .mockImplementation((args: TxDataArgs) =>
            Promise.resolve({ id: `variant-imm`, ...args.data })
          ),
      },
      publication: {
        create: vi
          .fn()
          .mockImplementation((args: TxDataArgs) =>
            Promise.resolve({ id: `pub-imm`, ...args.data })
          ),
      },
      publishAttempt: {
        create: vi
          .fn()
          .mockImplementation((args: TxDataArgs) =>
            Promise.resolve({ id: `att-imm`, ...args.data })
          ),
      },
      outboxCommand: {
        create: vi
          .fn()
          .mockImplementation((args: TxDataArgs) =>
            Promise.resolve({ id: `outbox-imm`, ...args.data })
          ),
      },
    };

    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => cb(mockTx));

    const token = app.jwt.sign({ sub: userId });

    const res = await app.inject({
      method: 'POST',
      url: '/v1/posts',
      headers: {
        authorization: `Bearer ${token}`,
        'x-workspace-id': wsId,
      },
      payload: {
        body: 'Immediate publish announcement 🚀 #launch #scriora',
        targets: [
          {
            socialAccountId: linkedinAccId,
            platform: 'LINKEDIN',
          },
        ],
      },
    });

    expect(res.statusCode).toBe(202);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(true);
    expect(json.data.message).toBe('Publication queued for dispatch');
    expect(json.data.publications[0].status).toBe('READY');

    const pubCall = mockTx.publication.create.mock.calls[0][0];
    expect(pubCall.data.status).toBe('READY');
    expect(pubCall.data.scheduledAt).toBeNull();
  });

  it('POST /v1/posts applies customBody override specifically to target destinations', async () => {
    const { prisma } = await import('scriora-core');
    const wsId = '22222222-2222-4222-8222-222222222222';
    const userId = 'user-123';
    const tgChannelAccId = '66666666-6666-4666-8666-666666666666';
    const tgGroupAccId = '77777777-7777-4777-8777-777777777777';

    vi.spyOn(prisma.workspaceMember, 'findUnique').mockResolvedValue({
      workspaceId: wsId,
      userId,
      workspaceRole: 'OWNER',
      joinedAt: new Date(),
      workspace: {
        id: wsId,
        name: 'Multi-Destination WS',
        slug: 'multi-ws',
        purpose: 'WORK',
        defaultOperatingMode: 'MANUAL',
        ownerUserId: userId,
        country: null,
        timezone: 'UTC',
        requiresApproval: false,
        settings: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    } as any);

    vi.spyOn(prisma.publication, 'findFirst').mockResolvedValue(null);
    vi.spyOn(prisma.socialAccount, 'findMany').mockResolvedValue([
      { id: tgChannelAccId, workspaceId: wsId, platform: 'TELEGRAM', accountName: 'Main Channel' },
      { id: tgGroupAccId, workspaceId: wsId, platform: 'TELEGRAM', accountName: 'Community Group' },
    ] as any);

    const mockTx = {
      content: { create: vi.fn().mockResolvedValue({ id: 'content-multi-dest' }) },
      contentVariant: {
        create: vi
          .fn()
          .mockImplementation((args: TxDataArgs) =>
            Promise.resolve({ id: `variant-${args.data.socialAccountId}`, ...args.data })
          ),
      },
      publication: {
        create: vi
          .fn()
          .mockImplementation((args: TxDataArgs) =>
            Promise.resolve({ id: `pub-${args.data.socialAccountId}`, ...args.data })
          ),
      },
      publishAttempt: {
        create: vi
          .fn()
          .mockImplementation((args: TxDataArgs) =>
            Promise.resolve({ id: `att-${args.data.publicationId}`, ...args.data })
          ),
      },
      outboxCommand: {
        create: vi
          .fn()
          .mockImplementation((args: TxDataArgs) =>
            Promise.resolve({ id: `outbox-${args.data.publicationId}`, ...args.data })
          ),
      },
    };

    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => cb(mockTx));

    const token = app.jwt.sign({ sub: userId });

    const res = await app.inject({
      method: 'POST',
      url: '/v1/posts',
      headers: {
        authorization: `Bearer ${token}`,
        'x-workspace-id': wsId,
      },
      payload: {
        body: 'Universal default post text',
        targets: [
          {
            socialAccountId: tgChannelAccId,
            platform: 'TELEGRAM',
            customBody: '📢 Formal announcement for Channel subscribers with bullet points!',
          },
          {
            socialAccountId: tgGroupAccId,
            platform: 'TELEGRAM',
            customBody: '💬 Informal community prompt: What do you think about our new update?',
          },
        ],
      },
    });

    expect(res.statusCode).toBe(202);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(true);

    const variantCalls = mockTx.contentVariant.create.mock.calls;
    expect(variantCalls[0][0].data.body).toBe(
      '📢 Formal announcement for Channel subscribers with bullet points!'
    );
    expect(variantCalls[1][0].data.body).toBe(
      '💬 Informal community prompt: What do you think about our new update?'
    );

    const outboxCalls = mockTx.outboxCommand.create.mock.calls;
    expect(outboxCalls[0][0].data.payload.body).toBe(
      '📢 Formal announcement for Channel subscribers with bullet points!'
    );
    expect(outboxCalls[1][0].data.payload.body).toBe(
      '💬 Informal community prompt: What do you think about our new update?'
    );
  });

  it('GET /v1/posts/smart-schedule returns 401 when unauthenticated', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/posts/smart-schedule',
    });

    expect(res.statusCode).toBe(401);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(false);
  });

  it('GET /v1/posts/smart-schedule returns benchmark slots when no socialAccountId is provided', async () => {
    const { prisma } = await import('scriora-core');
    const token = app.jwt.sign({ sub: 'user-123' });
    const wsId = '22222222-2222-4222-8222-222222222222';

    vi.spyOn(prisma.workspaceMember, 'findUnique').mockResolvedValue({
      workspaceId: wsId,
      userId: 'user-123',
      workspaceRole: 'OWNER',
      joinedAt: new Date(),
      workspace: {
        id: wsId,
        name: 'Test Workspace',
        slug: 'test-ws',
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

    vi.spyOn(prisma.workspace, 'findUnique').mockResolvedValue({
      timezone: 'UTC',
    } as any);

    const res = await app.inject({
      method: 'GET',
      url: '/v1/posts/smart-schedule?platform=X&daysAhead=3&limit=3',
      headers: {
        authorization: `Bearer ${token}`,
        'x-workspace-id': wsId,
      },
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.data.length).toBeLessThanOrEqual(3);
    expect(json.data[0].source).toBe('BENCHMARK');
  });

  it('GET /v1/posts/smart-schedule delegates to adaptiveScheduleService when socialAccountId is passed', async () => {
    const { prisma, adaptiveScheduleService } = await import('scriora-core');
    const token = app.jwt.sign({ sub: 'user-123' });
    const wsId = '22222222-2222-4222-8222-222222222222';
    const accId = '33333333-3333-4333-8333-333333333333';

    vi.spyOn(prisma.workspaceMember, 'findUnique').mockResolvedValue({
      workspaceId: wsId,
      userId: 'user-123',
      workspaceRole: 'OWNER',
      joinedAt: new Date(),
      workspace: {
        id: wsId,
        name: 'Test Workspace',
        slug: 'test-ws',
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

    vi.spyOn(adaptiveScheduleService, 'getLearnedSlotsForAccount').mockResolvedValue([
      {
        datetimeUtc: '2026-09-16T09:00:00.000Z',
        localTime: '09:00',
        localDay: 'Wed',
        formattedArabic: 'الأربعاء 09:00',
        formattedEnglish: 'Wed 09:00',
        score: 92,
        recommendationReason: 'Learned slot from account history',
        source: 'HYBRID_LEARNED',
        sampleCount: 3,
        confidence: 0.85,
        performanceMultiplier: 1.25,
      },
    ]);

    const res = await app.inject({
      method: 'GET',
      url: `/v1/posts/smart-schedule?socialAccountId=${accId}&limit=5`,
      headers: {
        authorization: `Bearer ${token}`,
        'x-workspace-id': wsId,
      },
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(1);
    expect(json.data[0].source).toBe('HYBRID_LEARNED');
  });

  it('GET /v1/posts/smart-schedule returns Threads benchmark slots (Buffer 2.5M study)', async () => {
    const { prisma } = await import('scriora-core');
    const token = app.jwt.sign({ sub: 'user-123' });
    const wsId = '22222222-2222-4222-8222-222222222222';

    vi.spyOn(prisma.workspaceMember, 'findUnique').mockResolvedValue({
      workspaceId: wsId,
      userId: 'user-123',
      workspaceRole: 'OWNER',
      joinedAt: new Date(),
      workspace: {
        id: wsId,
        name: 'Test Workspace',
        slug: 'test-ws',
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

    vi.spyOn(prisma.workspace, 'findUnique').mockResolvedValue({
      timezone: 'UTC',
    } as any);

    const res = await app.inject({
      method: 'GET',
      url: '/v1/posts/smart-schedule?platform=THREADS&limit=3',
      headers: {
        authorization: `Bearer ${token}`,
        'x-workspace-id': wsId,
      },
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.data.length).toBeLessThanOrEqual(3);
    expect(json.data[0].source).toBe('BENCHMARK');
  });

  it('POST /v1/posts/optimize-cross-post provides intelligent platform adaptation recommendations', async () => {
    const { prisma } = await import('scriora-core');
    const token = app.jwt.sign({ sub: 'user-123' });
    const wsId = '22222222-2222-4222-8222-222222222222';

    vi.spyOn(prisma.workspaceMember, 'findUnique').mockResolvedValue({
      workspaceId: wsId,
      userId: 'user-123',
      workspaceRole: 'OWNER',
      joinedAt: new Date(),
      workspace: {
        id: wsId,
        name: 'Test Workspace',
        slug: 'test-ws',
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
      url: '/v1/posts/optimize-cross-post',
      headers: {
        authorization: `Bearer ${token}`,
        'x-workspace-id': wsId,
      },
      payload: {
        body: 'Check out our new launch at https://scriora.com/launch #tech #startup #saas #growth #ai #builder',
        targetPlatforms: ['INSTAGRAM', 'THREADS', 'X'],
      },
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(true);
    expect(json.data.INSTAGRAM.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'MEDIA_REQUIRED' }),
        expect.objectContaining({ code: 'INSTAGRAM_HASHTAG_LIMIT' }),
      ])
    );
    expect(json.data.X.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'X_LINK_PENALTY_AVOIDANCE' })])
    );
  });

  it('POST /v1/posts with requiresApproval=true holds publication and does not create a sweepable outbox', async () => {
    const { prisma } = await import('scriora-core');
    const wsId = '22222222-2222-4222-8222-222222222222';
    const userId = 'user-123';
    const linkedinAccId = '33333333-3333-4333-8333-333333333333';

    vi.spyOn(prisma.workspaceMember, 'findUnique').mockResolvedValue({
      workspaceId: wsId,
      userId,
      workspaceRole: 'OWNER',
      joinedAt: new Date(),
      workspace: {
        id: wsId,
        name: 'Approval WS',
        slug: 'approval-ws',
        purpose: 'WORK',
        defaultOperatingMode: 'MANUAL',
        ownerUserId: userId,
        country: null,
        timezone: 'UTC',
        requiresApproval: true,
        settings: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    } as any);

    vi.spyOn(prisma.publication, 'findFirst').mockResolvedValue(null);
    vi.spyOn(prisma.socialAccount, 'findMany').mockResolvedValue([
      { id: linkedinAccId, workspaceId: wsId, platform: 'LINKEDIN' },
    ] as any);

    const mockTx = {
      content: { create: vi.fn().mockResolvedValue({ id: 'content-approval' }) },
      contentVariant: {
        create: vi.fn().mockResolvedValue({ id: 'variant-approval' }),
      },
      publication: {
        create: vi
          .fn()
          .mockImplementation((args: TxDataArgs) =>
            Promise.resolve({ id: 'pub-approval', ...args.data })
          ),
      },
      publishAttempt: {
        create: vi.fn().mockResolvedValue({ id: 'att-approval' }),
      },
      outboxCommand: {
        create: vi.fn(),
      },
      approval: {
        create: vi.fn().mockResolvedValue({ id: 'approval-1' }),
      },
      approvalToken: {
        create: vi.fn().mockResolvedValue({ id: 'token-1' }),
      },
    };

    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => cb(mockTx));

    const token = app.jwt.sign({ sub: userId });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/posts',
      headers: {
        authorization: `Bearer ${token}`,
        'x-workspace-id': wsId,
      },
      payload: {
        body: 'Needs human approval before publish',
        targets: [{ socialAccountId: linkedinAccId, platform: 'LINKEDIN' }],
      },
    });

    expect(res.statusCode).toBe(202);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(true);
    expect(json.data.message).toBe('Submitted for approval');
    expect(json.data.publications[0].status).toBe('REQUIRES_APPROVAL');
    expect(json.data.publications[0].outboxCommandId).toBeNull();

    const deliveredToken = json.data.publications[0].approvalToken as string;
    expect(deliveredToken).toMatch(new RegExp(`^[0-9a-f]{${APPROVAL_RAW_TOKEN_HEX_LENGTH}}$`));
    expect(json.data.publications[0].approvalUrl).toContain(`/v1/approve/${deliveredToken}`);
    expect(json.data.publications[0].approvalId).toBe('approval-1');
    expect(Buffer.byteLength(`approve:${deliveredToken}`, 'utf8')).toBeLessThanOrEqual(
      TELEGRAM_CALLBACK_DATA_MAX_BYTES
    );
    expect(Buffer.byteLength(`reject:${deliveredToken}`, 'utf8')).toBeLessThanOrEqual(
      TELEGRAM_CALLBACK_DATA_MAX_BYTES
    );

    const persisted = mockTx.approvalToken.create.mock.calls[0][0].data as Record<string, unknown>;
    expect(persisted.tokenHash).toBe(hashApprovalToken(deliveredToken));
    expect(persisted.tokenHash).not.toBe(deliveredToken);
    expect(persisted).not.toHaveProperty('token');
    expect(persisted).not.toHaveProperty('rawToken');
    expect(JSON.stringify(persisted)).not.toContain(deliveredToken);

    expect(mockTx.publication.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'REQUIRES_APPROVAL' }),
      })
    );
    expect(mockTx.outboxCommand.create).not.toHaveBeenCalled();
    expect(mockTx.approval.create).toHaveBeenCalledTimes(1);
    expect(mockTx.approvalToken.create).toHaveBeenCalledTimes(1);
  });

  it('POST /v1/posts with requiresApproval=true delivers the raw token to Telegram when credentials exist', async () => {
    const { prisma } = await import('scriora-core');
    const wsId = '22222222-2222-4222-8222-222222222222';
    const userId = 'user-123';
    const linkedinAccId = '33333333-3333-4333-8333-333333333333';

    const telegramSpy = vi
      .spyOn(approvalDelivery, 'maybeSendTelegramApprovalRequests')
      .mockResolvedValue({ attempted: true, delivered: 1 });

    vi.spyOn(prisma.workspaceMember, 'findUnique').mockResolvedValue({
      workspaceId: wsId,
      userId,
      workspaceRole: 'OWNER',
      joinedAt: new Date(),
      workspace: {
        id: wsId,
        name: 'Approval WS',
        slug: 'approval-ws',
        purpose: 'WORK',
        defaultOperatingMode: 'MANUAL',
        ownerUserId: userId,
        country: null,
        timezone: 'UTC',
        requiresApproval: true,
        settings: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    } as any);

    vi.spyOn(prisma.publication, 'findFirst').mockResolvedValue(null);
    vi.spyOn(prisma.socialAccount, 'findMany').mockResolvedValue([
      { id: linkedinAccId, workspaceId: wsId, platform: 'LINKEDIN' },
    ] as any);

    const mockTx = {
      content: { create: vi.fn().mockResolvedValue({ id: 'content-tg' }) },
      contentVariant: { create: vi.fn().mockResolvedValue({ id: 'variant-tg' }) },
      publication: {
        create: vi
          .fn()
          .mockImplementation((args: TxDataArgs) =>
            Promise.resolve({ id: 'pub-tg', ...args.data })
          ),
      },
      publishAttempt: { create: vi.fn().mockResolvedValue({ id: 'att-tg' }) },
      outboxCommand: { create: vi.fn() },
      approval: { create: vi.fn().mockResolvedValue({ id: 'approval-tg' }) },
      approvalToken: { create: vi.fn().mockResolvedValue({ id: 'token-tg' }) },
    };

    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => cb(mockTx));

    const token = app.jwt.sign({ sub: userId });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/posts',
      headers: {
        authorization: `Bearer ${token}`,
        'x-workspace-id': wsId,
      },
      payload: {
        body: 'Needs human approval before publish',
        targets: [{ socialAccountId: linkedinAccId, platform: 'LINKEDIN' }],
      },
    });

    expect(res.statusCode).toBe(202);
    const json = JSON.parse(res.body);
    const deliveredToken = json.data.publications[0].approvalToken as string;

    expect(telegramSpy).toHaveBeenCalledTimes(1);
    expect(telegramSpy).toHaveBeenCalledWith([
      expect.objectContaining({
        approvalId: 'approval-tg',
        token: deliveredToken,
        platform: 'LINKEDIN',
        title: 'Needs human approval before publish',
        body: 'Needs human approval before publish',
      }),
    ]);

    const persisted = mockTx.approvalToken.create.mock.calls[0][0].data as Record<string, unknown>;
    expect(persisted.tokenHash).toBe(hashApprovalToken(deliveredToken));
    expect(JSON.stringify(persisted)).not.toContain(deliveredToken);
  });

  it('POST /v1/posts scheduled + requiresApproval does not create an outbox even when availableAt would be now-eligible later', async () => {
    const { prisma } = await import('scriora-core');
    const wsId = '22222222-2222-4222-8222-222222222222';
    const userId = 'user-123';
    const linkedinAccId = '33333333-3333-4333-8333-333333333333';
    const futureDate = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    vi.spyOn(prisma.workspaceMember, 'findUnique').mockResolvedValue({
      workspaceId: wsId,
      userId,
      workspaceRole: 'OWNER',
      joinedAt: new Date(),
      workspace: {
        id: wsId,
        name: 'Scheduled Approval WS',
        slug: 'sched-approval-ws',
        purpose: 'WORK',
        defaultOperatingMode: 'MANUAL',
        ownerUserId: userId,
        country: null,
        timezone: 'UTC',
        requiresApproval: true,
        settings: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    } as any);

    vi.spyOn(prisma.publication, 'findFirst').mockResolvedValue(null);
    vi.spyOn(prisma.socialAccount, 'findMany').mockResolvedValue([
      { id: linkedinAccId, workspaceId: wsId, platform: 'LINKEDIN' },
    ] as any);

    const mockTx = {
      content: { create: vi.fn().mockResolvedValue({ id: 'content-sched-appr' }) },
      contentVariant: { create: vi.fn().mockResolvedValue({ id: 'variant-sched-appr' }) },
      publication: {
        create: vi
          .fn()
          .mockImplementation((args: TxDataArgs) =>
            Promise.resolve({ id: 'pub-sched-appr', ...args.data })
          ),
      },
      publishAttempt: { create: vi.fn().mockResolvedValue({ id: 'att-sched-appr' }) },
      outboxCommand: { create: vi.fn() },
      approval: { create: vi.fn().mockResolvedValue({ id: 'approval-sched' }) },
      approvalToken: { create: vi.fn().mockResolvedValue({ id: 'token-sched' }) },
    };

    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => cb(mockTx));

    const token = app.jwt.sign({ sub: userId });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/posts',
      headers: {
        authorization: `Bearer ${token}`,
        'x-workspace-id': wsId,
      },
      payload: {
        body: 'Scheduled post awaiting approval',
        scheduledAt: futureDate,
        targets: [{ socialAccountId: linkedinAccId, platform: 'LINKEDIN' }],
      },
    });

    expect(res.statusCode).toBe(202);
    const json = JSON.parse(res.body);
    expect(json.data.publications[0].status).toBe('REQUIRES_APPROVAL');
    expect(mockTx.publication.create.mock.calls[0][0].data.scheduledAt).toEqual(
      new Date(futureDate)
    );
    expect(mockTx.outboxCommand.create).not.toHaveBeenCalled();
  });

  it('POST /v1/posts rejects a non-UUID Idempotency-Key header', async () => {
    const { prisma } = await import('scriora-core');
    const wsId = '22222222-2222-4222-8222-222222222222';
    vi.spyOn(prisma.workspaceMember, 'findUnique').mockResolvedValue({
      workspaceId: wsId,
      userId: 'user-123',
      workspaceRole: 'OWNER',
      joinedAt: new Date(),
      workspace: {
        id: wsId,
        name: 'Idempotency WS',
        slug: 'idemp-ws',
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

    const token = app.jwt.sign({ sub: 'user-123' });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/posts',
      headers: {
        authorization: `Bearer ${token}`,
        'x-workspace-id': wsId,
        'idempotency-key': 'short-prefix',
      },
      payload: {
        body: 'Should not persist',
        targets: [
          {
            socialAccountId: '11111111-1111-4111-8111-111111111111',
            platform: 'LINKEDIN',
          },
        ],
      },
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(json.error.message).toContain('Idempotency-Key');
  });

  it('POST /v1/posts looks up Idempotency-Key by exact match, not startsWith', async () => {
    const { prisma } = await import('scriora-core');
    const wsId = '22222222-2222-4222-8222-222222222222';
    const userId = 'user-123';
    const accountId = '33333333-3333-4333-8333-333333333333';
    const headerKey = '99999999-9999-4999-8999-999999999999';

    vi.spyOn(prisma.workspaceMember, 'findUnique').mockResolvedValue({
      workspaceId: wsId,
      userId,
      workspaceRole: 'OWNER',
      joinedAt: new Date(),
      workspace: {
        id: wsId,
        name: 'Exact Key WS',
        slug: 'exact-key-ws',
        purpose: 'WORK',
        defaultOperatingMode: 'MANUAL',
        ownerUserId: userId,
        country: null,
        timezone: 'UTC',
        requiresApproval: false,
        settings: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    } as any);

    const findFirst = vi.spyOn(prisma.publication, 'findFirst').mockResolvedValue({
      id: 'existing-pub',
      status: 'READY',
    } as any);

    const token = app.jwt.sign({ sub: userId });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/posts',
      headers: {
        authorization: `Bearer ${token}`,
        'x-workspace-id': wsId,
        'idempotency-key': headerKey,
      },
      payload: {
        body: 'Replay with header key',
        targets: [{ socialAccountId: accountId, platform: 'LINKEDIN' }],
      },
    });

    expect(res.statusCode).toBe(202);
    expect(JSON.parse(res.body).data.idempotentReplay).toBe(true);
    expect(findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        idempotencyKey: { in: [headerKey, `${headerKey}:${accountId}`] },
      }),
    });
    expect(JSON.stringify(findFirst.mock.calls[0]![0])).not.toContain('startsWith');
  });
});
