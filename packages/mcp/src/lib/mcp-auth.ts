/**
 * Workspace-scoped MCP auth.
 *
 * Aligns with HTTP API keys: HMAC-SHA256 peppered fingerprint (plus legacy
 * SHA-256 dual-verify) on `ApiKey`, workspace binding, and membership.
 * Optional request HMAC (MCP_SIGNING_SECRET) when configured.
 * A caller-supplied workspaceId that does not match the key is rejected.
 */

import crypto from 'node:crypto';
import {
  apiKeyFingerprintCandidates,
  hashApiKey,
  isLegacyApiKeyFingerprint,
  prisma,
} from 'scriora-core';

export const MCP_WRITE_ROLES = ['OWNER', 'ADMIN', 'EDITOR'] as const;
export type McpWriteRole = (typeof MCP_WRITE_ROLES)[number];

export function hashWorkspaceApiKey(rawKey: string, env: NodeJS.ProcessEnv = process.env): string {
  return hashApiKey(rawKey, env);
}

export function canonicalizeMcpSignedPayload(input: {
  toolName: string;
  workspaceId: string;
}): string {
  return `${input.toolName}:${input.workspaceId}`;
}

export function computeMcpRequestSignature(secret: string, payload: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

export function mcpSignaturesMatch(expectedHex: string, provided: string): boolean {
  try {
    const expected = Buffer.from(expectedHex, 'hex');
    const actual = Buffer.from(provided.trim(), 'hex');
    return (
      expected.length > 0 &&
      expected.length === actual.length &&
      crypto.timingSafeEqual(expected, actual)
    );
  } catch {
    return false;
  }
}

export type McpAuthSuccess = {
  ok: true;
  workspaceId: string;
  userId: string;
  apiKeyId: string;
  role: string;
  scopes: string[];
};

export type McpAuthFailure = {
  ok: false;
  error: { code: string; message: string };
};

export type AuthorizeWorkspaceScopedToolInput = {
  workspaceId: string;
  toolName: string;
  requiredScope?: string | undefined;
  requireWriteRole?: boolean | undefined;
  apiKey?: string | undefined;
  signature?: string | undefined;
  env?: NodeJS.ProcessEnv;
};

function normalizeScopes(scopes: unknown): string[] {
  if (!Array.isArray(scopes)) {
    return [];
  }
  return scopes.filter((scope): scope is string => typeof scope === 'string' && scope.length > 0);
}

function resolveRawApiKey(input: AuthorizeWorkspaceScopedToolInput): string | undefined {
  const env = input.env ?? process.env;
  const candidate = input.apiKey ?? env.SCRIORA_API_KEY ?? env.MCP_API_KEY;
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : undefined;
}

export async function authorizeWorkspaceScopedTool(
  input: AuthorizeWorkspaceScopedToolInput
): Promise<McpAuthSuccess | McpAuthFailure> {
  const env = input.env ?? process.env;
  const rawKey = resolveRawApiKey(input);

  if (!rawKey?.startsWith('sk_')) {
    return {
      ok: false,
      error: {
        code: 'MCP_UNAUTHORIZED',
        message:
          'Workspace-scoped MCP tools require a workspace API key (SCRIORA_API_KEY / MCP_API_KEY). X-Workspace-Id alone is not authentication.',
      },
    };
  }

  const keyRecord = await prisma.apiKey.findFirst({
    where: { keyHash: { in: apiKeyFingerprintCandidates(rawKey, env) } },
    select: {
      id: true,
      workspaceId: true,
      userId: true,
      scopes: true,
      revokedAt: true,
      expiresAt: true,
      keyHash: true,
    },
  });

  if (!keyRecord || keyRecord.revokedAt) {
    return {
      ok: false,
      error: { code: 'MCP_INVALID_API_KEY', message: 'API key is invalid or revoked' },
    };
  }

  if (keyRecord.expiresAt && keyRecord.expiresAt < new Date()) {
    return {
      ok: false,
      error: { code: 'MCP_EXPIRED_API_KEY', message: 'API key has expired' },
    };
  }

  if (keyRecord.workspaceId !== input.workspaceId) {
    return {
      ok: false,
      error: {
        code: 'MCP_WORKSPACE_MISMATCH',
        message: 'API key is not authorized for this workspaceId',
      },
    };
  }

  const member = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: input.workspaceId,
        userId: keyRecord.userId,
      },
    },
    select: { workspaceRole: true },
  });

  if (!member) {
    return {
      ok: false,
      error: {
        code: 'MCP_NOT_A_MEMBER',
        message: 'API key user is not a member of the target workspace',
      },
    };
  }

  const signingSecret = env.MCP_SIGNING_SECRET?.trim();
  if (signingSecret) {
    const signature = input.signature ?? env.MCP_REQUEST_SIGNATURE;
    if (typeof signature !== 'string' || !signature.trim()) {
      return {
        ok: false,
        error: {
          code: 'MCP_HMAC_REQUIRED',
          message:
            'MCP_SIGNING_SECRET is set; provide MCP_REQUEST_SIGNATURE (HMAC-SHA256 of toolName:workspaceId)',
        },
      };
    }
    const expected = computeMcpRequestSignature(
      signingSecret,
      canonicalizeMcpSignedPayload({ toolName: input.toolName, workspaceId: input.workspaceId })
    );
    if (!mcpSignaturesMatch(expected, signature)) {
      return {
        ok: false,
        error: { code: 'MCP_HMAC_INVALID', message: 'MCP request signature is invalid' },
      };
    }
  }

  const scopes = normalizeScopes(keyRecord.scopes);
  if (input.requiredScope && !scopes.includes(input.requiredScope)) {
    return {
      ok: false,
      error: {
        code: 'MCP_INSUFFICIENT_SCOPE',
        message: `API key is missing required scope: ${input.requiredScope}`,
      },
    };
  }

  if (input.requireWriteRole && !MCP_WRITE_ROLES.includes(member.workspaceRole as McpWriteRole)) {
    return {
      ok: false,
      error: {
        code: 'MCP_FORBIDDEN',
        message: 'This action requires a write-capable workspace role',
      },
    };
  }

  prisma.apiKey
    .update({
      where: { id: keyRecord.id },
      data: {
        lastUsedAt: new Date(),
        ...(isLegacyApiKeyFingerprint(keyRecord.keyHash, rawKey, env)
          ? { keyHash: hashApiKey(rawKey, env) }
          : {}),
      },
    })
    .catch(() => {});

  return {
    ok: true,
    workspaceId: keyRecord.workspaceId,
    userId: keyRecord.userId,
    apiKeyId: keyRecord.id,
    role: member.workspaceRole,
    scopes,
  };
}
