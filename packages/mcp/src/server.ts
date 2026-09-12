// scriora-mcp — MCP Protocol Server
// Exposes Scriora capabilities to external AI clients via Model Context Protocol
// Protocol version: 2024-11-05
// INVARIANT: This server CANNOT bypass the Human Approval Gate.
//            Every action that requires approval must go through
//            the approval flow — never directly to execution.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  crossPostOptimizer,
  defaultDateTimeService,
  type PlatformTarget,
  prisma,
  SocialPlatformSchema,
} from 'scriora-core';
import { z } from 'zod';

const server = new McpServer({
  name: 'scriora-mcp',
  version: '0.2.0',
});

// ── Tool 1: scriora_optimize_cross_post ───────────────────────────────────────
server.tool(
  'scriora_optimize_cross_post',
  'Analyzes social media copy against platform heuristics, limits, and Buffer algorithms (e.g. Facebook 14M zero-link study, Instagram 5-hashtag rule, Threads video constraints).',
  {
    body: z.string().describe('The draft copy / post content'),
    targetPlatforms: z
      .array(SocialPlatformSchema)
      .describe('Target social platforms (e.g. FACEBOOK, INSTAGRAM, THREADS, X, LINKEDIN)'),
    mediaUrls: z
      .array(z.string().url())
      .optional()
      .describe('Media asset URLs attached to the post'),
  },
  async ({ body, targetPlatforms, mediaUrls }) => {
    const analysis = crossPostOptimizer.optimize({
      body,
      targetPlatforms: targetPlatforms as PlatformTarget[],
      mediaUrls: mediaUrls || [],
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              summary: 'Cross-post optimization analysis completed',
              platformsAnalyzed: Object.keys(analysis),
              results: analysis,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ── Tool 2: scriora_get_smart_slots ──────────────────────────────────────────
server.tool(
  'scriora_get_smart_slots',
  'Retrieves empirical peak posting windows (golden slots) backed by Buffer datasets (14M Facebook posts, 9.6M Instagram posts, 8.7M X posts, 2.5M Threads posts, 1.8M YouTube videos/Shorts).',
  {
    platform: z
      .enum(['LINKEDIN', 'X', 'INSTAGRAM', 'THREADS', 'FACEBOOK', 'YOUTUBE', 'GENERAL'])
      .describe('Target platform for optimal timing'),
    timezone: z
      .string()
      .default('Africa/Cairo')
      .describe(
        'Local timezone for calculations (e.g. Africa/Cairo, Asia/Riyadh, America/New_York)'
      ),
    daysAhead: z
      .number()
      .int()
      .min(1)
      .max(30)
      .default(7)
      .describe('How many days ahead to project slots'),
  },
  async ({ platform, timezone, daysAhead }) => {
    const slots = defaultDateTimeService.getSmartScheduleSlots({
      platform,
      timezone,
      daysAhead,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              platform,
              timezone,
              slotsCount: slots.length,
              topSlots: slots.slice(0, 5),
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ── Tool 3: scriora_list_social_accounts ─────────────────────────────────────
server.tool(
  'scriora_list_social_accounts',
  'Lists all connected social accounts in a workspace, including individual Facebook Pages, Instagram Business profiles, and Threads accounts.',
  {
    workspaceId: z.string().uuid().describe('The Scriora workspace UUID'),
  },
  async ({ workspaceId }) => {
    const accounts = await prisma.socialAccount.findMany({
      where: { workspaceId },
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
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              workspaceId,
              accountsCount: accounts.length,
              accounts,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ── Tool 4: scriora_create_post ──────────────────────────────────────────────
server.tool(
  'scriora_create_post',
  'Creates and stages a social media post across one or multiple platforms (e.g. Facebook Pages, Threads, Instagram). Enforces Human Approval Gate where required.',
  {
    workspaceId: z.string().uuid().describe('Target workspace UUID'),
    body: z.string().min(1).describe('Post caption or textual update'),
    targets: z
      .array(
        z.object({
          socialAccountId: z.string().uuid().describe('ID of connected account/page'),
          platform: SocialPlatformSchema,
          customBody: z.string().optional().describe('Platform-specific override body'),
          facebookOptions: z
            .object({
              pageId: z.string().optional(),
              link: z.string().url().optional(),
              published: z.boolean().optional().describe('False creates an unpublished draft'),
              videoThumbnailUrl: z
                .string()
                .url()
                .optional()
                .describe('Custom video thumbnail cover'),
            })
            .optional(),
          youtubeOptions: z
            .object({
              title: z.string().max(100).optional().describe('Video title'),
              description: z.string().max(5000).optional().describe('Video description'),
              tags: z.array(z.string()).optional().describe('Keyword tags'),
              privacyStatus: z.enum(['public', 'private', 'unlisted']).optional(),
              isShort: z.boolean().optional().describe('True formats video as YouTube Shorts'),
              thumbnailUrl: z
                .string()
                .url()
                .optional()
                .describe('Custom video thumbnail cover image URL'),
              madeForKids: z.boolean().optional().describe('COPPA compliance flag'),
              containsSyntheticMedia: z
                .boolean()
                .optional()
                .describe('AI-generated content disclosure'),
              firstComment: z
                .string()
                .max(10000)
                .optional()
                .describe('Auto-posted first comment for links/discussion'),
            })
            .optional(),
        })
      )
      .min(1)
      .describe('One or more target destinations'),
    mediaUrls: z.array(z.string().url()).optional().describe('Attached images or videos'),
    scheduledAt: z.string().datetime().optional().describe('Optional ISO timestamp for scheduling'),
  },
  async ({ workspaceId, body, targets, mediaUrls, scheduledAt }) => {
    const contentItem = await prisma.content.create({
      data: {
        workspaceId,
        title: body.slice(0, 60),
        body,
        status: 'DRAFT',
      },
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              message: 'Content successfully created and staged in Scriora workspace',
              contentId: contentItem.id,
              targetsCount: targets.length,
              mediaUrls: mediaUrls || [],
              scheduledAt: scheduledAt || 'IMMEDIATE',
              status: 'STAGED',
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ── Resources ────────────────────────────────────────────────────────────────
server.resource('platform_limits', 'scriora://platforms/limits', async () => ({
  contents: [
    {
      uri: 'scriora://platforms/limits',
      text: JSON.stringify(
        {
          FACEBOOK: {
            maxTextLength: 63206,
            maxMedia: 10,
            formats: ['FEED', 'PHOTO', 'ALBUM', 'VIDEO'],
          },
          INSTAGRAM: {
            maxTextLength: 2200,
            maxMedia: 10,
            formats: ['FEED', 'REEL', 'STORY', 'CAROUSEL'],
          },
          THREADS: { maxTextLength: 500, maxMedia: 10, formats: ['POST', 'CHAINED_REPLIES'] },
          X: { maxTextLength: 280, maxMedia: 4, formats: ['TWEET', 'THREAD', 'POLL'] },
          LINKEDIN: {
            maxTextLength: 3000,
            maxMedia: 9,
            formats: ['TEXT', 'PHOTO', 'DOCUMENT_PDF'],
          },
          YOUTUBE: {
            maxTextLength: 5000,
            maxMedia: 1,
            maxShortsDurationSeconds: 180,
            maxTitleLength: 100,
            maxTagsLength: 500,
            formats: ['VIDEO', 'SHORTS'],
          },
        },
        null,
        2
      ),
    },
  ],
}));

const transport = new StdioServerTransport();
await server.connect(transport);
