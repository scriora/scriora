import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from 'scriora-core';
import { executeListSocialAccounts } from '../../src/tools/list-accounts.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const rawKey = 'sk_live_list_accounts_1';

describe('scriora_list_social_accounts auth', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('refuses to list accounts for an unauthenticated workspaceId', async () => {
    const findMany = vi.spyOn(prisma.socialAccount, 'findMany');
    const result = await executeListSocialAccounts({ workspaceId }, { apiKey: undefined });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe('MCP_UNAUTHORIZED');
    expect(findMany).not.toHaveBeenCalled();
  });

  it('lists only after API key + membership bind the workspace', async () => {
    vi.spyOn(prisma.apiKey, 'findUnique').mockResolvedValue({
      id: 'key-1',
      workspaceId,
      userId: 'user-1',
      scopes: [],
      revokedAt: null,
      expiresAt: null,
    } as any);
    vi.spyOn(prisma.workspaceMember, 'findUnique').mockResolvedValue({
      workspaceRole: 'VIEWER',
    } as any);
    vi.spyOn(prisma.apiKey, 'update').mockResolvedValue({} as any);
    vi.spyOn(prisma.socialAccount, 'findMany').mockResolvedValue([
      {
        id: 'acc-1',
        platform: 'LINKEDIN',
        accountName: 'Page',
        externalAccountId: 'ext',
        status: 'CONNECTED',
        capabilities: {},
        createdAt: new Date('2026-01-01'),
      },
    ] as any);

    const result = await executeListSocialAccounts({ workspaceId }, { apiKey: rawKey });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.accountsCount).toBe(1);
    expect(prisma.socialAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId },
      })
    );
  });
});
