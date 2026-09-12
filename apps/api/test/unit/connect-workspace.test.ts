import { prisma } from 'scriora-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resolveConnectWorkspaceId,
  verifyConnectWorkspace,
} from '../../src/lib/connect-workspace.js';

describe('connect workspace membership helpers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves workspaceId from query, then header, then API key', () => {
    expect(
      resolveConnectWorkspaceId({
        query: { workspaceId: '11111111-1111-4111-8111-111111111111' },
        headers: { 'x-workspace-id': '22222222-2222-4222-8222-222222222222' },
        apiKey: { workspaceId: '33333333-3333-4333-8333-333333333333' },
      } as never)
    ).toBe('11111111-1111-4111-8111-111111111111');

    expect(
      resolveConnectWorkspaceId({
        query: {},
        headers: { 'x-workspace-id': '22222222-2222-4222-8222-222222222222' },
        apiKey: { workspaceId: '33333333-3333-4333-8333-333333333333' },
      } as never)
    ).toBe('22222222-2222-4222-8222-222222222222');

    expect(
      resolveConnectWorkspaceId({
        query: {},
        headers: {},
        apiKey: { workspaceId: '33333333-3333-4333-8333-333333333333' },
      } as never)
    ).toBe('33333333-3333-4333-8333-333333333333');
  });

  it('verifyConnectWorkspace fails closed without auth or membership', async () => {
    const reply = {
      sent: false,
      status: vi.fn().mockReturnThis(),
      send: vi.fn(),
    };

    await verifyConnectWorkspace(
      {
        authContext: undefined,
        query: { workspaceId: '11111111-1111-4111-8111-111111111111' },
        headers: {},
        id: 'req_test',
      } as never,
      reply as never
    );
    expect(reply.status).toHaveBeenCalledWith(401);

    vi.spyOn(prisma.workspaceMember, 'findUnique').mockResolvedValue(null);
    const forbiddenReply = {
      sent: false,
      status: vi.fn().mockReturnThis(),
      send: vi.fn(),
    };
    await verifyConnectWorkspace(
      {
        authContext: { userId: 'user-123' },
        query: { workspaceId: '11111111-1111-4111-8111-111111111111' },
        headers: {},
        id: 'req_test',
      } as never,
      forbiddenReply as never
    );
    expect(forbiddenReply.status).toHaveBeenCalledWith(403);
  });
});
