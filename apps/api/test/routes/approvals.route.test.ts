import { prisma } from 'scriora-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import * as publicationRequested from '../../src/lib/publication-requested.js';

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

  it('GET /v1/approve/:token scopes publication previews to the token workspace', async () => {
    const workspaceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const publicationId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    vi.spyOn(prisma.approvalToken, 'findFirst').mockResolvedValue({
      id: 'token-row-preview',
      workspaceId,
      approvalId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      approval: {
        resourceType: 'PUBLICATION',
        resourceId: publicationId,
        status: 'PENDING',
      },
    } as any);
    const publicationLookup = vi.spyOn(prisma.publication, 'findFirst').mockResolvedValue(null);

    const res = await app.inject({
      method: 'GET',
      url: '/v1/approve/tenant-scoped-preview-token',
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.post).toBeNull();
    expect(publicationLookup).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: publicationId, workspaceId },
      })
    );
  });

  it('POST /v1/approve/:token/decision APPROVED creates a sweepable PENDING outbox and dispatches immediately', async () => {
    const publicationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const approvalId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const attemptId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const scheduledAt = null;

    vi.spyOn(prisma.approvalToken, 'findFirst').mockResolvedValue({
      id: 'token-row-1',
      tokenHash: 'hash',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      approval: {
        id: approvalId,
        resourceType: 'PUBLICATION',
        resourceId: publicationId,
        status: 'PENDING',
      },
    } as any);

    const mockTx = {
      approvalToken: { update: vi.fn().mockResolvedValue({}) },
      approval: { update: vi.fn().mockResolvedValue({}) },
      publication: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue({
          id: publicationId,
          workspaceId: 'ws-1',
          socialAccountId: 'acc-1',
          scheduledAt,
          idempotencyKey: 'idemp-1:acc-1',
          fingerprint: 'f'.repeat(64),
          contentVariant: {
            body: 'Approved post body',
            metadata: {
              mediaUrls: ['https://cdn.example.com/a.png'],
              platform: 'LINKEDIN',
              options: { visibility: 'PUBLIC' },
            },
          },
          socialAccount: { platform: 'LINKEDIN' },
          publishAttempts: [{ id: attemptId }],
        }),
      },
      outboxCommand: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'outbox-after-approve',
          availableAt: new Date(),
          status: 'PENDING',
        }),
        deleteMany: vi.fn(),
      },
    };

    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => cb(mockTx));
    const dispatch = vi
      .spyOn(publicationRequested, 'maybeDispatchPublicationRequested')
      .mockResolvedValue({ dispatched: true, reason: 'sent' });

    const res = await app.inject({
      method: 'POST',
      url: '/v1/approve/valid-approval-token/decision',
      payload: { decision: 'APPROVED' },
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(true);
    expect(json.data.decision).toBe('APPROVED');
    expect(mockTx.publication.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: publicationId, status: 'REQUIRES_APPROVAL' },
        data: { status: 'READY' },
      })
    );
    expect(mockTx.outboxCommand.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          publicationId,
          publishAttemptId: attemptId,
          status: 'PENDING',
          commandType: 'SOCIAL_PUBLISH',
          payload: expect.objectContaining({
            body: 'Approved post body',
            platform: 'LINKEDIN',
            mediaUrls: ['https://cdn.example.com/a.png'],
          }),
        }),
      })
    );
    expect(mockTx.outboxCommand.deleteMany).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        outboxCommandId: 'outbox-after-approve',
        status: 'PENDING',
        created: true,
      })
    );
  });

  it('POST /v1/approve/:token/decision APPROVED for a scheduled post sets availableAt to scheduledAt', async () => {
    const publicationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const scheduledAt = new Date(Date.now() + 2 * 60 * 60 * 1000);

    vi.spyOn(prisma.approvalToken, 'findFirst').mockResolvedValue({
      id: 'token-row-sched',
      tokenHash: 'hash',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      approval: {
        id: 'approval-sched',
        resourceType: 'PUBLICATION',
        resourceId: publicationId,
        status: 'PENDING',
      },
    } as any);

    const mockTx = {
      approvalToken: { update: vi.fn().mockResolvedValue({}) },
      approval: { update: vi.fn().mockResolvedValue({}) },
      publication: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue({
          id: publicationId,
          workspaceId: 'ws-1',
          socialAccountId: 'acc-1',
          scheduledAt,
          idempotencyKey: 'idemp-sched',
          fingerprint: 's'.repeat(64),
          contentVariant: { body: 'Later', metadata: {} },
          socialAccount: { platform: 'X' },
          publishAttempts: [{ id: 'attempt-sched' }],
        }),
      },
      outboxCommand: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'outbox-sched',
          availableAt: scheduledAt,
          status: 'PENDING',
        }),
        deleteMany: vi.fn(),
      },
    };

    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => cb(mockTx));
    const dispatch = vi
      .spyOn(publicationRequested, 'maybeDispatchPublicationRequested')
      .mockResolvedValue({ dispatched: false, reason: 'available-in-future' });

    const res = await app.inject({
      method: 'POST',
      url: '/v1/approve/sched-token/decision',
      payload: { decision: 'APPROVED' },
    });

    expect(res.statusCode).toBe(200);
    expect(mockTx.outboxCommand.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'PENDING',
          availableAt: scheduledAt,
        }),
      })
    );
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        outboxCommandId: 'outbox-sched',
        availableAt: scheduledAt,
        status: 'PENDING',
      })
    );
  });

  it('POST /v1/approve/:token/decision REJECTED cancels publication and deletes PENDING outbox only', async () => {
    const publicationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

    vi.spyOn(prisma.approvalToken, 'findFirst').mockResolvedValue({
      id: 'token-row-rej',
      tokenHash: 'hash',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      approval: {
        id: 'approval-rej',
        resourceType: 'PUBLICATION',
        resourceId: publicationId,
        status: 'PENDING',
      },
    } as any);

    const mockTx = {
      approvalToken: { update: vi.fn().mockResolvedValue({}) },
      approval: { update: vi.fn().mockResolvedValue({}) },
      publication: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn(),
      },
      outboxCommand: {
        findFirst: vi.fn(),
        create: vi.fn(),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };

    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => cb(mockTx));

    const res = await app.inject({
      method: 'POST',
      url: '/v1/approve/reject-token/decision',
      payload: { decision: 'REJECTED' },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.decision).toBe('REJECTED');
    expect(mockTx.publication.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: publicationId, status: 'REQUIRES_APPROVAL' },
        data: { status: 'CANCELLED' },
      })
    );
    expect(mockTx.outboxCommand.deleteMany).toHaveBeenCalledWith({
      where: { publicationId, status: 'PENDING' },
    });
    expect(mockTx.outboxCommand.create).not.toHaveBeenCalled();
  });

  it('POST /v1/approve/:token/decision APPROVED does not clobber PUBLISHED (N4 CAS)', async () => {
    const publicationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

    vi.spyOn(prisma.approvalToken, 'findFirst').mockResolvedValue({
      id: 'token-row-published',
      tokenHash: 'hash',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      approval: {
        id: 'approval-published',
        resourceType: 'PUBLICATION',
        resourceId: publicationId,
        status: 'PENDING',
      },
    } as any);

    const mockTx = {
      approvalToken: { update: vi.fn().mockResolvedValue({}) },
      approval: { update: vi.fn().mockResolvedValue({}) },
      publication: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findUnique: vi.fn().mockResolvedValue({ status: 'PUBLISHED' }),
      },
      outboxCommand: {
        findFirst: vi.fn(),
        create: vi.fn(),
        deleteMany: vi.fn(),
      },
    };

    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => cb(mockTx));
    const dispatch = vi
      .spyOn(publicationRequested, 'maybeDispatchPublicationRequested')
      .mockResolvedValue({ dispatched: true, reason: 'sent' });

    const res = await app.inject({
      method: 'POST',
      url: '/v1/approve/published-token/decision',
      payload: { decision: 'APPROVED' },
    });

    expect(res.statusCode).toBe(409);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('PUBLICATION_STATUS_CONFLICT');
    expect(json.error.message).toContain('PUBLISHED');
    expect(mockTx.publication.updateMany).toHaveBeenCalledWith({
      where: { id: publicationId, status: 'REQUIRES_APPROVAL' },
      data: { status: 'READY' },
    });
    expect(mockTx.outboxCommand.create).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('POST /v1/approve/:token/decision REJECTED does not clobber PUBLISHED (N4 CAS)', async () => {
    const publicationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

    vi.spyOn(prisma.approvalToken, 'findFirst').mockResolvedValue({
      id: 'token-row-pub-rej',
      tokenHash: 'hash',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      approval: {
        id: 'approval-pub-rej',
        resourceType: 'PUBLICATION',
        resourceId: publicationId,
        status: 'PENDING',
      },
    } as any);

    const mockTx = {
      approvalToken: { update: vi.fn().mockResolvedValue({}) },
      approval: { update: vi.fn().mockResolvedValue({}) },
      publication: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findUnique: vi.fn().mockResolvedValue({ status: 'PUBLISHED' }),
      },
      outboxCommand: {
        findFirst: vi.fn(),
        create: vi.fn(),
        deleteMany: vi.fn(),
      },
    };

    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => cb(mockTx));

    const res = await app.inject({
      method: 'POST',
      url: '/v1/approve/published-reject-token/decision',
      payload: { decision: 'REJECTED' },
    });

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error.code).toBe('PUBLICATION_STATUS_CONFLICT');
    expect(mockTx.publication.updateMany).toHaveBeenCalledWith({
      where: { id: publicationId, status: 'REQUIRES_APPROVAL' },
      data: { status: 'CANCELLED' },
    });
    expect(mockTx.outboxCommand.deleteMany).not.toHaveBeenCalled();
  });
});
