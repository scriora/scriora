import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from 'scriora-core';
import {
  authorizeWorkspaceScopedTool,
  canonicalizeMcpSignedPayload,
  computeMcpRequestSignature,
  hashWorkspaceApiKey,
} from '../../src/lib/mcp-auth.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const otherWorkspaceId = '22222222-2222-4222-8222-222222222222';
const userId = '33333333-3333-4333-8333-333333333333';
const rawKey = 'sk_live_testkey_mcp_auth_1';

function mockValidKey(overrides?: { workspaceId?: string; scopes?: string[] }) {
  vi.spyOn(prisma.apiKey, 'findFirst').mockResolvedValue({
    id: 'key-1',
    workspaceId: overrides?.workspaceId ?? workspaceId,
    userId,
    scopes: overrides?.scopes ?? ['posts:write'],
    revokedAt: null,
    expiresAt: null,
  } as any);
  vi.spyOn(prisma.workspaceMember, 'findUnique').mockResolvedValue({
    workspaceRole: 'OWNER',
  } as any);
  vi.spyOn(prisma.apiKey, 'update').mockResolvedValue({} as any);
}

describe('MCP workspace auth', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    delete process.env.SCRIORA_API_KEY;
    delete process.env.MCP_SIGNING_SECRET;
    delete process.env.MCP_REQUEST_SIGNATURE;
  });

  it('fingerprints API keys with HMAC-SHA256, not raw SHA-256', () => {
    const env = { API_KEY_PEPPER: 'mcp-test-pepper' };
    expect(hashWorkspaceApiKey(rawKey, env)).toBe(
      crypto.createHmac('sha256', 'mcp-test-pepper').update(rawKey).digest('hex')
    );
    expect(hashWorkspaceApiKey(rawKey, env)).not.toBe(
      crypto.createHash('sha256').update(rawKey).digest('hex')
    );
  });

  it('rejects workspace-scoped tools without an API key', async () => {
    const result = await authorizeWorkspaceScopedTool({
      workspaceId,
      toolName: 'scriora_create_post',
      env: {},
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe('MCP_UNAUTHORIZED');
    expect(result.error.message).toContain('X-Workspace-Id');
  });

  it('rejects a workspaceId that does not match the API key binding', async () => {
    mockValidKey({ workspaceId });
    const result = await authorizeWorkspaceScopedTool({
      workspaceId: otherWorkspaceId,
      toolName: 'scriora_create_post',
      apiKey: rawKey,
      env: {},
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe('MCP_WORKSPACE_MISMATCH');
  });

  it('rejects when the key user is not a workspace member', async () => {
    vi.spyOn(prisma.apiKey, 'findFirst').mockResolvedValue({
      id: 'key-1',
      workspaceId,
      userId,
      scopes: ['posts:write'],
      revokedAt: null,
      expiresAt: null,
    } as any);
    vi.spyOn(prisma.workspaceMember, 'findUnique').mockResolvedValue(null);

    const result = await authorizeWorkspaceScopedTool({
      workspaceId,
      toolName: 'scriora_list_social_accounts',
      apiKey: rawKey,
      env: {},
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe('MCP_NOT_A_MEMBER');
  });

  it('requires HMAC when MCP_SIGNING_SECRET is configured', async () => {
    mockValidKey();
    const result = await authorizeWorkspaceScopedTool({
      workspaceId,
      toolName: 'scriora_create_post',
      requiredScope: 'posts:write',
      requireWriteRole: true,
      apiKey: rawKey,
      env: { MCP_SIGNING_SECRET: 'super-secret' },
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe('MCP_HMAC_REQUIRED');
  });

  it('accepts a matching API key, membership, scope, and HMAC', async () => {
    mockValidKey();
    const secret = 'super-secret';
    const signature = computeMcpRequestSignature(
      secret,
      canonicalizeMcpSignedPayload({ toolName: 'scriora_create_post', workspaceId })
    );
    const result = await authorizeWorkspaceScopedTool({
      workspaceId,
      toolName: 'scriora_create_post',
      requiredScope: 'posts:write',
      requireWriteRole: true,
      apiKey: rawKey,
      signature,
      env: { MCP_SIGNING_SECRET: secret },
    });
    expect(result).toMatchObject({
      ok: true,
      workspaceId,
      userId,
      apiKeyId: 'key-1',
      role: 'OWNER',
    });
  });
});
