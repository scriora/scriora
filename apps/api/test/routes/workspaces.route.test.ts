import { prisma } from 'scriora-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/app.js';

describe('API Routes — Workspaces', () => {
  const app = buildApp();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('GET /v1/workspaces returns 401 when unauthenticated', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/workspaces',
    });

    expect(res.statusCode).toBe(401);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(false);
  });

  it('GET /v1/workspaces returns user workspaces when authenticated', async () => {
    const token = app.jwt.sign({ sub: 'user-123' });

    vi.spyOn(prisma.workspaceMember, 'findMany').mockResolvedValue([
      {
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
      } as any,
    ]);

    const res = await app.inject({
      method: 'GET',
      url: '/v1/workspaces',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.data.length).toBe(1);
    expect(json.data[0].id).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('GET /v1/workspaces/:wsId returns 400 when wsId is not a valid UUID', async () => {
    const token = app.jwt.sign({ sub: 'user-123' });

    const res = await app.inject({
      method: 'GET',
      url: '/v1/workspaces/not-a-valid-uuid',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('DELETE /v1/workspaces/:wsId blocks when publications still exist', async () => {
    const token = app.jwt.sign({ sub: 'user-123' });
    const wsId = '11111111-1111-4111-8111-111111111111';

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
    vi.spyOn(prisma.publication, 'count').mockResolvedValue(3);
    const deleteSpy = vi.spyOn(prisma.workspace, 'delete');

    const res = await app.inject({
      method: 'DELETE',
      url: `/v1/workspaces/${wsId}`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(409);
    const json = JSON.parse(res.body);
    expect(json.error.code).toBe('WORKSPACE_HAS_PUBLICATIONS');
    expect(deleteSpy).not.toHaveBeenCalled();
  });
});
