/**
 * packages/core/src/schemas/publish.schema.ts
 * Canonical Zod schemas for the unified POST /v1/posts payload.
 * This is the most critical schema in Scriora — every publish request is validated here.
 */

import { z } from 'zod';

// ── Supported Platforms ────────────────────────────────────────────────────────

export const SocialPlatformSchema = z.enum([
  'LINKEDIN',
  'X',
  'INSTAGRAM',
  'TIKTOK',
  'YOUTUBE',
  'THREADS',
  'FACEBOOK',
  'PINTEREST',
  'BLUESKY',
  'TELEGRAM',
  'DISCORD',
]);

// ── Media Reference ────────────────────────────────────────────────────────────

export const MediaRefSchema = z.object({
  mediaAssetId: z.string().uuid('mediaAssetId must be a valid UUID'),
  altText: z.string().max(1000).optional(),
  caption: z.string().max(2200).optional(),
});

// ── Platform-Specific Overrides ────────────────────────────────────────────────
// Each platform can receive native options beyond the universal body.

export const LinkedInOptionsSchema = z.object({
  /** Post as a LinkedIn Article instead of a standard feed post */
  postAsArticle: z.boolean().optional(),
  /** Attach a document carousel (requires mediaAssetId pointing to PDF) */
  documentTitle: z.string().max(255).optional(),
  /** Visibility: public, connections only */
  visibility: z.enum(['PUBLIC', 'CONNECTIONS']).default('PUBLIC'),
  /** External URL for rich link / article share preview card */
  articleUrl: z.string().url().optional(),
  /** Custom title for article preview card (up to 400 chars) */
  articleTitle: z.string().max(400).optional(),
  /** Custom description for article preview card (up to 400 chars) */
  articleDescription: z.string().max(400).optional(),
  /** Tag company/organization pages in the post text with clickable LinkedIn mentions */
  mentions: z
    .array(
      z.object({
        /** Exact substring within post text to convert to mention (e.g. '@Google') */
        text: z.string().min(1),
        /** Organization URN to link (e.g. 'urn:li:organization:1441') */
        urn: z.string().regex(/^urn:li:organization:\d+$/, {
          message: "LinkedIn mention URN must match format 'urn:li:organization:<digits>'",
        }),
      })
    )
    .max(30)
    .optional(),
});

export const XPollSchema = z.object({
  /** 2 to 4 poll options, each up to 25 characters */
  options: z.array(z.string().min(1).max(25)).min(2).max(4),
  /** Poll duration in minutes: between 5 minutes and 10,080 minutes (7 days) */
  durationMinutes: z.number().int().min(5).max(10080).default(1440),
});

export const XThreadItemSchema = z.object({
  /** Text content of this thread item (max 280 chars) */
  content: z.string().min(1).max(280),
  /** Optional media URLs to attach to this thread tweet (up to 4 images or 1 video) */
  mediaUrls: z.array(z.string().url()).max(4).optional(),
  /** Optional alt text for media items */
  altText: z.string().max(1000).optional(),
});

export const XOptionsSchema = z.object({
  /** Split body into a thread if it exceeds 280 chars */
  threadMode: z.boolean().default(false),
  /** Opt in to long posts (up to 25,000 chars) for X Premium / Premium+ accounts without thread splitting */
  longPost: z.boolean().optional(),
  /** Reply to an existing X post / tweet ID */
  replyToId: z.string().optional(),
  replyToTweetId: z.string().optional(),
  /** Quote an existing tweet ID */
  quoteTweetId: z.string().optional(),
  /** Control who can reply: following, mentionedUsers, subscribers, verified, or everyone */
  replySettings: z
    .enum(['following', 'mentionedUsers', 'subscribers', 'verified', 'everyone'])
    .optional(),
  /** Twitter Community ID to publish this post into */
  communityId: z.string().optional(),
  /** When posting to a Community, also share the post with your followers */
  shareWithFollowers: z.boolean().optional(),
  /** Native poll configuration (cannot be combined with media or threadItems on the same tweet) */
  poll: XPollSchema.optional(),
  /** Explicit chained thread items */
  threadItems: z.array(XThreadItemSchema).max(25).optional(),
  /** Automatically move links from the main tweet to the first reply (bypasses the 2026 X link penalty) */
  linkInFirstReply: z.boolean().optional(),
  /** Add alt text for accessibility (required for WCAG compliance) */
  altText: z.string().max(1000).optional(),
});

export const InstagramOptionsSchema = z.object({
  postType: z.enum(['FEED', 'REEL', 'STORY', 'CAROUSEL']).default('FEED'),
  /** Collab post — co-author handle */
  collabHandle: z.string().optional(),
  /** Hide like count */
  hideLikeCount: z.boolean().default(false),
  /** Disable comments */
  disableComments: z.boolean().default(false),
});

export const TikTokOptionsSchema = z.object({
  /** Enable duet */
  duetEnabled: z.boolean().default(true),
  /** Enable stitch */
  stitchEnabled: z.boolean().default(true),
  privacy: z.enum(['PUBLIC', 'FRIENDS', 'PRIVATE']).default('PUBLIC'),
  /** Declare commercial content */
  isSponsored: z.boolean().default(false),
});

