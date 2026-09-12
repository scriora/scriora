import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createTelegramC2Post,
  handleTelegramC2ApprovalDecision,
  resolveTelegramC2Workspace,
} from '../../src/lib/telegram-c2-create-post.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const otherWorkspaceId = '22222222-2222-4222-8222-222222222222';
const accountId = '33333333-3333-4333-8333-333333333333';
const ownerUserId = '44444444-4444-4444-8444-444444444444';

function createWorkspace(overrides: Record<string, unknown> = {}) {
  return {
    id: workspaceId,
    name: 'Scriora HQ',
    ownerUserId,
    requiresApproval: false,
    ...overrides,
  };
}

describe('resolveTelegramC2Workspace', () => {
  const previousWorkspaceId = process.env.TELEGRAM_WORKSPACE_ID;

  afterEach(() => {
    if (previousWorkspaceId === undefined) {
      delete process.env.TELEGRAM_WORKSPACE_ID;
    } else {
      process.env.TELEGRAM_WORKSPACE_ID = previousWorkspaceId;
    }
  });

  it('uses TELEGRAM_WORKSPACE_ID when set', async () => {
    process.env.TELEGRAM_WORKSPACE_ID = workspaceId;
    const db = {
      workspace: {
        findUnique: vi.fn().mockResolvedValue(createWorkspace()),
        findMany: vi.fn(),
      },
    };

    const workspace = await resolveTelegramC2Workspace(db as any);

    expect(workspace.id).toBe(workspaceId);
    expect(db.workspace.findUnique).toHaveBeenCalledWith({
      where: { id: workspaceId },
      select: expect.objectContaining({ requiresApproval: true }),
    });
    expect(db.workspace.findMany).not.toHaveBeenCalled();
  });

  it('rejects an unknown TELEGRAM_WORKSPACE_ID', async () => {
    process.env.TELEGRAM_WORKSPACE_ID = workspaceId;
    const db = {
      workspace: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };

    await expect(resolveTelegramC2Workspace(db as any)).rejects.toThrow(
      'TELEGRAM_WORKSPACE_NOT_FOUND'
    );
  });

  it('allows a single workspace when TELEGRAM_WORKSPACE_ID is unset', async () => {
    delete process.env.TELEGRAM_WORKSPACE_ID;
    const db = {
      workspace: {
        findMany: vi.fn().mockResolvedValue([createWorkspace()]),
      },
    };

    await expect(resolveTelegramC2Workspace(db as any)).resolves.toEqual(createWorkspace());
  });

  it('refuses to pick the oldest of multiple workspaces', async () => {
    delete process.env.TELEGRAM_WORKSPACE_ID;
    const db = {
      workspace: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            createWorkspace(),
            createWorkspace({ id: otherWorkspaceId, name: 'Other' }),
          ]),
      },
    };

    await expect(resolveTelegramC2Workspace(db as any)).rejects.toThrow('TELEGRAM_WORKSPACE_ID');
  });
});

