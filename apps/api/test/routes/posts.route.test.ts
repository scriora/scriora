import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/app.js';

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

    vi.spyOn(prisma.outboxCommand, 'findFirst').mockResolvedValue(null);
    vi.spyOn(prisma.socialAccount, 'findMany').mockResolvedValue([
      { id: linkedinAccId, workspaceId: wsId, platform: 'LINKEDIN' },
      { id: xAccId, workspaceId: wsId, platform: 'X' },
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

    vi.spyOn(prisma.outboxCommand, 'findFirst').mockResolvedValue(null);
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

    vi.spyOn(prisma.outboxCommand, 'findFirst').mockResolvedValue(null);
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
    expect(variantCalls[0][0].data.body).toBe('📢 Formal announcement for Channel subscribers with bullet points!');
    expect(variantCalls[1][0].data.body).toBe('💬 Informal community prompt: What do you think about our new update?');

    const outboxCalls = mockTx.outboxCommand.create.mock.calls;
    expect(outboxCalls[0][0].data.payload.body).toBe('📢 Formal announcement for Channel subscribers with bullet points!');
    expect(outboxCalls[1][0].data.payload.body).toBe('💬 Informal community prompt: What do you think about our new update?');
  });
});
