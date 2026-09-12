import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from 'scriora-core';
import { z } from 'zod';
import { err } from './response.js';

export const ConnectWorkspaceIdSchema = z.string().uuid();

export function resolveConnectWorkspaceId(request: FastifyRequest): string | undefined {
  const query = request.query as { workspaceId?: string } | undefined;
  const header = request.headers['x-workspace-id'];
  const queryId =
    typeof query?.workspaceId === 'string' && query.workspaceId.length > 0
      ? query.workspaceId
      : undefined;
  const headerId = typeof header === 'string' && header.length > 0 ? header : undefined;
  return queryId ?? headerId ?? request.apiKey?.workspaceId;
}

export async function findWorkspaceMembership(userId: string, workspaceId: string) {
  return prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId,
      },
    },
    include: {
      workspace: true,
    },
  });
}

export function attachWorkspaceFromMembership(
  request: FastifyRequest,
  member: NonNullable<Awaited<ReturnType<typeof findWorkspaceMembership>>>
): void {
  request.workspace = {
    id: member.workspace.id,
    name: member.workspace.name,
    role: member.workspaceRole,
    requiresApproval: member.workspace.requiresApproval,
    settings: member.workspace.settings,
  };
}

/**
 * Auth-gated workspace membership for connect initiate / special-connect routes.
 * Accepts workspaceId from query (OAuth redirect UX), X-Workspace-Id, or API key binding.
 */
export async function verifyConnectWorkspace(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (reply.sent) {
    return;
  }

  const userId = request.authContext?.userId;
  if (!userId) {
    reply
      .status(401)
      .send(
        err(
          'UNAUTHORIZED',
          'AUTHENTICATION_ERROR',
          'Authentication required prior to workspace resolution',
          request.id
        )
      );
    return;
  }

  const targetWorkspaceId = resolveConnectWorkspaceId(request);
  if (!targetWorkspaceId) {
    reply
      .status(400)
      .send(
        err(
          'MISSING_WORKSPACE_ID',
          'VALIDATION_ERROR',
          'workspaceId query parameter or X-Workspace-Id header is required',
          request.id
        )
      );
    return;
  }

  if (!ConnectWorkspaceIdSchema.safeParse(targetWorkspaceId).success) {
    reply
      .status(400)
      .send(
        err(
          'VALIDATION_ERROR',
          'VALIDATION_ERROR',
          'Invalid workspace ID: must be a valid UUID',
          request.id
        )
      );
    return;
  }

  const member = await findWorkspaceMembership(userId, targetWorkspaceId);
  if (!member) {
    reply
      .status(403)
      .send(
        err(
          'FORBIDDEN_WORKSPACE',
          'AUTHORIZATION_ERROR',
          'You do not have access to this workspace',
          request.id
        )
      );
    return;
  }

  attachWorkspaceFromMembership(request, member);
}
