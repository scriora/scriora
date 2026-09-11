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
  /** Post as a LinkedIn Article instead of a feed post */
  postAsArticle: z.boolean().optional(),
  /** Attach a document carousel (requires mediaAssetId pointing to PDF) */
  documentTitle: z.string().max(255).optional(),
  /** Visibility: public, connections only */
  visibility: z.enum(['PUBLIC', 'CONNECTIONS']).default('PUBLIC'),
});

export const XOptionsSchema = z.object({
  /** Split body into a thread if it exceeds 280 chars */
  threadMode: z.boolean().default(false),
  /** Reply to an existing X post */
  replyToId: z.string().optional(),
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
]);

// ── Publish Target ─────────────────────────────────────────────────────────────

export const PublishTargetSchema = z.object({
  /** Connected social account to publish to */
  socialAccountId: z.string().uuid('socialAccountId must be a valid UUID'),
  platform: SocialPlatformSchema,
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
