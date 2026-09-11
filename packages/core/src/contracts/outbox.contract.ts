import { z } from 'zod';

export const OutboxCommandPayloadSchema = z.object({
  publicationId: z.string().uuid(),
  publishAttemptId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  socialAccountId: z.string().uuid(),
  contentVariantId: z.string().uuid(),
  platform: z.string(),
  body: z.string().nullable(),
  scheduledAt: z.string().nullable(),
  fingerprint: z.string(),
  idempotencyKey: z.string(),
});
export type OutboxCommandPayload = z.infer<typeof OutboxCommandPayloadSchema>;

export const OutboxCommandResponseSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  publicationId: z.string().uuid(),
  publishAttemptId: z.string().uuid(),
  commandType: z.string(),
  status: z.string(),
  availableAt: z.date(),
  attempts: z.number(),
  createdAt: z.date(),
});
export type OutboxCommandResponseVO = z.infer<typeof OutboxCommandResponseSchema>;