describe('createTelegramC2Post', () => {
  beforeEach(() => {
    delete process.env.TELEGRAM_WORKSPACE_ID;
  });

  it('creates through createUnifiedPost when approval is off and creates a sweepable path', async () => {
    const createPost = vi.fn().mockResolvedValue({
      kind: 'created',
      contentId: 'content-1',
      publications: [
        {
          publicationId: 'pub-1',
          platform: 'LINKEDIN',
          status: 'READY',
          outboxCommandId: 'outbox-1',
        },
      ],
      pendingTelegramApprovals: [],
      isScheduled: false,
      requiresApproval: false,
      message: 'Publication queued for dispatch',
    });
    const deliverApprovals = vi.fn();

    const db = {
      workspace: {
        findMany: vi.fn().mockResolvedValue([createWorkspace({ requiresApproval: false })]),
      },
      socialAccount: {
        findMany: vi.fn().mockResolvedValue([{ id: accountId, platform: 'LINKEDIN' }]),
      },
    };

    const result = await createTelegramC2Post(
      db as any,
      { text: 'Hello from Telegram C2' },
      { createPost, deliverApprovals }
    );

    expect(result).toEqual({
      publicationCount: 1,
      requiresApproval: false,
      message: 'Publication queued for dispatch',
    });
    expect(createPost).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        workspaceId,
        createdByUserId: ownerUserId,
        requiresApproval: false,
        body: 'Hello from Telegram C2',
        targets: [{ socialAccountId: accountId, platform: 'LINKEDIN' }],
      })
    );
    expect(deliverApprovals).not.toHaveBeenCalled();
  });

  it('honors workspace.requiresApproval and delivers the PR-B approval token path', async () => {
    const pending = [
      {
        approvalId: 'approval-1',
        token: 'a'.repeat(32),
        title: 'Needs review',
        body: 'Hold this post',
        platform: 'LINKEDIN',
      },
    ];
    const createPost = vi.fn().mockResolvedValue({
      kind: 'created',
      contentId: 'content-1',
      publications: [
        {
          publicationId: 'pub-1',
          platform: 'LINKEDIN',
          status: 'REQUIRES_APPROVAL',
          outboxCommandId: null,
          approvalId: 'approval-1',
          approvalToken: pending[0]!.token,
          approvalUrl: 'http://localhost:4000/v1/approve/' + pending[0]!.token,
        },
      ],
      pendingTelegramApprovals: pending,
      isScheduled: false,
      requiresApproval: true,
      message: 'Submitted for approval',
    });
    const deliverApprovals = vi.fn().mockResolvedValue({ attempted: true, delivered: 1 });

    const db = {
      workspace: {
        findMany: vi.fn().mockResolvedValue([createWorkspace({ requiresApproval: true })]),
      },
      socialAccount: {
        findMany: vi.fn().mockResolvedValue([{ id: accountId, platform: 'LINKEDIN' }]),
      },
    };

    const result = await createTelegramC2Post(
      db as any,
      { text: 'Hold this post' },
      { createPost, deliverApprovals }
    );

    expect(result.requiresApproval).toBe(true);
    expect(result.publicationCount).toBe(1);
    expect(result.message).toBe('Submitted for approval');
    expect(createPost).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        requiresApproval: true,
        workspaceId,
      })
    );
    expect(deliverApprovals).toHaveBeenCalledWith(pending);
  });

  it('does not treat createUnifiedPost as optional when no accounts exist', async () => {
    const createPost = vi.fn();
    const db = {
      workspace: {
        findMany: vi.fn().mockResolvedValue([createWorkspace()]),
      },
      socialAccount: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    await expect(
      createTelegramC2Post(db as any, { text: 'No targets' }, { createPost })
    ).rejects.toThrow('No connected social accounts found in workspace');
    expect(createPost).not.toHaveBeenCalled();
  });
});

describe('handleTelegramC2ApprovalDecision', () => {
  it('creates a sweepable outbox when APPROVED', async () => {
    const publicationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const mockTx = {
      approvalToken: { update: vi.fn().mockResolvedValue({}) },
      approval: { update: vi.fn().mockResolvedValue({}) },
      publication: {
        update: vi.fn().mockResolvedValue({}),
        findUnique: vi.fn().mockResolvedValue({
          id: publicationId,
          workspaceId,
          socialAccountId: accountId,
          scheduledAt: null,
          idempotencyKey: 'idemp-1',
          fingerprint: 'f'.repeat(64),
          contentVariant: { body: 'Approved via Telegram', metadata: { mediaUrls: [] } },
          socialAccount: { platform: 'LINKEDIN' },
          publishAttempts: [{ id: 'attempt-1' }],
        }),
      },
      outboxCommand: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'outbox-after-approve',
          availableAt: new Date('2026-09-12T11:00:00.000Z'),
          status: 'PENDING',
        }),
        deleteMany: vi.fn(),
      },
    };

    const db = {
      approvalToken: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'token-row-1',
          tokenHash: 'hash',
          usedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
          approval: {
            id: 'approval-1',
            resourceType: 'PUBLICATION',
            resourceId: publicationId,
            status: 'PENDING',
          },
        }),
      },
      $transaction: vi.fn().mockImplementation(async (cb: (tx: typeof mockTx) => unknown) =>
        cb(mockTx)
      ),
    };

    const send = vi.fn().mockResolvedValue({ ids: ['evt-1'] });

    await expect(
      handleTelegramC2ApprovalDecision(db as any, 'raw-token', 'APPROVED', {
        sendPublicationRequested: send,
      })
    ).resolves.toBe(true);
    expect(mockTx.publication.update).toHaveBeenCalledWith({
      where: { id: publicationId },
      data: { status: 'READY' },
    });
    expect(mockTx.outboxCommand.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          publicationId,
          status: 'PENDING',
          commandType: 'SOCIAL_PUBLISH',
        }),
      })
    );
    expect(send).toHaveBeenCalledWith({
      name: 'scriora/publication.requested',
      data: { outboxCommandId: 'outbox-after-approve' },
    });
  });

  it('returns false for a missing or expired token', async () => {
    const db = {
      approvalToken: { findFirst: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(),
    };

    await expect(
      handleTelegramC2ApprovalDecision(db as any, 'missing', 'APPROVED')
    ).resolves.toBe(false);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