export const DiscordOptionsSchema = z.object({
  /** Custom embed title */
  embedTitle: z.string().max(256).optional(),
  /** Custom embed description (markdown supported) */
  embedDescription: z.string().max(4096).optional(),
  /** Custom embed color in hex (e.g. #5865F2) or integer */
  embedColor: z.union([z.string().regex(/^#?[0-9a-fA-F]{6}$/), z.number().int()]).optional(),
  /** Custom embed footer text */
  embedFooter: z.string().max(2048).optional(),
  /** Override username for webhook posts */
  username: z.string().max(80).optional(),
  /** Override avatar URL for webhook posts */
  avatarUrl: z.string().url().optional(),
  /** Automatically pin the message after posting (requires PIN_MESSAGES permission) */
  pinMessage: z.boolean().optional(),
  /** List of emojis to auto-react to the post (requires ADD_REACTIONS permission) */
  autoReactions: z.array(z.string().min(1).max(64)).max(10).optional(),
  /** Optional thread name to create under the published message */
  threadName: z.string().min(1).max(100).optional(),
  /** Explicitly allow @everyone and role mentions */
  allowEveryoneMention: z.boolean().optional(),
});

export const PlatformOptionsSchema = z.discriminatedUnion('platform', [
  z.object({ platform: z.literal('LINKEDIN'), options: LinkedInOptionsSchema }),
  z.object({ platform: z.literal('X'), options: XOptionsSchema }),
  z.object({ platform: z.literal('INSTAGRAM'), options: InstagramOptionsSchema }),
  z.object({ platform: z.literal('TIKTOK'), options: TikTokOptionsSchema }),
  z.object({ platform: z.literal('YOUTUBE'), options: z.object({}).passthrough() }),
  z.object({ platform: z.literal('THREADS'), options: z.object({}).passthrough() }),
  z.object({ platform: z.literal('FACEBOOK'), options: z.object({}).passthrough() }),
  z.object({ platform: z.literal('BLUESKY'), options: z.object({}).passthrough() }),
  z.object({ platform: z.literal('PINTEREST'), options: z.object({}).passthrough() }),
  z.object({ platform: z.literal('TELEGRAM'), options: z.object({}).passthrough() }),
  z.object({ platform: z.literal('DISCORD'), options: DiscordOptionsSchema }),
]);

// ── Publish Target ─────────────────────────────────────────────────────────────

export const PublishTargetSchema = z.object({
  /** Connected social account to publish to */
  socialAccountId: z.string().uuid('socialAccountId must be a valid UUID'),
  platform: SocialPlatformSchema,
  /** Optional custom message body specific to this target destination (overrides universal body) */
  customBody: z.string().min(1).max(10000).optional(),
  /** Platform-specific override options */
  platformOptions: PlatformOptionsSchema.optional(),
});

// ── Primary Publish Payload ────────────────────────────────────────────────────

export const PublishPayloadSchema = z.object({
  /** Universal body text (platform-specific adapters handle truncation) */
  body: z
    .string()
    .min(1, 'Post body cannot be empty')
    .max(10000, 'Post body too long — use contentVariantId for platform-specific overrides'),

  /** Target platforms and accounts — must contain at least 1 */
  targets: z
    .array(PublishTargetSchema)
    .min(1, 'At least one publish target is required')
    .max(10, 'Cannot publish to more than 10 targets in a single request'),

  /** Optional media attachments */
  media: z.array(MediaRefSchema).max(10).optional(),

  /** Direct media URLs (images/videos) */
  mediaUrls: z.array(z.string().url()).max(10).optional(),

  /** Schedule for a future time (ISO 8601). Omit for immediate publish. */
  scheduledAt: z
    .string()
    .datetime({ message: 'scheduledAt must be a valid ISO 8601 datetime' })
    .refine((dt) => new Date(dt) > new Date(), { message: 'scheduledAt must be in the future' })
    .optional(),

  /** Link any agent mission that triggered this publish */
  missionId: z.string().uuid().optional(),

  /** Idempotency key — callers should generate UUID v4 per request */
  idempotencyKey: z.string().uuid('idempotencyKey must be a valid UUID').optional(),
});

// ── Schedule-only variant ─────────────────────────────────────────────────────

export const SchedulePayloadSchema = PublishPayloadSchema.extend({
  scheduledAt: z
    .string()
    .datetime({ message: 'scheduledAt is required for scheduling' })
    .refine((dt) => new Date(dt) > new Date(), { message: 'scheduledAt must be in the future' }),
});

// ── Inferred Types ─────────────────────────────────────────────────────────────

export type PublishPayload = z.infer<typeof PublishPayloadSchema>;
export type SchedulePayload = z.infer<typeof SchedulePayloadSchema>;
export type PublishTarget = z.infer<typeof PublishTargetSchema>;
export type MediaRef = z.infer<typeof MediaRefSchema>;
