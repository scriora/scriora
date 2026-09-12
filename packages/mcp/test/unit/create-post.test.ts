import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from 'scriora-core';
import { executeCreatePost, formatCreatePostToolResponse } from '../../src/tools/create-post.js';
import * as approvalDelivery from '../../src/lib/approval-delivery.js';

interface TxDataArgs {
  data: Record<string, unknown>;
}

const workspaceId = '11111111-1111-4111-8111-111111111111';
const accountId = '22222222-2222-4222-8222-222222222222';
const ownerUserId = '33333333-3333-4333-8333-333333333333';

function createMockTx() {
  return {
    content: {
      create: vi.fn().mockResolvedValue({ id: 'content-1' }),
    },
    contentVariant: {
      create: vi.fn().mockResolvedValue({ id: 'variant-1' }),
    },
    publication: {
      create: vi.fn().mockImplementation((args: TxDataArgs) =>
        Promise.resolve({ id: 'pub-1', ...args.data })
      ),
    },
    publishAttempt: {
      create: vi.fn().mockResolvedValue({ id: 'attempt-1' }),
    },
    outboxCommand: {
      create: vi.fn().mockResolvedValue({ id: 'outbox-1' }),
    },
    approval: {
      create: vi.fn().mockResolvedValue({ id: 'approval-1' }),
    },
    approvalToken: {
      create: vi.fn().mockResolvedValue({ id: 'token-1' }),
    },
  };
}

describe('scriora_create_post (shared createUnifiedPost path)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('refuses unknown workspaceId and never writes a draft row', async () => {
    vi.spyOn(prisma.workspace, 'findUnique').mockResolvedValue(null);
    const contentCreate = vi.spyOn(prisma.content, 'create');
    const transaction = vi.spyOn(prisma, '$transaction');

    const result = await executeCreatePost({
      workspaceId,
      body: 'Should not persist',
      targets: [{ socialAccountId: accountId, platform: 'LINKEDIN' }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe('WORKSPACE_NOT_FOUND');
    expect(contentCreate).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain('STAGED');
  });

  it('creates publications and outbox through createUnifiedPost when approval is off', async () => {
    vi.spyOn(prisma.workspace, 'findUnique').mockResolvedValue({
      id: workspaceId,
      requiresApproval: false,
      ownerUserId,
    } as any);
    vi.spyOn(prisma.publication, 'findFirst').mockResolvedValue(null);
    vi.spyOn(prisma.socialAccount, 'findMany').mockResolvedValue([
      { id: accountId, workspaceId, platform: 'LINKEDIN' },
    ] as any);

    const mockTx = createMockTx();
    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => cb(mockTx));

    const result = await executeCreatePost({
      workspaceId,
      body: 'Queue me',
      targets: [{ socialAccountId: accountId, platform: 'LINKEDIN' }],
      mediaUrls: ['https://cdn.example.com/img.png'],
    });

    expect(mockTx.content.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId,
          status: 'READY',
          createdByUserId: ownerUserId,
        }),
      })
    );
    expect(mockTx.publication.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'READY' }),
      })
    );
    expect(mockTx.outboxCommand.create).toHaveBeenCalledTimes(1);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.status).toBe('READY');
    expect(result.status).not.toBe('STAGED');
    expect(result.publicationCount).toBe(1);
    expect(result.outboxCommandCount).toBe(1);
    expect(result.publications[0]?.outboxCommandId).toBe('outbox-1');
    expect(result.message).toBe('Publication queued for dispatch');
    expect(JSON.stringify(result)).not.toContain('STAGED');
  });

  it('honors workspace.requiresApproval and does not report STAGED for a held publication', async () => {
    vi.spyOn(prisma.workspace, 'findUnique').mockResolvedValue({
      id: workspaceId,
      requiresApproval: true,
      ownerUserId,
    } as any);
    vi.spyOn(prisma.publication, 'findFirst').mockResolvedValue(null);
    vi.spyOn(prisma.socialAccount, 'findMany').mockResolvedValue([
      { id: accountId, workspaceId, platform: 'LINKEDIN' },
    ] as any);

    const telegramSpy = vi
      .spyOn(approvalDelivery, 'maybeSendTelegramApprovalRequests')
      .mockResolvedValue({ attempted: true, delivered: 1 });

    const mockTx = createMockTx();
    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => cb(mockTx));

    const result = await executeCreatePost({
      workspaceId,
      body: 'Needs approval',
      targets: [{ socialAccountId: accountId, platform: 'LINKEDIN' }],
    });

    expect(mockTx.publication.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'REQUIRES_APPROVAL' }),
      })
    );
    expect(mockTx.outboxCommand.create).not.toHaveBeenCalled();
    expect(mockTx.approval.create).toHaveBeenCalledTimes(1);
    expect(mockTx.approvalToken.create).toHaveBeenCalledTimes(1);
    expect(telegramSpy).toHaveBeenCalledTimes(1);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.status).toBe('REQUIRES_APPROVAL');
    expect(result.requiresApproval).toBe(true);
    expect(result.outboxCommandCount).toBe(0);
    expect(result.publications[0]?.outboxCommandId).toBeNull();
    expect(result.message).toBe('Submitted for approval');
    expect(result.status).not.toBe('STAGED');
    expect(result.status).not.toBe('DRAFT');
    expect(JSON.stringify(result)).not.toContain('"STAGED"');
  });

  it('maps facebookOptions onto the shared PublishTarget platformOptions', async () => {
    vi.spyOn(prisma.workspace, 'findUnique').mockResolvedValue({
      id: workspaceId,
      requiresApproval: false,
      ownerUserId,
    } as any);
    vi.spyOn(prisma.publication, 'findFirst').mockResolvedValue(null);
    vi.spyOn(prisma.socialAccount, 'findMany').mockResolvedValue([
      { id: accountId, workspaceId, platform: 'FACEBOOK' },
    ] as any);

    const mockTx = createMockTx();
    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => cb(mockTx));

    const result = await executeCreatePost({
      workspaceId,
      body: 'Facebook page post',
      targets: [
        {
          socialAccountId: accountId,
          platform: 'FACEBOOK',
          facebookOptions: { pageId: 'page-1', published: false },
        },
      ],
    });

    expect(result.ok).toBe(true);
    const variantMeta = mockTx.contentVariant.create.mock.calls[0]![0].data.metadata as Record<
      string,
      unknown
    >;
    expect(variantMeta.platform).toBe('FACEBOOK');
    expect(variantMeta.options).toEqual({ pageId: 'page-1', published: false });
    expect(mockTx.outboxCommand.create.mock.calls[0]![0].data.payload.options).toEqual({
      platform: 'FACEBOOK',
      options: { pageId: 'page-1', published: false },
    });
  });

  it('surfaces SOCIAL_ACCOUNT_NOT_FOUND from the shared path without claiming STAGED', async () => {
    vi.spyOn(prisma.workspace, 'findUnique').mockResolvedValue({
      id: workspaceId,
      requiresApproval: false,
      ownerUserId,
    } as any);
    vi.spyOn(prisma.publication, 'findFirst').mockResolvedValue(null);
    vi.spyOn(prisma.socialAccount, 'findMany').mockResolvedValue([]);

    const result = await executeCreatePost({
      workspaceId,
      body: 'Bad target',
      targets: [{ socialAccountId: accountId, platform: 'LINKEDIN' }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe('SOCIAL_ACCOUNT_NOT_FOUND');
    const formatted = formatCreatePostToolResponse(result);
    expect(formatted.isError).toBe(true);
    expect(formatted.content[0]?.text).not.toContain('STAGED');
  });
});
