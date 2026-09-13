import { describe, expect, it, vi } from 'vitest';
import {
  CreatePostError,
  createPostResponseMessage,
  createUnifiedPost,
  deriveCreatePostStatus,
} from '../../src/domain/publishing/create-post.service.js';
import { PublishPayloadSchema } from '../../src/schemas/publish.schema.js';

interface TxDataArgs {
  data: Record<string, unknown>;
}

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

function createMockDb(
  tx: ReturnType<typeof createMockTx>,
  accounts: Array<{ id: string; platform: string }>
) {
  return {
    mission: {
      findFirst: vi.fn().mockResolvedValue({ id: 'mission-1' }),
    },
    publication: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    socialAccount: {
      findMany: vi.fn().mockResolvedValue(accounts),
    },
    mediaAsset: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn().mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx)),
  };
}

const workspaceId = '11111111-1111-4111-8111-111111111111';
const accountId = '22222222-2222-4222-8222-222222222222';
const secondAccountId = '44444444-4444-4444-8444-444444444444';
const userId = '33333333-3333-4333-8333-333333333333';
const missionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('createUnifiedPost', () => {
  it('persists an in-workspace mission on the created content', async () => {
    const tx = createMockTx();
    const db = createMockDb(tx, [{ id: accountId, platform: 'LINKEDIN' }]);

    await createUnifiedPost(db as any, {
      workspaceId,
      createdByUserId: userId,
      requiresApproval: false,
      body: 'Mission-linked content',
      targets: [{ socialAccountId: accountId, platform: 'LINKEDIN' }],
      missionId,
      idempotencyKey: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    });

    expect(db.mission.findFirst).toHaveBeenCalledWith({
      where: { id: missionId, workspaceId },
      select: { id: true },
    });
    expect(tx.content.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ missionId, workspaceId }),
      })
    );
  });

  it('rejects a mission that does not belong to the workspace before writing', async () => {
    const tx = createMockTx();
    const db = createMockDb(tx, [{ id: accountId, platform: 'LINKEDIN' }]);
    db.mission.findFirst.mockResolvedValue(null);

    await expect(
      createUnifiedPost(db as any, {
        workspaceId,
        requiresApproval: false,
        body: 'Cross-tenant mission',
        targets: [{ socialAccountId: accountId, platform: 'LINKEDIN' }],
        missionId,
        idempotencyKey: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      })
    ).rejects.toMatchObject({ code: 'MISSION_NOT_FOUND' });

    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('creates publications and a sweepable outbox when approval is not required', async () => {
    const tx = createMockTx();
    const db = createMockDb(tx, [{ id: accountId, platform: 'LINKEDIN' }]);

    const result = await createUnifiedPost(db as any, {
      workspaceId,
      createdByUserId: userId,
      requiresApproval: false,
      body: 'Hello from the shared create path',
      targets: [{ socialAccountId: accountId, platform: 'LINKEDIN' }],
      idempotencyKey: '44444444-4444-4444-8444-444444444444',
    });

    expect(result.kind).toBe('created');
    if (result.kind !== 'created') {
      return;
    }
    expect(result.message).toBe('Publication queued for dispatch');
    expect(result.publications).toHaveLength(1);
    expect(result.publications[0]?.status).toBe('READY');
    expect(result.publications[0]?.outboxCommandId).toBe('outbox-1');
    expect(tx.outboxCommand.create).toHaveBeenCalledTimes(1);
    expect(tx.approval.create).not.toHaveBeenCalled();
    expect(tx.content.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'READY', workspaceId }),
      })
    );
  });

  it('holds publications at REQUIRES_APPROVAL and does not create an outbox', async () => {
    const tx = createMockTx();
    const db = createMockDb(tx, [{ id: accountId, platform: 'X' }]);

    const result = await createUnifiedPost(db as any, {
      workspaceId,
      createdByUserId: userId,
      requiresApproval: true,
      body: 'Needs human approval',
      targets: [{ socialAccountId: accountId, platform: 'X' }],
      idempotencyKey: '55555555-5555-4555-8555-555555555555',
    });

    expect(result.kind).toBe('created');
    if (result.kind !== 'created') {
      return;
    }
    expect(result.message).toBe('Submitted for approval');
    expect(result.publications[0]?.status).toBe('REQUIRES_APPROVAL');
    expect(result.publications[0]?.outboxCommandId).toBeNull();
    expect(result.publications[0]?.approvalToken).toMatch(/^[0-9a-f]{32}$/);
    expect(result.publications[0]?.approvalUrl).toContain('/v1/approve/');
    expect(tx.outboxCommand.create).not.toHaveBeenCalled();
    expect(tx.approval.create).toHaveBeenCalledTimes(1);
    expect(tx.approvalToken.create).toHaveBeenCalledTimes(1);

    const persisted = tx.approvalToken.create.mock.calls[0]![0].data as Record<string, unknown>;
    expect(persisted.tokenHash).not.toBe(result.publications[0]?.approvalToken);
    expect(JSON.stringify(persisted)).not.toContain(result.publications[0]?.approvalToken);
  });

  it('does not create an outbox for scheduled + requiresApproval', async () => {
    const tx = createMockTx();
    const db = createMockDb(tx, [{ id: accountId, platform: 'LINKEDIN' }]);
    const scheduledAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const result = await createUnifiedPost(db as any, {
      workspaceId,
      createdByUserId: userId,
      requiresApproval: true,
      body: 'Scheduled approval post',
      targets: [{ socialAccountId: accountId, platform: 'LINKEDIN' }],
      scheduledAt,
      idempotencyKey: '66666666-6666-4666-8666-666666666666',
    });

    expect(result.kind).toBe('created');
    if (result.kind !== 'created') {
      return;
    }
    expect(result.publications[0]?.status).toBe('REQUIRES_APPROVAL');
    expect(tx.publication.create.mock.calls[0]![0].data.scheduledAt).toEqual(new Date(scheduledAt));
    expect(tx.outboxCommand.create).not.toHaveBeenCalled();
  });

  it('replays an existing publication within the idempotency window using exact keys', async () => {
    const idempotencyKey = '77777777-7777-4777-8777-777777777777';
    const db = {
      publication: {
        findFirst: vi.fn().mockResolvedValue({ id: 'existing-pub', status: 'READY' }),
      },
      socialAccount: { findMany: vi.fn() },
      $transaction: vi.fn(),
    };

    const result = await createUnifiedPost(db as any, {
      workspaceId,
      requiresApproval: false,
      body: 'Replay me',
      targets: [{ socialAccountId: accountId, platform: 'LINKEDIN' }],
      idempotencyKey,
    });

    expect(result).toEqual({
      kind: 'idempotent_replay',
      publicationId: 'existing-pub',
      status: 'READY',
    });
    expect(db.publication.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        workspaceId,
        idempotencyKey: { in: [idempotencyKey, `${idempotencyKey}:${accountId}`] },
      }),
    });
    expect(JSON.stringify(db.publication.findFirst.mock.calls[0]![0])).not.toContain('startsWith');
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('does not treat a prefix of another idempotency key as a replay', async () => {
    const tx = createMockTx();
    const db = createMockDb(tx, [{ id: accountId, platform: 'LINKEDIN' }]);
    const prefix = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

    await createUnifiedPost(db as any, {
      workspaceId,
      createdByUserId: userId,
      requiresApproval: false,
      body: 'Not a prefix match',
      targets: [{ socialAccountId: accountId, platform: 'LINKEDIN' }],
      idempotencyKey: prefix,
    });

    const where = (db.publication.findFirst as ReturnType<typeof vi.fn>).mock.calls[0]![0].where;
    expect(where.idempotencyKey).toEqual({ in: [prefix, `${prefix}:${accountId}`] });
    expect(where.idempotencyKey.startsWith).toBeUndefined();
    expect(tx.content.create).toHaveBeenCalled();
  });

  it('rejects targets whose social accounts are not in the workspace', async () => {
    const db = {
      publication: { findFirst: vi.fn().mockResolvedValue(null) },
      socialAccount: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn(),
    };

    await expect(
      createUnifiedPost(db as any, {
        workspaceId,
        requiresApproval: false,
        body: 'Missing account',
        targets: [{ socialAccountId: accountId, platform: 'LINKEDIN' }],
        idempotencyKey: '88888888-8888-4888-8888-888888888888',
      })
    ).rejects.toBeInstanceOf(CreatePostError);

    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('rejects duplicate social-account targets before persistence', async () => {
    const tx = createMockTx();
    const db = createMockDb(tx, [{ id: accountId, platform: 'LINKEDIN' }]);

    await expect(
      createUnifiedPost(db as any, {
        workspaceId,
        requiresApproval: false,
        body: 'Duplicate target',
        targets: [
          { socialAccountId: accountId, platform: 'LINKEDIN' },
          { socialAccountId: accountId, platform: 'LINKEDIN' },
        ],
        idempotencyKey: '99999999-9999-4999-8999-999999999999',
      })
    ).rejects.toMatchObject({ code: 'DUPLICATE_SOCIAL_ACCOUNT' });

    expect(db.socialAccount.findMany).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a target whose requested platform differs from its stored account', async () => {
    const tx = createMockTx();
    const db = createMockDb(tx, [{ id: accountId, platform: 'X' }]);

    await expect(
      createUnifiedPost(db as any, {
        workspaceId,
        requiresApproval: false,
        body: 'Mismatched target',
        targets: [{ socialAccountId: accountId, platform: 'LINKEDIN' }],
        idempotencyKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      })
    ).rejects.toMatchObject({ code: 'SOCIAL_ACCOUNT_PLATFORM_MISMATCH' });

    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('creates a valid request targeting accounts on different platforms', async () => {
    const tx = createMockTx();
    const db = createMockDb(tx, [
      { id: accountId, platform: 'LINKEDIN' },
      { id: secondAccountId, platform: 'X' },
    ]);

    const result = await createUnifiedPost(db as any, {
      workspaceId,
      requiresApproval: false,
      body: 'Valid multi-platform post',
      targets: [
        { socialAccountId: accountId, platform: 'LINKEDIN' },
        { socialAccountId: secondAccountId, platform: 'X' },
      ],
      idempotencyKey: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    });

    expect(result.kind).toBe('created');
    if (result.kind === 'created') {
      expect(result.publications.map((publication) => publication.platform)).toEqual([
        'LINKEDIN',
        'X',
      ]);
    }
    expect(tx.publication.create).toHaveBeenCalledTimes(2);
  });

  it('rejects SSRF media URLs before persisting publications', async () => {
    const tx = createMockTx();
    const db = createMockDb(tx, [{ id: accountId, platform: 'LINKEDIN' }]);

    await expect(
      createUnifiedPost(db as any, {
        workspaceId,
        createdByUserId: userId,
        requiresApproval: false,
        body: 'Blocked media',
        targets: [{ socialAccountId: accountId, platform: 'LINKEDIN' }],
        mediaUrls: ['http://127.0.0.1/latest/meta-data'],
        idempotencyKey: '99999999-9999-4999-8999-999999999999',
      })
    ).rejects.toMatchObject({ code: 'UNSAFE_REMOTE_URL' });

    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('rejects unsafe platform option URLs', async () => {
    const tx = createMockTx();
    const db = createMockDb(tx, [{ id: accountId, platform: 'YOUTUBE' }]);

    await expect(
      createUnifiedPost(db as any, {
        workspaceId,
        createdByUserId: userId,
        requiresApproval: false,
        body: 'Blocked thumbnail',
        targets: [
          {
            socialAccountId: accountId,
            platform: 'YOUTUBE',
            platformOptions: {
              platform: 'YOUTUBE',
              options: { thumbnailUrl: 'file:///etc/passwd' },
            },
          },
        ],
        idempotencyKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      })
    ).rejects.toMatchObject({ code: 'UNSAFE_REMOTE_URL' });

    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

describe('PublishPayloadSchema target invariants', () => {
  it('rejects duplicate socialAccountId values', () => {
    const parsed = PublishPayloadSchema.safeParse({
      body: 'Duplicate schema target',
      targets: [
        { socialAccountId: accountId, platform: 'LINKEDIN' },
        { socialAccountId: accountId, platform: 'LINKEDIN' },
      ],
    });

    expect(parsed.success).toBe(false);
  });
});

describe('createPost response helpers', () => {
  it('never derives STAGED from created publications or an empty draft', () => {
    expect(deriveCreatePostStatus([])).toBe('DRAFT');
    expect(
      deriveCreatePostStatus([
        {
          publicationId: 'p1',
          platform: 'LINKEDIN',
          status: 'READY',
          outboxCommandId: 'o1',
        },
      ])
    ).toBe('READY');
    expect(
      deriveCreatePostStatus([
        {
          publicationId: 'p1',
          platform: 'LINKEDIN',
          status: 'REQUIRES_APPROVAL',
          outboxCommandId: null,
        },
      ])
    ).toBe('REQUIRES_APPROVAL');
    expect(createPostResponseMessage({ requiresApproval: true, isScheduled: false })).toBe(
      'Submitted for approval'
    );
    expect(createPostResponseMessage({ requiresApproval: false, isScheduled: true })).toBe(
      'Publication scheduled'
    );
  });
});
