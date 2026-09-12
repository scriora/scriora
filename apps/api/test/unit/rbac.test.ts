import { describe, expect, it, vi } from 'vitest';
import {
  API_KEY_SCOPE,
  apiKeyHasScope,
  evaluateMemberRemoval,
  isApiKeyWorkspaceMismatch,
  isReadOnlyWorkspaceRole,
  isWorkspaceAdminRole,
  isWorkspaceWriteRole,
  normalizeApiKeyScopes,
  requireApiKeyScope,
  requireWorkspaceAdmin,
  requireWorkspaceWrite,
} from '../../src/lib/rbac.js';

describe('RBAC helpers', () => {
  it('treats VIEWER and EXTERNAL_APPROVER as read-only', () => {
    expect(isWorkspaceWriteRole('VIEWER')).toBe(false);
    expect(isWorkspaceWriteRole('EXTERNAL_APPROVER')).toBe(false);
    expect(isReadOnlyWorkspaceRole('VIEWER')).toBe(true);
    expect(isReadOnlyWorkspaceRole('EXTERNAL_APPROVER')).toBe(true);
    expect(isWorkspaceWriteRole('EDITOR')).toBe(true);
    expect(isWorkspaceWriteRole('ADMIN')).toBe(true);
    expect(isWorkspaceWriteRole('OWNER')).toBe(true);
    expect(isWorkspaceAdminRole('EDITOR')).toBe(false);
    expect(isWorkspaceAdminRole('ADMIN')).toBe(true);
  });

  it('normalizes API key scopes and enforces declared values fail-closed', () => {
    expect(normalizeApiKeyScopes(undefined)).toEqual([]);
    expect(normalizeApiKeyScopes({ not: 'an-array' })).toEqual([]);
    expect(normalizeApiKeyScopes(['posts:write', 1, '', 'analytics:read'])).toEqual([
      'posts:write',
      'analytics:read',
    ]);
    expect(apiKeyHasScope(['analytics:read'], API_KEY_SCOPE.POSTS_WRITE)).toBe(false);
    expect(apiKeyHasScope(['posts:write'], API_KEY_SCOPE.POSTS_WRITE)).toBe(true);
  });

  it('binds API keys to their workspace id', () => {
    const workspaceA = '11111111-1111-4111-8111-111111111111';
    const workspaceB = '22222222-2222-4222-8222-222222222222';
    expect(isApiKeyWorkspaceMismatch(undefined, workspaceB)).toBe(false);
    expect(isApiKeyWorkspaceMismatch({ workspaceId: workspaceA }, workspaceA)).toBe(false);
    expect(isApiKeyWorkspaceMismatch({ workspaceId: workspaceA }, workspaceB)).toBe(true);
  });

  it('protects OWNER removal and the last OWNER', () => {
    const ownerUserId = 'owner-1';
    const otherOwnerId = 'owner-2';

    expect(
      evaluateMemberRemoval({
        callerRole: 'ADMIN',
        targetRole: 'OWNER',
        targetUserId: otherOwnerId,
        workspaceOwnerUserId: ownerUserId,
        ownerCount: 2,
      }).allowed
    ).toBe(false);

    expect(
      evaluateMemberRemoval({
        callerRole: 'ADMIN',
        targetRole: 'OWNER',
        targetUserId: otherOwnerId,
        workspaceOwnerUserId: ownerUserId,
        ownerCount: 2,
      })
    ).toMatchObject({ code: 'CANNOT_MANAGE_OWNER' });

    expect(
      evaluateMemberRemoval({
        callerRole: 'OWNER',
        targetRole: 'OWNER',
        targetUserId: ownerUserId,
        workspaceOwnerUserId: ownerUserId,
        ownerCount: 1,
      })
    ).toMatchObject({ code: 'LAST_OWNER' });

    expect(
      evaluateMemberRemoval({
        callerRole: 'OWNER',
        targetRole: 'OWNER',
        targetUserId: ownerUserId,
        workspaceOwnerUserId: ownerUserId,
        ownerCount: 2,
      })
    ).toMatchObject({ code: 'CANNOT_REMOVE_WORKSPACE_OWNER' });

    expect(
      evaluateMemberRemoval({
        callerRole: 'OWNER',
        targetRole: 'OWNER',
        targetUserId: otherOwnerId,
        workspaceOwnerUserId: ownerUserId,
        ownerCount: 2,
      })
    ).toEqual({ allowed: true });

    expect(
      evaluateMemberRemoval({
        callerRole: 'ADMIN',
        targetRole: 'EDITOR',
        targetUserId: 'editor-1',
        workspaceOwnerUserId: ownerUserId,
        ownerCount: 1,
      })
    ).toEqual({ allowed: true });
  });

  it('requireWorkspaceWrite and requireWorkspaceAdmin fail closed for read-only roles', async () => {
    const reply = {
      sent: false,
      status: vi.fn().mockReturnThis(),
      send: vi.fn(),
    };

    await requireWorkspaceWrite(
      { workspace: { role: 'VIEWER' }, id: 'req_viewer' } as never,
      reply as never
    );
    expect(reply.status).toHaveBeenCalledWith(403);

    const approverReply = {
      sent: false,
      status: vi.fn().mockReturnThis(),
      send: vi.fn(),
    };
    await requireWorkspaceWrite(
      { workspace: { role: 'EXTERNAL_APPROVER' }, id: 'req_approver' } as never,
      approverReply as never
    );
    expect(approverReply.status).toHaveBeenCalledWith(403);

    const editorReply = {
      sent: false,
      status: vi.fn().mockReturnThis(),
      send: vi.fn(),
    };
    await requireWorkspaceWrite(
      { workspace: { role: 'EDITOR' }, id: 'req_editor' } as never,
      editorReply as never
    );
    expect(editorReply.status).not.toHaveBeenCalled();

    const adminReply = {
      sent: false,
      status: vi.fn().mockReturnThis(),
      send: vi.fn(),
    };
    await requireWorkspaceAdmin(
      { workspace: { role: 'EDITOR' }, id: 'req_editor_admin' } as never,
      adminReply as never
    );
    expect(adminReply.status).toHaveBeenCalledWith(403);
  });

  it('requireApiKeyScope skips JWT callers and denies keys without the scope', async () => {
    const handler = requireApiKeyScope(API_KEY_SCOPE.POSTS_WRITE);
    const jwtReply = {
      sent: false,
      status: vi.fn().mockReturnThis(),
      send: vi.fn(),
    };
    await handler({ apiKey: undefined, id: 'req_jwt' } as never, jwtReply as never);
    expect(jwtReply.status).not.toHaveBeenCalled();

    const denied = {
      sent: false,
      status: vi.fn().mockReturnThis(),
      send: vi.fn(),
    };
    await handler(
      {
        apiKey: { id: 'key-1', workspaceId: 'ws', scopes: ['analytics:read'] },
        id: 'req_key',
      } as never,
      denied as never
    );
    expect(denied.status).toHaveBeenCalledWith(403);
    expect(denied.send).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'INSUFFICIENT_SCOPE' }),
      })
    );
  });
});
