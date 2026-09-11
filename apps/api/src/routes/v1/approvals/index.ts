import crypto from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { ApprovalDecisionSchema, prisma } from 'scriora-core';
import { err, ok } from '../../../lib/response.js';
import { verifyAuth } from '../../../middleware/auth.js';
import { verifyWorkspace } from '../../../middleware/workspace.js';

export const approvalRoutes: FastifyPluginAsync = async (fastify) => {
  // 1. Validate magic link and fetch preview (PUBLIC, zero-login per §14.3)
  fastify.get('/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    if (!token) {
      return reply
        .status(400)
        .send(err('MISSING_TOKEN', 'VALIDATION_ERROR', 'Token parameter is required', request.id));
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const tokenRecord = await prisma.approvalToken.findFirst({
      where: { tokenHash },
      include: {
        approval: true,
      },
    });

    if (!tokenRecord) {
      return reply
        .status(404)
        .send(err('TOKEN_NOT_FOUND', 'NOT_FOUND', 'Approval token does not exist', request.id));
    }

    if (tokenRecord.usedAt !== null) {
      return reply
        .status(409)
        .send(
          err(
            'TOKEN_ALREADY_USED',
            'CONFLICT',
            'This approval link has already been used',
            request.id
          )
        );
    }

    if (tokenRecord.expiresAt < new Date()) {
      return reply
        .status(410)
        .send(
          err(
            'TOKEN_EXPIRED',
            'AUTHENTICATION_ERROR',
            'This approval link has expired (72h limit)',
            request.id
          )
        );
    }

    let publicationDetails = null;
    if (tokenRecord.approval.resourceType === 'PUBLICATION') {
      const pub = await prisma.publication.findUnique({
        where: { id: tokenRecord.approval.resourceId },
        include: {
          contentVariant: {
            include: { content: true },
          },
          socialAccount: {
            select: { platform: true, accountName: true },
          },
        },
      });

      if (pub) {
        publicationDetails = {
          title: pub.contentVariant.content.title,
          body: pub.contentVariant.body || pub.contentVariant.content.body,
          platform: pub.socialAccount.platform,
          accountName: pub.socialAccount.accountName,
          scheduledAt: pub.scheduledAt,
        };
      }
    }

    return reply.status(200).send(
      ok(
        {
          approvalId: tokenRecord.approvalId,
          status: tokenRecord.approval.status,
          post: publicationDetails,
        },
        request.id
      )
    );
  });

  // 2. Submit decision (PUBLIC via token per §14.3)
  fastify.post('/:token/decision', async (request, reply) => {
    const { token } = request.params as { token: string };
    const parseResult = ApprovalDecisionSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply
        .status(400)
        .send(err('VALIDATION_ERROR', 'VALIDATION_ERROR', 'Invalid decision payload', request.id));
    }

    const { decision, feedback } = parseResult.data;
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const tokenRecord = await prisma.approvalToken.findFirst({
      where: { tokenHash },
      include: {
        approval: true,
      },
    });

    if (!tokenRecord) {
      return reply
        .status(404)
        .send(err('TOKEN_NOT_FOUND', 'NOT_FOUND', 'Approval token not found', request.id));
    }

    if (tokenRecord.usedAt !== null) {
      return reply
        .status(409)
        .send(
          err(
            'TOKEN_ALREADY_USED',
            'CONFLICT',
            'This decision has already been recorded',
            request.id
          )
        );
    }

    if (tokenRecord.expiresAt < new Date()) {
      return reply
        .status(410)
        .send(
          err('TOKEN_EXPIRED', 'AUTHENTICATION_ERROR', 'Approval link has expired', request.id)
        );
    }

    const approval = tokenRecord.approval;

    await prisma.$transaction(async (tx) => {
      // Mark token consumed
      await tx.approvalToken.update({
        where: { id: tokenRecord.id },
        data: { usedAt: new Date() },
      });

      // Update Approval
      await tx.approval.update({
        where: { id: approval.id },
        data: {
          status: decision === 'APPROVED' ? 'APPROVED' : 'REJECTED',
          decidedAt: new Date(),
          decisionNote: feedback || null,
        },
      });

      // If approval is for a PUBLICATION
      if (approval.resourceType === 'PUBLICATION') {
        const newPublicationStatus = decision === 'APPROVED' ? 'READY' : 'CANCELLED';
        await tx.publication.update({
          where: { id: approval.resourceId },
          data: { status: newPublicationStatus },
        });

        // If rejected, remove pending outbox command
        if (decision === 'REJECTED') {
          await tx.outboxCommand.deleteMany({
            where: { publicationId: approval.resourceId, status: 'PENDING' },
          });
        }
      }
    });

    return reply.status(200).send(
      ok(
        {
          decision,
          approvalId: approval.id,
          message:
            decision === 'APPROVED' ? 'Approved and queued for dispatch' : 'Rejected and cancelled',
        },
        request.id
      )
    );
  });

  // 3. List Pending Approvals (Authenticated & workspace-scoped)
  fastify.register(async (scoped) => {
    scoped.addHook('preHandler', verifyAuth);
    scoped.addHook('preHandler', verifyWorkspace);

    scoped.get('/', async (request, reply) => {
      const workspaceId = request.workspace!.id;
      const approvals = await prisma.approval.findMany({
        where: { workspaceId, status: 'PENDING' },
        include: {
          tokens: {
            where: { usedAt: null, expiresAt: { gt: new Date() } },
            take: 1,
            select: { id: true, expiresAt: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return reply.status(200).send(ok(approvals, request.id));
    });
  });
};
