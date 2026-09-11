/**
 * packages/core/src/schemas/api-response.schema.ts
 * Canonical success/error envelope schemas — enforces Section 7 API contracts.
 * All API responses must pass through these schemas.
 */

import { z } from 'zod';

// ── Pagination (Cursor-based — decided 2026-09-11) ────────────────────────────

export const PaginationQuerySchema = z.object({
  /** Opaque cursor from previous response meta.nextCursor */
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  /** Sort direction */
  order: z.enum(['asc', 'desc']).default('desc'),
});

// ── Meta block (included in every response) ────────────────────────────────────

export const ResponseMetaSchema = z.object({
  requestId: z.string(),
  timestamp: z.string().datetime(),
  /** Only present on paginated list endpoints */
  nextCursor: z.string().optional(),
  hasMore: z.boolean().optional(),
  total: z.number().int().optional(),
});

// ── Success Envelope ──────────────────────────────────────────────────────────

export const successResponse = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
    meta: ResponseMetaSchema,
  });

// ── Error Categories (RFC 7807 / 9457 aligned) ────────────────────────────────

export const ErrorCategorySchema = z.enum([
  'VALIDATION_ERROR',
  'AUTHENTICATION_ERROR',
  'AUTHORIZATION_ERROR',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'PLATFORM_ERROR',
  'INTERNAL_ERROR',
  'BUSINESS_RULE_VIOLATION',
]);

// ── Error Envelope ────────────────────────────────────────────────────────────

export const ErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    category: ErrorCategorySchema,
    message: z.string(),
    retryable: z.boolean(),
    retryAfter: z.number().int().optional(),
    details: z
      .array(
        z.object({
          field: z.string().optional(),
          message: z.string(),
          code: z.string().optional(),
        })
      )
      .optional(),
  }),
  meta: ResponseMetaSchema.pick({ requestId: true, timestamp: true }),
});

// ── Inferred Types ─────────────────────────────────────────────────────────────

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;
export type ResponseMeta = z.infer<typeof ResponseMetaSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
export type ErrorCategory = z.infer<typeof ErrorCategorySchema>;
