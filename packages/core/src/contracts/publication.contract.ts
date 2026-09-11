import { z } from 'zod';

export const CreatePublicationSchema = z.object({
  workspaceId: z.string().uuid(),
  contentVariantId: z.string().uuid(),
  socialAccountId: z.string().uuid(),
  scheduledAt: z.coerce.date().optional(),
  timezone: z.string().default('UTC'),
  createdByUserId: z.string().uuid().optional(),
});
export type CreatePublicationDTO = z.infer<typeof CreatePublicationSchema>;

export const PublicationResponseSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  contentVariantId: z.string().uuid(),
  socialAccountId: z.string().uuid(),
  status: z.string(),
  scheduledAt: z.date().nullable(),
  publishedAt: z.date().nullable(),
  externalPostId: z.string().nullable(),
  externalPostUrl: z.string().nullable(),
  idempotencyKey: z.string(),
  fingerprint: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type PublicationResponseVO = z.infer<typeof PublicationResponseSchema>;
