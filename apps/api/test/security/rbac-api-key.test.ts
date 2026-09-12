import crypto from 'node:crypto';
import { prisma } from 'scriora-core';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/app.js';

const workspaceA = '11111111-1111-4111-8111-111111111111';
const workspaceB = '22222222-2222-4222-8222-222222222222';
const userId = '33333333-3333-4333-8333-333333333333';
const ownerUserId = '44444444-4444-4444-8444-444444444444';
const targetUserId = '55555555-5555-4555-8555-555555555555';

function workspaceRecord(id: string, owner = ownerUserId) {
  return {
    id,
    name: 'Test Workspace',
    slug: 'test-ws',
    purpose: 'WORK',
    defaultOperatingMode: 'MANUAL',
    ownerUserId: owner,
    country: null,
    timezone: 'UTC',
    requiresApproval: false,
    settings: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function memberRecord(
  workspaceId: string,
  memberUserId: string,
  workspaceRole: 'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER' | 'EXTERNAL_APPROVER'
) {
  return {
    workspaceId,
    userId: memberUserId,
    workspaceRole,
    joinedAt: new Date(),
    workspace: workspaceRecord(workspaceId),
  };
}

describe('Security — RBAC, API key binding, OWNER protection', () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function jwtHeaders(
    roleWorkspaceId = workspaceA,
    sub = userId
  ): { authorization: string; 'x-workspace-id': string } {
    return {
      authorization: `Bearer ${app.jwt.sign({ sub })}`,
      'x-workspace-id': roleWorkspaceId,
    };
  }

  function mockMembership(
    role: 'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER' | 'EXTERNAL_APPROVER',
    workspaceId = workspaceA,
    memberUserId = userId
  ) {
    return vi
      .spyOn(prisma.workspaceMember, 'findUnique')
      .mockResolvedValue(memberRecord(workspaceId, memberUserId, role) as never);
  }

  function mockApiKey(options: {
    workspaceId: string;
    scopes: string[];
    rawKey?: string;
    userId?: string;
  }) {
    const rawKey = options.rawKey ?? 'sk_live_rbac_test_key';
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    vi.spyOn(prisma.apiKey, 'findFirst').mockResolvedValue({
      id: '66666666-6666-4666-8666-666666666666',
      workspaceId: options.workspaceId,
      userId: options.userId ?? userId,
      name: 'test-key',
      keyHash,
      keyPrefix: rawKey.slice(0, 12),
      scopes: options.scopes,
      revokedAt: null,
      expiresAt: null,
      lastUsedAt: null,
      createdAt: new Date(),
      user: { email: 'owner@example.com' },
    } as never);
    vi.spyOn(prisma.apiKey, 'update').mockResolvedValue({} as never);
    return rawKey;
  }

  it('denies VIEWER from creating posts', async () => {
    mockMembership('VIEWER');

    const res = await app.inject({
      method: 'POST',
      url: '/v1/posts',
      headers: jwtHeaders(),
      payload: {
        body: 'Viewer should not publish',
        targets: [
          {
            socialAccountId: '77777777-7777-4777-8777-777777777777',
            platform: 'LINKEDIN',
          },
        ],
      },
    });

    expect(res.statusCode).toBe(403);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('FORBIDDEN');
    expect(json.error.category).toBe('AUTHORIZATION_ERROR');
  });

  it('denies EXTERNAL_APPROVER from creating posts and publications', async () => {
    mockMembership('EXTERNAL_APPROVER');

    const postRes = await app.inject({
      method: 'POST',
      url: '/v1/posts',
      headers: jwtHeaders(),
      payload: {
        body: 'Approver should not publish',
        targets: [
          {
            socialAccountId: '77777777-7777-4777-8777-777777777777',
            platform: 'LINKEDIN',
          },
        ],
      },
    });
    expect(postRes.statusCode).toBe(403);
    expect(JSON.parse(postRes.body).error.code).toBe('FORBIDDEN');

    const pubRes = await app.inject({
      method: 'POST',
      url: '/api/v1/publications',
      headers: jwtHeaders(),
      payload: {
        workspaceId: workspaceA,
        contentVariantId: '88888888-8888-4888-8888-888888888888',
        socialAccountId: '77777777-7777-4777-8777-777777777777',
      },
    });
    expect(pubRes.statusCode).toBe(403);
    expect(JSON.parse(pubRes.body).error.code).toBe('FORBIDDEN');
  });

  it('denies VIEWER from minting API keys and connecting accounts', async () => {
    mockMembership('VIEWER');
    const createKeySpy = vi.spyOn(prisma.apiKey, 'create');

    const keyRes = await app.inject({
      method: 'POST',
      url: `/v1/workspaces/${workspaceA}/api-keys`,
      headers: jwtHeaders(),
      payload: { name: 'viewer-key' },
    });
    expect(keyRes.statusCode).toBe(403);
    expect(JSON.parse(keyRes.body).error.code).toBe('FORBIDDEN');
    expect(createKeySpy).not.toHaveBeenCalled();

    const connectRes = await app.inject({
      method: 'GET',
      url: `/v1/connect/linkedin?workspaceId=${workspaceA}`,
      headers: jwtHeaders(),
    });
    expect(connectRes.statusCode).toBe(403);
    expect(JSON.parse(connectRes.body).error.code).toBe('FORBIDDEN');
  });

  it('allows VIEWER to read posts', async () => {
    mockMembership('VIEWER');
    vi.spyOn(prisma.publication, 'findMany').mockResolvedValue([]);

    const res = await app.inject({
      method: 'GET',
      url: '/v1/posts',
      headers: jwtHeaders(),
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(true);
    expect(json.data).toEqual([]);
  });

  it('rejects API keys used against a different workspace than apiKey.workspaceId', async () => {
    const rawKey = mockApiKey({
      workspaceId: workspaceA,
      scopes: ['posts:write', 'analytics:read'],
    });
    mockMembership('OWNER', workspaceB);

    const res = await app.inject({
      method: 'POST',
      url: '/v1/posts',
      headers: {
        'x-api-key': rawKey,
        'x-workspace-id': workspaceB,
      },
      payload: {
        body: 'Cross-workspace key must fail closed',
        targets: [
          {
            socialAccountId: '77777777-7777-4777-8777-777777777777',
            platform: 'LINKEDIN',
          },
        ],
      },
    });

    expect(res.statusCode).toBe(403);
    const json = JSON.parse(res.body);
    expect(json.error.code).toBe('API_KEY_WORKSPACE_MISMATCH');
  });

  it('rejects API keys missing posts:write on publish routes', async () => {
    const rawKey = mockApiKey({
      workspaceId: workspaceA,
      scopes: ['analytics:read'],
    });
    mockMembership('OWNER', workspaceA);

    const res = await app.inject({
      method: 'POST',
      url: '/v1/posts',
      headers: {
        'x-api-key': rawKey,
        'x-workspace-id': workspaceA,
      },
      payload: {
        body: 'Key without posts:write',
        targets: [
          {
            socialAccountId: '77777777-7777-4777-8777-777777777777',
            platform: 'LINKEDIN',
          },
        ],
      },
    });

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error.code).toBe('INSUFFICIENT_SCOPE');
  });

  it('allows a bound API key with posts:write to pass RBAC on the key workspace', async () => {
    const rawKey = mockApiKey({
      workspaceId: workspaceA,
      scopes: ['posts:write'],
    });
    mockMembership('EDITOR', workspaceA);

    const res = await app.inject({
      method: 'POST',
      url: '/v1/posts',
      headers: {
        'x-api-key': rawKey,
        'x-workspace-id': workspaceA,
      },
      payload: {
        body: '',
        targets: [],
      },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('VALIDATION_ERROR');
  });

  it('prevents ADMIN from removing an OWNER', async () => {
    vi.spyOn(prisma.workspaceMember, 'findUnique')
      .mockResolvedValueOnce(memberRecord(workspaceA, userId, 'ADMIN') as never)
      .mockResolvedValueOnce(memberRecord(workspaceA, targetUserId, 'OWNER') as never);
    vi.spyOn(prisma.workspaceMember, 'count').mockResolvedValue(2);
    const deleteSpy = vi
      .spyOn(prisma.workspaceMember, 'deleteMany')
      .mockResolvedValue({ count: 0 } as never);

    const res = await app.inject({
      method: 'DELETE',
      url: `/v1/workspaces/${workspaceA}/members/${targetUserId}`,
      headers: jwtHeaders(),
    });

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error.code).toBe('CANNOT_MANAGE_OWNER');
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('prevents removing the last OWNER', async () => {
    vi.spyOn(prisma.workspaceMember, 'findUnique')
      .mockResolvedValueOnce(memberRecord(workspaceA, userId, 'OWNER') as never)
      .mockResolvedValueOnce({
        ...memberRecord(workspaceA, targetUserId, 'OWNER'),
        workspace: workspaceRecord(workspaceA, targetUserId),
      } as never);
    vi.spyOn(prisma.workspaceMember, 'count').mockResolvedValue(1);
    const deleteSpy = vi
      .spyOn(prisma.workspaceMember, 'deleteMany')
      .mockResolvedValue({ count: 0 } as never);

    const res = await app.inject({
      method: 'DELETE',
      url: `/v1/workspaces/${workspaceA}/members/${targetUserId}`,
      headers: jwtHeaders(),
    });

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error.code).toBe('LAST_OWNER');
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('rejects invite upserts that would silently change an existing member role', async () => {
    vi.spyOn(prisma.workspaceMember, 'findUnique')
      .mockResolvedValueOnce(memberRecord(workspaceA, userId, 'ADMIN') as never)
      .mockResolvedValueOnce(memberRecord(workspaceA, targetUserId, 'OWNER') as never);
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
      id: targetUserId,
      email: 'owner@example.com',
      name: 'Owner',
    } as never);
    const createSpy = vi.spyOn(prisma.workspaceMember, 'create');
    const upsertSpy = vi.spyOn(prisma.workspaceMember, 'upsert');

    const res = await app.inject({
      method: 'POST',
      url: `/v1/workspaces/${workspaceA}/members`,
      headers: jwtHeaders(),
      payload: {
        email: 'owner@example.com',
        role: 'EDITOR',
      },
    });

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error.code).toBe('MEMBER_ALREADY_EXISTS');
    expect(createSpy).not.toHaveBeenCalled();
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it('allows ADMIN to remove an EDITOR', async () => {
    vi.spyOn(prisma.workspaceMember, 'findUnique')
      .mockResolvedValueOnce(memberRecord(workspaceA, userId, 'ADMIN') as never)
      .mockResolvedValueOnce(memberRecord(workspaceA, targetUserId, 'EDITOR') as never);
    vi.spyOn(prisma.workspaceMember, 'count').mockResolvedValue(1);
    const deleteSpy = vi
      .spyOn(prisma.workspaceMember, 'deleteMany')
      .mockResolvedValue({ count: 1 } as never);

    const res = await app.inject({
      method: 'DELETE',
      url: `/v1/workspaces/${workspaceA}/members/${targetUserId}`,
      headers: jwtHeaders(),
    });

    expect(res.statusCode).toBe(204);
    expect(deleteSpy).toHaveBeenCalledWith({
      where: {
        workspaceId: workspaceA,
        userId: targetUserId,
      },
    });
  });
});
