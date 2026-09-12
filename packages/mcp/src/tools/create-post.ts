/**
 * scriora_create_post — uses the same createUnifiedPost path as POST /v1/posts.
 *
 * Auth: workspace API key (SCRIORA_API_KEY) plus membership. workspaceId must
 * match the key binding. Optional HMAC when MCP_SIGNING_SECRET is set.
 *
 * Autonomy: publication.publish is ALWAYS_REQUIRES_APPROVAL, so MCP cannot
 * queue a sweepable outbox without the Classic approval hold — even when the
 * workspace is AUTONOMOUS / requiresApproval=false.
 */

import crypto from 'node:crypto';
import { evaluateAutonomyGate } from 'scriora-agent';
import {
  CreatePostError,
  type CreateUnifiedPostResult,
  createUnifiedPost,
  deriveCreatePostStatus,
  type PublishTarget,
  prisma,
  SocialPlatformSchema,
  type YouTubeOptions,
} from 'scriora-core';
import { z } from 'zod';
import { maybeSendTelegramApprovalRequests } from '../lib/approval-delivery.js';
import { authorizeWorkspaceScopedTool } from '../lib/mcp-auth.js';

export const CreatePostToolInputSchema = z.object({
  workspaceId: z.string().uuid(),
  body: z.string().min(1),
  targets: z
    .array(
      z.object({
        socialAccountId: z.string().uuid(),
        platform: SocialPlatformSchema,
        customBody: z.string().optional(),
        facebookOptions: z
          .object({
            pageId: z.string().optional(),
            link: z.string().url().optional(),
            published: z.boolean().optional(),
            videoThumbnailUrl: z.string().url().optional(),
          })
          .optional(),
        youtubeOptions: z
          .object({
            title: z.string().max(100).optional(),
            description: z.string().max(5000).optional(),
            tags: z.array(z.string()).optional(),
            privacyStatus: z.enum(['public', 'private', 'unlisted']).optional(),
            isShort: z.boolean().optional(),
            thumbnailUrl: z.string().url().optional(),
            madeForKids: z.boolean().optional(),
            containsSyntheticMedia: z.boolean().optional(),
            firstComment: z.string().max(10000).optional(),
          })
          .optional(),
      })
    )
    .min(1)
    .max(10),
  mediaUrls: z.array(z.string().url()).max(10).optional(),
  scheduledAt: z.string().datetime().optional(),
  idempotencyKey: z.string().uuid().optional(),
});

export type CreatePostToolInput = z.infer<typeof CreatePostToolInputSchema>;

export interface CreatePostAuthInput {
  apiKey?: string | undefined;
  signature?: string | undefined;
}

export interface CreatePostToolSuccess {
  ok: true;
  message: string;
  contentId: string;
  publications: Array<{
    publicationId: string;
    platform: string;
    status: string;
    outboxCommandId: string | null;
    approvalId?: string;
    approvalToken?: string;
    approvalUrl?: string;
  }>;
  publicationCount: number;
  outboxCommandCount: number;
  requiresApproval: boolean;
  scheduledAt: string | null;
  status: string;
}

export interface CreatePostToolFailure {
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

export type CreatePostToolResult = CreatePostToolSuccess | CreatePostToolFailure;

export const CREATE_POST_TOOL_DESCRIPTION =
  'Creates a social post through the same path as POST /v1/posts: publications, ' +
  'outbox (only after human approval), and §14 approval tokens. Requires a ' +
  'workspace API key bound to workspaceId (SCRIORA_API_KEY) with posts:write. ' +
  'publication.publish always requires approval on the MCP/agent path — ' +
  'AUTONOMOUS mode is not a bypass. X-Workspace-Id is not authentication.';

function mapTargetsToPublishTargets(targets: CreatePostToolInput['targets']): PublishTarget[] {
  return targets.map((target) => {
    const mapped: PublishTarget = {
      socialAccountId: target.socialAccountId,
      platform: target.platform,
    };
    if (target.customBody !== undefined) {
      mapped.customBody = target.customBody;
    }
    if (target.facebookOptions) {
      mapped.platformOptions = {
        platform: 'FACEBOOK',
        options: target.facebookOptions,
      };
    } else if (target.youtubeOptions) {
      mapped.platformOptions = {
        platform: 'YOUTUBE',
        options: target.youtubeOptions as YouTubeOptions,
      };
    }
    return mapped;
  });
}

export async function executeCreatePost(
  input: CreatePostToolInput,
  authInput: CreatePostAuthInput = {}
): Promise<CreatePostToolResult> {
  const auth = await authorizeWorkspaceScopedTool({
    workspaceId: input.workspaceId,
    toolName: 'scriora_create_post',
    requiredScope: 'posts:write',
    requireWriteRole: true,
    apiKey: authInput.apiKey,
    signature: authInput.signature,
  });

  if (!auth.ok) {
    return { ok: false, error: auth.error };
  }

  const workspace = await prisma.workspace.findUnique({
    where: { id: auth.workspaceId },
    select: {
      id: true,
      requiresApproval: true,
      ownerUserId: true,
    },
  });

  if (!workspace) {
    return {
      ok: false,
      error: {
        code: 'WORKSPACE_NOT_FOUND',
        message: 'Workspace does not exist; refusing to write an unbound draft',
      },
    };
  }

  const gate = evaluateAutonomyGate({
    action: 'publication.publish',
    workspaceRequiresApproval: workspace.requiresApproval,
  });

  if (!gate.allowed) {
    return {
      ok: false,
      error: {
        code: gate.code,
        message: gate.reason,
      },
    };
  }

  const idempotencyKey = input.idempotencyKey ?? crypto.randomUUID();

  let result: CreateUnifiedPostResult;
  try {
    result = await createUnifiedPost(prisma, {
      workspaceId: workspace.id,
      createdByUserId: auth.userId,
      requiresApproval: gate.requiresApproval,
      body: input.body,
      targets: mapTargetsToPublishTargets(input.targets),
      ...(input.mediaUrls ? { mediaUrls: input.mediaUrls } : {}),
      ...(input.scheduledAt ? { scheduledAt: input.scheduledAt } : {}),
      idempotencyKey,
    });
  } catch (error: unknown) {
    if (error instanceof CreatePostError) {
      return {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
        },
      };
    }
    throw error;
  }

  if (result.kind === 'idempotent_replay') {
    return {
      ok: true,
      message: 'Idempotent replay of an existing publication',
      contentId: result.publicationId,
      publications: [
        {
          publicationId: result.publicationId,
          platform: 'UNKNOWN',
          status: result.status,
          outboxCommandId: null,
        },
      ],
      publicationCount: 1,
      outboxCommandCount: 0,
      requiresApproval: gate.requiresApproval,
      scheduledAt: input.scheduledAt ?? null,
      status: result.status,
    };
  }

  if (result.pendingTelegramApprovals.length > 0) {
    try {
      await maybeSendTelegramApprovalRequests(result.pendingTelegramApprovals);
    } catch {
      // Best-effort; raw token remains on the tool result.
    }
  }

  const outboxCommandCount = result.publications.filter(
    (publication) => publication.outboxCommandId
  ).length;
  const status = deriveCreatePostStatus(result.publications);

  return {
    ok: true,
    message: result.message,
    contentId: result.contentId,
    publications: result.publications,
    publicationCount: result.publications.length,
    outboxCommandCount,
    requiresApproval: result.requiresApproval,
    scheduledAt: input.scheduledAt ?? null,
    status,
  };
}

export function formatCreatePostToolResponse(result: CreatePostToolResult): {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
} {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
    ...(result.ok ? {} : { isError: true }),
  };
}
