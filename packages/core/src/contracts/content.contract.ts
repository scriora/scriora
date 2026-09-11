import { z } from 'zod';

export const CreateContentSchema = z.object({
  workspaceId: z.string().uuid(),
  title: z.string().min(1).max(255).optional(),
  body: z.string().min(1),
  createdByUserId: z.string().uuid().optional(),
});
export type CreateContentDTO = z.infer<typeof CreateContentSchema>;

export const CreateContentVariantSchema = z.object({
  workspaceId: z.string().uuid(),
  contentId: z.string().uuid(),
  platform: z
    .enum([
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
    ])
    .optional(),
  socialAccountId: z.string().uuid().optional(),
  body: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type CreateContentVariantDTO = z.infer<typeof CreateContentVariantSchema>;

export const ContentResponseSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  title: z.string().nullable(),
  body: z.string().nullable(),
  status: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type ContentResponseVO = z.infer<typeof ContentResponseSchema>;
