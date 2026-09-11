import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma, type WorkspaceRole } from 'scriora-core';
import { err } from '../lib/response.js';

declare module 'fastify' {
  interface FastifyRequest {
    workspace?: {
      id: string;
      name: string;
      role: WorkspaceRole;
      requiresApproval: boolean;
      settings: unknown;
    };
  }
}

export async function verifyWorkspace(request: FastifyRequest, reply: FastifyReply): Promise<void> {
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

  const params = request.params as Record<string, string> | undefined;
  const targetWorkspaceId =
    params?.workspaceId ||
    params?.wsId ||
    (request.headers['x-workspace-id'] as string | undefined) ||
    request.apiKey?.workspaceId;

  if (!targetWorkspaceId) {
    reply
      .status(400)
      .send(
        err(
          'MISSING_WORKSPACE_ID',
          'VALIDATION_ERROR',
          'Target workspace ID is required in URL parameter or X-Workspace-Id header',
          request.id
        )
      );
    return;
  }

  const member = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: targetWorkspaceId,
        userId,
      },
    },
    include: {
      workspace: true,
    },
  });

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

  request.workspace = {
    id: member.workspace.id,
    name: member.workspace.name,
    role: member.workspaceRole,
    requiresApproval: member.workspace.requiresApproval,
    settings: member.workspace.settings,
  };
}
