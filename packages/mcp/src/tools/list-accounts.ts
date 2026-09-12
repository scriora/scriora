import { prisma } from 'scriora-core';
import { z } from 'zod';
import { authorizeWorkspaceScopedTool } from '../lib/mcp-auth.js';

export const ListSocialAccountsInputSchema = z.object({
  workspaceId: z.string().uuid(),
});

export type ListSocialAccountsInput = z.infer<typeof ListSocialAccountsInputSchema>;

export interface ListSocialAccountsAuthInput {
  apiKey?: string | undefined;
  signature?: string | undefined;
}

export type ListSocialAccountsResult =
  | {
      ok: true;
      workspaceId: string;
      accountsCount: number;
      accounts: Array<{
        id: string;
        platform: string;
        accountName: string;
        externalAccountId: string;
        status: string;
        capabilities: unknown;
        createdAt: Date;
      }>;
    }
  | {
      ok: false;
      error: { code: string; message: string };
    };

export const LIST_SOCIAL_ACCOUNTS_DESCRIPTION =
  'Lists connected social accounts in the API-key-bound workspace. ' +
  'Requires a workspace API key (SCRIORA_API_KEY) whose workspaceId matches; ' +
  'does not accept X-Workspace-Id as authentication.';

export async function executeListSocialAccounts(
  input: ListSocialAccountsInput,
  authInput: ListSocialAccountsAuthInput = {}
): Promise<ListSocialAccountsResult> {
  const auth = await authorizeWorkspaceScopedTool({
    workspaceId: input.workspaceId,
    toolName: 'scriora_list_social_accounts',
    apiKey: authInput.apiKey,
    signature: authInput.signature,
  });

  if (!auth.ok) {
    return { ok: false, error: auth.error };
  }

  const accounts = await prisma.socialAccount.findMany({
    where: { workspaceId: auth.workspaceId },
    select: {
      id: true,
      platform: true,
      accountName: true,
      externalAccountId: true,
      status: true,
      capabilities: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  return {
    ok: true,
    workspaceId: auth.workspaceId,
    accountsCount: accounts.length,
    accounts,
  };
}

export function formatListSocialAccountsResponse(result: ListSocialAccountsResult): {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
} {
  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    ...(result.ok ? {} : { isError: true }),
  };
}
