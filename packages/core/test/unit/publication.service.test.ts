import { describe, expect, it, vi } from 'vitest';
import {
  computePublicationFingerprint,
  createPublicationWithOutbox,
} from '../../src/domain/publishing/publication.service.js';

describe('Publication Service Unit Tests', () => {
  it('computes deterministic SHA-256 fingerprint for identical inputs', () => {
    const input = {
      workspaceId: '11111111-1111-1111-1111-111111111111',
      variantId: '22222222-2222-2222-2222-222222222222',
      socialAccountId: '33333333-3333-3333-3333-333333333333',
      scheduledAt: new Date('2026-09-15T12:00:00Z'),
    };
    const fp1 = computePublicationFingerprint(input);
    const fp2 = computePublicationFingerprint(input);
    expect(fp1).toHaveLength(64);
    expect(fp1).toBe(fp2);
  });

  it('atomically creates Publication, PublishAttempt, and OutboxCommand in one transaction', async () => {
    const mockDb = {
      workspace: {
        findUnique: vi.fn().mockResolvedValue({ id: 'ws-1', requiresApproval: false }),
      },
      contentVariant: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'variant-1',
          workspaceId: 'ws-1',
          body: 'Test post body',
        }),
      },
      socialAccount: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'acc-1',
          workspaceId: 'ws-1',
          platform: 'LINKEDIN',
        }),
      },
      $transaction: vi.fn().mockImplementation(async (callback) => {
        const tx = {
          publication: {
            create: vi.fn().mockResolvedValue({
              id: 'pub-1',
              workspaceId: 'ws-1',
              contentVariantId: 'variant-1',
              socialAccountId: 'acc-1',
              status: 'READY',
              scheduledAt: null,
              publishedAt: null,
              externalPostId: null,
              externalPostUrl: null,
              idempotencyKey: 'idemp-1',
              fingerprint: 'fp-1',
              createdAt: new Date(),
              updatedAt: new Date(),
            }),
          },
          publishAttempt: {
            create: vi.fn().mockResolvedValue({
              id: 'attempt-1',
            }),
          },
          outboxCommand: {
            create: vi.fn().mockResolvedValue({
              id: 'outbox-1',
            }),
          },
        };
        return await callback(tx);
      }),
    };

    const result = await createPublicationWithOutbox(mockDb as any, {
      workspaceId: 'ws-1',
      contentVariantId: 'variant-1',
      socialAccountId: 'acc-1',
    });

    expect(result.publication.id).toBe('pub-1');
    expect(result.publishAttemptId).toBe('attempt-1');
    expect(result.outboxCommandId).toBe('outbox-1');
    expect(result.requiresApproval).toBe(false);
    expect(mockDb.$transaction).toHaveBeenCalledTimes(1);
  });

  it('rejects if ContentVariant does not belong to the workspace', async () => {
    const mockDb = {
      workspace: {
        findUnique: vi.fn().mockResolvedValue({ id: 'ws-attacker', requiresApproval: false }),
      },
      contentVariant: { findFirst: vi.fn().mockResolvedValue(null) },
      socialAccount: { findFirst: vi.fn().mockResolvedValue({ id: 'acc-1' }) },
      $transaction: vi.fn(),
    };

    await expect(
      createPublicationWithOutbox(mockDb as any, {
        workspaceId: 'ws-attacker',
        contentVariantId: 'variant-victim',
        socialAccountId: 'acc-1',
      })
    ).rejects.toThrow('CONTENT_VARIANT_NOT_FOUND_IN_WORKSPACE');
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it('rejects if SocialAccount does not belong to the workspace', async () => {
    const mockDb = {
      workspace: {
        findUnique: vi.fn().mockResolvedValue({ id: 'ws-1', requiresApproval: false }),
      },
      contentVariant: {
        findFirst: vi.fn().mockResolvedValue({ id: 'variant-1', workspaceId: 'ws-1' }),
      },
      socialAccount: { findFirst: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(),
    };

    await expect(
      createPublicationWithOutbox(mockDb as any, {
        workspaceId: 'ws-1',
        contentVariantId: 'variant-1',
        socialAccountId: 'acc-attacker',
      })
    ).rejects.toThrow('SOCIAL_ACCOUNT_NOT_FOUND_IN_WORKSPACE');
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it('correctly creates scheduled publication when scheduledAt is in the future', async () => {
    const futureDate = new Date(Date.now() + 86400000);
    let createdPublicationData: any;
    let createdOutboxData: any;

    const mockDb = {
      workspace: {
        findUnique: vi.fn().mockResolvedValue({ id: 'ws-1', requiresApproval: false }),
      },
      contentVariant: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'variant-1',
          workspaceId: 'ws-1',
          body: 'Scheduled post body',
        }),
      },
      socialAccount: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'acc-1',
          workspaceId: 'ws-1',
          platform: 'TWITTER',
        }),
      },
      $transaction: vi.fn().mockImplementation(async (callback) => {
        const tx = {
          publication: {
            create: vi.fn().mockImplementation(async ({ data }) => {
              createdPublicationData = data;
              return {
                id: 'pub-sched-1',
                ...data,
                publishedAt: null,
                externalPostId: null,
                externalPostUrl: null,
                createdAt: new Date(),
                updatedAt: new Date(),
              };
            }),
          },
          publishAttempt: {
            create: vi.fn().mockResolvedValue({ id: 'attempt-sched-1' }),
          },
          outboxCommand: {
            create: vi.fn().mockImplementation(async ({ data }) => {
              createdOutboxData = data;
              return { id: 'outbox-sched-1', ...data };
            }),
          },
        };
        return await callback(tx);
      }),
    };

    const result = await createPublicationWithOutbox(mockDb as any, {
      workspaceId: 'ws-1',
      contentVariantId: 'variant-1',
      socialAccountId: 'acc-1',
      scheduledAt: futureDate,
      createdByUserId: 'user-1',
    });

    expect(result.publication.id).toBe('pub-sched-1');
    expect(createdPublicationData.status).toBe('SCHEDULED');
    expect(createdPublicationData.createdByUserId).toBe('user-1');
    expect(createdOutboxData.payload.scheduledAt).toBe(futureDate.toISOString());
    expect(createdOutboxData.availableAt).toEqual(futureDate);
  });

  it('reads workspace.requiresApproval and does not create a sweepable outbox', async () => {
    let createdPublicationData: Record<string, unknown> | undefined;
    let createdTokenData: Record<string, unknown> | undefined;

    const mockTx = {
      publication: {
        create: vi.fn().mockImplementation(async ({ data }) => {
          createdPublicationData = data;
          return {
            id: 'pub-hold-1',
            ...data,
            publishedAt: null,
            externalPostId: null,
            externalPostUrl: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        }),
      },
      publishAttempt: {
        create: vi.fn().mockResolvedValue({ id: 'attempt-hold-1' }),
      },
      outboxCommand: {
        create: vi.fn(),
      },
      approval: {
        create: vi.fn().mockResolvedValue({ id: 'approval-hold-1' }),
      },
      approvalToken: {
        create: vi.fn().mockImplementation(async ({ data }) => {
          createdTokenData = data;
          return { id: 'token-hold-1', ...data };
        }),
      },
    };

    const mockDb = {
      workspace: {
        findUnique: vi.fn().mockResolvedValue({ id: 'ws-1', requiresApproval: true }),
      },
      contentVariant: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'variant-1',
          workspaceId: 'ws-1',
          body: 'Needs approval',
        }),
      },
      socialAccount: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'acc-1',
          workspaceId: 'ws-1',
          platform: 'LINKEDIN',
        }),
      },
      $transaction: vi.fn().mockImplementation(async (callback) => callback(mockTx)),
    };

    const result = await createPublicationWithOutbox(mockDb as any, {
      workspaceId: 'ws-1',
      contentVariantId: 'variant-1',
      socialAccountId: 'acc-1',
      createdByUserId: '11111111-1111-4111-8111-111111111111',
    });

    expect(result.requiresApproval).toBe(true);
    expect(result.outboxCommandId).toBeNull();
    expect(result.approvalId).toBe('approval-hold-1');
    expect(result.approvalToken).toMatch(/^[0-9a-f]{32}$/);
    expect(result.approvalUrl).toContain(`/v1/approve/${result.approvalToken}`);
    expect(createdPublicationData?.status).toBe('REQUIRES_APPROVAL');
    expect(mockTx.outboxCommand.create).not.toHaveBeenCalled();
    expect(mockTx.approval.create).toHaveBeenCalledTimes(1);
    expect(createdTokenData?.tokenHash).not.toBe(result.approvalToken);
    expect(JSON.stringify(createdTokenData)).not.toContain(result.approvalToken);
  });

  it('does not create an outbox for scheduled + workspace.requiresApproval', async () => {
    const futureDate = new Date(Date.now() + 86400000);
    let createdPublicationData: Record<string, unknown> | undefined;

    const mockTx = {
      publication: {
        create: vi.fn().mockImplementation(async ({ data }) => {
          createdPublicationData = data;
          return {
            id: 'pub-sched-hold',
            ...data,
            publishedAt: null,
            externalPostId: null,
            externalPostUrl: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        }),
      },
      publishAttempt: {
        create: vi.fn().mockResolvedValue({ id: 'attempt-sched-hold' }),
      },
      outboxCommand: { create: vi.fn() },
      approval: { create: vi.fn().mockResolvedValue({ id: 'approval-sched-hold' }) },
      approvalToken: { create: vi.fn().mockResolvedValue({ id: 'token-sched-hold' }) },
    };

    const mockDb = {
      workspace: {
        findUnique: vi.fn().mockResolvedValue({ id: 'ws-1', requiresApproval: true }),
      },
      contentVariant: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'variant-1',
          workspaceId: 'ws-1',
          body: 'Scheduled approval post',
        }),
      },
      socialAccount: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'acc-1',
          workspaceId: 'ws-1',
          platform: 'X',
        }),
      },
      $transaction: vi.fn().mockImplementation(async (callback) => callback(mockTx)),
    };

    const result = await createPublicationWithOutbox(mockDb as any, {
      workspaceId: 'ws-1',
      contentVariantId: 'variant-1',
      socialAccountId: 'acc-1',
      scheduledAt: futureDate,
    });

    expect(result.outboxCommandId).toBeNull();
    expect(createdPublicationData?.status).toBe('REQUIRES_APPROVAL');
    expect(createdPublicationData?.scheduledAt).toEqual(futureDate);
    expect(mockTx.outboxCommand.create).not.toHaveBeenCalled();
  });

  it('rejects when the workspace does not exist', async () => {
    const mockDb = {
      workspace: { findUnique: vi.fn().mockResolvedValue(null) },
      contentVariant: { findFirst: vi.fn() },
      socialAccount: { findFirst: vi.fn() },
      $transaction: vi.fn(),
    };

    await expect(
      createPublicationWithOutbox(mockDb as any, {
        workspaceId: '11111111-1111-4111-8111-111111111111',
        contentVariantId: '22222222-2222-4222-8222-222222222222',
        socialAccountId: '33333333-3333-4333-8333-333333333333',
      })
    ).rejects.toThrow('WORKSPACE_NOT_FOUND');
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });
});
