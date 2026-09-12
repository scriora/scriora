import type { FastifyReply, FastifyRequest } from 'fastify';
import type { WorkspaceRole } from 'scriora-core';
import { err } from './response.js';

/** Roles that may mutate workspace content (posts, connect, media, API keys). */
export const WORKSPACE_WRITE_ROLES: readonly WorkspaceRole[] = ['OWNER', 'ADMIN', 'EDITOR'];

/** Roles that may administer workspace settings and membership. */
export const WORKSPACE_ADMIN_ROLES: readonly WorkspaceRole[] = ['OWNER', 'ADMIN'];

/** Declared API key scopes already stored on `ApiKey.scopes`. */
export const API_KEY_SCOPE = {
  POSTS_WRITE: 'posts:write',
  ANALYTICS_READ: 'analytics:read',
} as const;

export function isWorkspaceWriteRole(role: WorkspaceRole | undefined): boolean {
  return role === 'OWNER' || role === 'ADMIN' || role === 'EDITOR';
}

export function isWorkspaceAdminRole(role: WorkspaceRole | undefined): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}

export function isReadOnlyWorkspaceRole(role: WorkspaceRole | undefined): boolean {
  return role === 'VIEWER' || role === 'EXTERNAL_APPROVER';
}

export function normalizeApiKeyScopes(scopes: unknown): string[] {
  if (!Array.isArray(scopes)) {
    return [];
  }
  return scopes.filter((scope): scope is string => typeof scope === 'string' && scope.length > 0);
}

export function apiKeyHasScope(scopes: unknown, required: string): boolean {
  return normalizeApiKeyScopes(scopes).includes(required);
}

/**
 * API keys are bound to a single workspace. A requested workspace that does not
 * match `apiKey.workspaceId` is a fail-closed mismatch (JWT callers have no binding).
 */
export function isApiKeyWorkspaceMismatch(
  apiKey: { workspaceId: string } | undefined,
  targetWorkspaceId: string
): boolean {
  return Boolean(apiKey && apiKey.workspaceId !== targetWorkspaceId);
}

export async function rejectApiKeyWorkspaceMismatch(
  request: FastifyRequest,
  reply: FastifyReply,
  targetWorkspaceId: string
): Promise<boolean> {
  if (!isApiKeyWorkspaceMismatch(request.apiKey, targetWorkspaceId)) {
    return false;
  }

  reply
    .status(403)
    .send(
      err(
        'API_KEY_WORKSPACE_MISMATCH',
        'AUTHORIZATION_ERROR',
        'API key is not authorized for this workspace',
        request.id
      )
    );
  return true;
}

export async function requireWorkspaceWrite(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (reply.sent) {
    return;
  }

  if (isWorkspaceWriteRole(request.workspace?.role)) {
    return;
  }

  reply
    .status(403)
    .send(
      err(
        'FORBIDDEN',
        'AUTHORIZATION_ERROR',
        'This action requires a write-capable workspace role',
        request.id
      )
    );
}

export async function requireWorkspaceAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (reply.sent) {
    return;
  }

  if (isWorkspaceAdminRole(request.workspace?.role)) {
    return;
  }

  reply
    .status(403)
    .send(
      err(
        'FORBIDDEN',
        'AUTHORIZATION_ERROR',
        'This action requires an OWNER or ADMIN workspace role',
        request.id
      )
    );
}

export type MemberRemovalDenial = {
  allowed: false;
  status: 403;
  code: string;
  category: 'AUTHORIZATION_ERROR' | 'BUSINESS_RULE_VIOLATION';
  message: string;
};

export type MemberRemovalDecision = { allowed: true } | MemberRemovalDenial;

/**
 * OWNER-only may remove another OWNER. The last OWNER membership and the
 * workspace.ownerUserId row cannot be removed via invite/member APIs.
 */
export function evaluateMemberRemoval(params: {
  callerRole: WorkspaceRole;
  targetRole: WorkspaceRole;
  targetUserId: string;
  workspaceOwnerUserId: string;
  ownerCount: number;
}): MemberRemovalDecision {
  const targetIsOwner =
    params.targetRole === 'OWNER' || params.workspaceOwnerUserId === params.targetUserId;

  if (!targetIsOwner) {
    return { allowed: true };
  }

  if (params.callerRole !== 'OWNER') {
    return {
      allowed: false,
      status: 403,
      code: 'CANNOT_MANAGE_OWNER',
      category: 'AUTHORIZATION_ERROR',
      message: 'Only an OWNER can remove another OWNER',
    };
  }

  if (params.targetRole === 'OWNER' && params.ownerCount <= 1) {
    return {
      allowed: false,
      status: 403,
      code: 'LAST_OWNER',
      category: 'BUSINESS_RULE_VIOLATION',
      message: 'Cannot remove the last OWNER from a workspace',
    };
  }

  if (params.workspaceOwnerUserId === params.targetUserId) {
    return {
      allowed: false,
      status: 403,
      code: 'CANNOT_REMOVE_WORKSPACE_OWNER',
      category: 'BUSINESS_RULE_VIOLATION',
      message: 'Cannot remove the workspace owner without an ownership transfer',
    };
  }

  return { allowed: true };
}

export function requireApiKeyScope(requiredScope: string) {
  return async function requireApiKeyScopeHandler(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    if (reply.sent) {
      return;
    }

    // JWT sessions are authorized by workspace role, not key scopes.
    if (!request.apiKey) {
      return;
    }

    if (apiKeyHasScope(request.apiKey.scopes, requiredScope)) {
      return;
    }

    reply
      .status(403)
      .send(
        err(
          'INSUFFICIENT_SCOPE',
          'AUTHORIZATION_ERROR',
          `API key is missing required scope: ${requiredScope}`,
          request.id
        )
      );
  };
}
