import crypto from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import {
  CreateWorkspaceSchema,
  InviteMemberSchema,
  prisma,
  UpdateWorkspaceSchema,
} from 'scriora-core';
import { z } from 'zod';
import { err, ok } from '../../../lib/response.js';
import { verifyAuth } from '../../../middleware/auth.js';
import { verifyWorkspace } from '../../../middleware/workspace.js';

const CreateApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.string()).default(['posts:write', 'analytics:read']),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

const WsIdParamSchema = z.object({
  wsId: z.string().uuid('Invalid wsId: must be a valid UUID'),
});

const MemberParamSchema = z.object({
  wsId: z.string().uuid('Invalid wsId: must be a valid UUID'),
  userId: z.string().uuid('Invalid userId: must be a valid UUID'),
});

const ApiKeyParamSchema = z.object({
  wsId: z.string().uuid('Invalid wsId: must be a valid UUID'),
  keyId: z.string().uuid('Invalid keyId: must be a valid UUID'),
});

export const workspaceRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', verifyAuth);

  // 1. List user workspaces
  fastify.get('/', async (request, reply) => {
    const userId = request.authContext!.userId;
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId },
      include: {
        workspace: true,
      },
      orderBy: { joinedAt: 'asc' },
    });

    const workspaces = memberships.map((m) => ({
      ...m.workspace,
      role: m.workspaceRole,
    }));

    return reply.status(200).send(ok(workspaces, request.id));
  });

  // 2. Create workspace
  fastify.post('/', async (request, reply) => {
    const parseResult = CreateWorkspaceSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply
        .status(400)
        .send(
          err('VALIDATION_ERROR', 'VALIDATION_ERROR', 'Invalid workspace parameters', request.id)
        );
    }

    const { name, slug, purpose, operatingMode, requiresApproval, description } = parseResult.data;
    const userId = request.authContext!.userId;

    const existingSlug = await prisma.workspace.findUnique({ where: { slug } });
    if (existingSlug) {
      return reply
        .status(409)
        .send(err('SLUG_TAKEN', 'CONFLICT', 'Workspace slug is already in use', request.id));
    }

    const workspace = await prisma.$transaction(async (tx) => {
      const ws = await tx.workspace.create({
        data: {
          name,
          slug,
          purpose,
          defaultOperatingMode: operatingMode,
          requiresApproval,
          ownerUserId: userId,
          settings: description ? { description } : {},
        },
      });

      await tx.workspaceMember.create({
        data: {
          workspaceId: ws.id,
          userId,
          workspaceRole: 'OWNER',
        },
      });

      return ws;
    });

    return reply.status(201).send(ok(workspace, request.id));
  });

  // 3. Workspace Detail (nested under :wsId with verifyWorkspace middleware)
  fastify.register(async (scoped) => {
    scoped.addHook('preValidation', async (request, reply) => {
      const params = request.params as Record<string, string> | undefined;
      if (params?.wsId) {
        const result = WsIdParamSchema.safeParse(params);
        if (!result.success) {
          return reply
            .status(400)
            .send(
              err(
                'VALIDATION_ERROR',
                'VALIDATION_ERROR',
                'Invalid wsId: must be a valid UUID',
                request.id
              )
            );
        }
      }
    });

    scoped.addHook('preHandler', verifyWorkspace);

    // Get workspace detail
    scoped.get('/:wsId', async (request, reply) => {
      const { wsId } = request.params as { wsId: string };
      const workspace = await prisma.workspace.findUnique({
        where: { id: wsId },
        include: {
          members: {
            include: {
              user: {
                select: { id: true, name: true, email: true, avatarUrl: true },
              },
            },
          },
          _count: {
            select: {
              socialAccounts: true,
              publications: true,
              members: true,
            },
          },
        },
      });

      return reply.status(200).send(ok(workspace, request.id));
    });

    // Update workspace
    scoped.patch('/:wsId', async (request, reply) => {
      const { wsId } = request.params as { wsId: string };
      if (request.workspace!.role !== 'OWNER' && request.workspace!.role !== 'ADMIN') {
        return reply
          .status(403)
          .send(
            err(
              'FORBIDDEN',
              'AUTHORIZATION_ERROR',
              'Only OWNER or ADMIN can modify workspace settings',
              request.id
            )
          );
      }

      const parseResult = UpdateWorkspaceSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply
          .status(400)
          .send(
            err('VALIDATION_ERROR', 'VALIDATION_ERROR', 'Invalid update parameters', request.id)
          );
      }

      const updated = await prisma.workspace.update({
        where: { id: wsId },
        data: {
          ...(parseResult.data.name ? { name: parseResult.data.name } : {}),
          ...(parseResult.data.purpose ? { purpose: parseResult.data.purpose } : {}),
          ...(parseResult.data.operatingMode
            ? {
                defaultOperatingMode: parseResult.data.operatingMode,
              }
            : {}),
          ...(parseResult.data.requiresApproval !== undefined
            ? { requiresApproval: parseResult.data.requiresApproval }
            : {}),
        },
      });

      return reply.status(200).send(ok(updated, request.id));
    });

    // Delete workspace
    scoped.delete('/:wsId', async (request, reply) => {
      const { wsId } = request.params as { wsId: string };
      if (request.workspace!.role !== 'OWNER') {
        return reply
          .status(403)
          .send(
            err(
              'FORBIDDEN',
              'AUTHORIZATION_ERROR',
              'Only the OWNER can delete a workspace',
              request.id
            )
          );
      }

      await prisma.workspace.delete({ where: { id: wsId } });
      return reply.status(204).send();
    });

    // Invite Member
    scoped.post('/:wsId/members', async (request, reply) => {
      const { wsId } = request.params as { wsId: string };
      if (request.workspace!.role !== 'OWNER' && request.workspace!.role !== 'ADMIN') {
        return reply
          .status(403)
          .send(err('FORBIDDEN', 'AUTHORIZATION_ERROR', 'Permission denied', request.id));
      }

      const parseResult = InviteMemberSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply
          .status(400)
          .send(
            err('VALIDATION_ERROR', 'VALIDATION_ERROR', 'Invalid invite parameters', request.id)
          );
      }

      const { email, role } = parseResult.data;
      let targetUser = await prisma.user.findUnique({ where: { email } });

      if (!targetUser) {
        targetUser = await prisma.user.create({
          data: {
            email,
            name: email.split('@')[0] || 'Invited User',
            authProvider: 'MAGIC_LINK',
          },
        });
      }

      const member = await prisma.workspaceMember.upsert({
        where: {
          workspaceId_userId: {
            workspaceId: wsId,
            userId: targetUser.id,
          },
        },
        create: {
          workspaceId: wsId,
          userId: targetUser.id,
          workspaceRole: role,
        },
        update: {
          workspaceRole: role,
        },
      });

      return reply.status(201).send(ok(member, request.id));
    });

    // Remove Member
    scoped.delete('/:wsId/members/:userId', async (request, reply) => {
      const paramResult = MemberParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply
          .status(400)
          .send(
            err(
              'VALIDATION_ERROR',
              'VALIDATION_ERROR',
              'Invalid userId or wsId: must be a valid UUID',
              request.id
            )
          );
      }
      const { wsId, userId } = paramResult.data;
      if (request.workspace!.role !== 'OWNER' && request.workspace!.role !== 'ADMIN') {
        return reply
          .status(403)
          .send(err('FORBIDDEN', 'AUTHORIZATION_ERROR', 'Permission denied', request.id));
      }

      if (userId === request.authContext!.userId) {
        return reply
          .status(400)
          .send(
            err(
              'CANNOT_REMOVE_SELF',
              'BUSINESS_RULE_VIOLATION',
              'Cannot remove yourself from workspace via this endpoint',
              request.id
            )
          );
      }

      await prisma.workspaceMember.deleteMany({
        where: {
          workspaceId: wsId,
          userId,
        },
      });

      return reply.status(204).send();
    });

    // Create API Key
    scoped.post('/:wsId/api-keys', async (request, reply) => {
      const { wsId } = request.params as { wsId: string };
      const parseResult = CreateApiKeySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply
          .status(400)
          .send(
            err('VALIDATION_ERROR', 'VALIDATION_ERROR', 'Invalid API key parameters', request.id)
          );
      }

      const { name, scopes, expiresInDays } = parseResult.data;
      const rawSecret = crypto.randomBytes(24).toString('base64url');
      const apiKeyString = `sk_live_${rawSecret}`;
      const keyPrefix = apiKeyString.slice(0, 12);
      const keyHash = crypto.createHash('sha256').update(apiKeyString).digest('hex');

      const expiresAt = expiresInDays
        ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
        : null;

      const record = await prisma.apiKey.create({
        data: {
          workspaceId: wsId,
          userId: request.authContext!.userId,
          name,
          keyHash,
          keyPrefix,
          scopes,
          expiresAt,
        },
      });

      return reply.status(201).send(
        ok(
          {
            apiKey: apiKeyString, // Raw key returned ONCE
            id: record.id,
            name: record.name,
            keyPrefix: record.keyPrefix,
            scopes: record.scopes,
            expiresAt: record.expiresAt,
            createdAt: record.createdAt,
          },
          request.id
        )
      );
    });

    // List API Keys
    scoped.get('/:wsId/api-keys', async (request, reply) => {
      const { wsId } = request.params as { wsId: string };
      const keys = await prisma.apiKey.findMany({
        where: { workspaceId: wsId, revokedAt: null },
        select: {
          id: true,
          name: true,
          keyPrefix: true,
          scopes: true,
          lastUsedAt: true,
          expiresAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      return reply.status(200).send(ok(keys, request.id));
    });

    // Revoke API Key
    scoped.delete('/:wsId/api-keys/:keyId', async (request, reply) => {
      const paramResult = ApiKeyParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply
          .status(400)
          .send(
            err(
              'VALIDATION_ERROR',
              'VALIDATION_ERROR',
              'Invalid keyId or wsId: must be a valid UUID',
              request.id
            )
          );
      }
      const { wsId, keyId } = paramResult.data;
      await prisma.apiKey.updateMany({
        where: { id: keyId, workspaceId: wsId },
        data: { revokedAt: new Date() },
      });

      return reply.status(204).send();
    });
  });
};
