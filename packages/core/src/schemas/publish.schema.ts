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
  /** Share Reel to feed grid (default true, set false to publish to Reels tab only) */
  shareToFeed: z.boolean().optional(),
  /** Custom public image URL for Reel/Video cover thumbnail */
  coverUrl: z.string().url().optional(),
  /** Video frame timestamp in milliseconds to extract as cover */
  thumbOffset: z.number().int().min(0).optional(),
  /** Audio title label shown on the Reel (max 100 chars) */
  audioName: z.string().min(1).max(100).optional(),
  /** Invite up to 3 Instagram usernames as collaborators */
  collaborators: z.array(z.string().min(1)).max(3).optional(),
  /** Trial Reel configuration shown to non-followers first */
  trialParams: z
    .object({
      graduationStrategy: z.enum(['MANUAL', 'SS_PERFORMANCE']),
    })
    .optional(),
  /** Collab post — co-author handle */
  collabHandle: z.string().optional(),
  /** Hide like count */
  hideLikeCount: z.boolean().default(false),
  /** Disable comments */
  disableComments: z.boolean().default(false),
});

export const ThreadsThreadItemSchema = z.object({
  /** Text content of this chained reply (max 500 characters) */
  content: z.string().min(1).max(500),
  /** Optional media URLs attached to this reply item (up to 10 images or videos) */
  mediaUrls: z.array(z.string().url()).max(10).optional(),
  /** Optional topic tag for community discovery */
  topicTag: z.string().max(50).optional(),
});

export const ThreadsOptionsSchema = z.object({
  /** Topic tag to categorize post into community hubs (e.g. 'technology', 'design') */
  topicTag: z.string().max(50).optional(),
  /** Parent thread or reply ID to continue an existing conversation */
  replyToId: z.string().optional(),
  /** Optional external link preview card */
  linkAttachment: z.string().url().optional(),
  /** Who can reply to this thread: 'everyone' (default), 'accounts_you_follow', or 'mentioned_only' */
  replyControl: z.enum(['everyone', 'accounts_you_follow', 'mentioned_only']).optional(),
  /** Alt text for accessibility per image, in the same order as media attachments */
  altText: z.array(z.string().max(1000)).max(10).optional(),
  /** Chained thread items (published sequentially as connected replies like Postiz thread composer) */
  threadItems: z.array(ThreadsThreadItemSchema).max(25).optional(),
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

export const FacebookOptionsSchema = z.object({
  /** Must match the connected account page identity when provided */
  pageId: z.string().optional(),
  /** Optional link attachment for feed post */
  link: z.string().url().optional(),
  /** Whether the post is published immediately (false creates an unpublished Page draft) */
  published: z.boolean().optional(),
  /** Custom video thumbnail / cover image URL (attached to video post) */
  videoThumbnailUrl: z.string().url().optional(),
  /** Optional alt text for media accessibility */
  altText: z.string().max(1000).optional(),
});

export const YouTubePrivacyStatusSchema = z.enum(['public', 'private', 'unlisted']);
export type YouTubePrivacyStatus = z.infer<typeof YouTubePrivacyStatusSchema>;

export const YouTubeOptionsSchema = z.object({
  /** Title of the video (up to 100 characters, < and > are prohibited by YouTube) */
  title: z
    .string()
    .min(1)
    .max(100)
    .refine((val) => !/[<>]/.test(val), {
      message: 'YouTube titles cannot contain < or > characters.',
    })
    .optional(),
  /** Full description / show notes / timestamps (up to 5000 characters) */
  description: z.string().max(5000).optional(),
  /** List of keyword tags (cumulative max 500 characters across all tags) */
  tags: z
    .array(z.string().min(1).max(100))
    .max(50)
    .refine((items) => items.reduce((acc, tag) => acc + tag.length, 0) <= 500, {
      message: 'Cumulative length of all YouTube tags must not exceed 500 characters.',
    })
    .optional(),
  /** Category ID (e.g. '22' for People & Blogs, '28' for Science & Technology) */
  categoryId: z.string().default('22').optional(),
  /** Privacy status of the uploaded video */
  privacyStatus: YouTubePrivacyStatusSchema.default('public').optional(),
  /** Whether the video is declared as YouTube Shorts (auto-appends #Shorts if not present) */
  isShort: z.boolean().optional(),
  /** COPPA compliance declaration: whether video is made for children */
  madeForKids: z.boolean().default(false).optional(),
  /** AI-generated content disclosure (increasingly required by YouTube / Google) */
  containsSyntheticMedia: z.boolean().default(false).optional(),
  /** Auto-posted first comment after the video goes live (up to 10,000 characters) */
  firstComment: z.string().max(10000).optional(),
  /** Custom thumbnail cover image URL (uploaded via POST /thumbnails/set) */
  thumbnailUrl: z.string().url().optional(),
  /** Embeddable flag */
  embeddable: z.boolean().default(true).optional(),
  /** Scheduled publication timestamp in ISO 8601 (requires privacyStatus='private') */
  publishAt: z.string().datetime().optional(),
});
export type YouTubeOptions = z.infer<typeof YouTubeOptionsSchema>;

export const PlatformOptionsSchema = z.discriminatedUnion('platform', [
  z.object({ platform: z.literal('LINKEDIN'), options: LinkedInOptionsSchema }),
  z.object({ platform: z.literal('X'), options: XOptionsSchema }),
  z.object({ platform: z.literal('INSTAGRAM'), options: InstagramOptionsSchema }),
  z.object({ platform: z.literal('TIKTOK'), options: TikTokOptionsSchema }),
  z.object({ platform: z.literal('YOUTUBE'), options: YouTubeOptionsSchema }),
  z.object({ platform: z.literal('THREADS'), options: ThreadsOptionsSchema }),
  z.object({ platform: z.literal('FACEBOOK'), options: FacebookOptionsSchema }),
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
export type InstagramOptions = z.infer<typeof InstagramOptionsSchema>;
export type ThreadsOptions = z.infer<typeof ThreadsOptionsSchema>;
export type ThreadsThreadItem = z.infer<typeof ThreadsThreadItemSchema>;
export type FacebookOptions = z.infer<typeof FacebookOptionsSchema>;
