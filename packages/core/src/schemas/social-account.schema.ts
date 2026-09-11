/**
 * packages/core/src/schemas/social-account.schema.ts
 * Canonical Zod schemas for Social Account management and OAuth flows.
 */

import { z } from 'zod';
import { SocialPlatformSchema } from './publish.schema.js';

// ── OAuth Connect ──────────────────────────────────────────────────────────────

export const OAuthInitSchema = z.object({
  workspaceId: z.string().uuid('workspaceId must be a valid UUID'),
  /** Where to redirect after successful OAuth — must match workspace whitelist */
  redirectUri: z.string().url('redirectUri must be a valid URL'),
  platform: SocialPlatformSchema,
});

export const OAuthCallbackSchema = z.object({
  /** Authorization code from platform */
  code: z.string().min(1, 'Authorization code is required'),
  /** JWT-signed state param — verified for CSRF before token exchange */
  state: z.string().min(1, 'State parameter is required'),
  /** Only present on denial — abort OAuth flow */
  error: z.string().optional(),
  errorDescription: z.string().optional(),
});

// ── Account Management ─────────────────────────────────────────────────────────

export const SocialAccountStatusSchema = z.enum([
  'ACTIVE',
  'TOKEN_EXPIRED',
  'REVOKED',
  'RATE_LIMITED',
  'SUSPENDED',
]);

// ── Approval Decision ──────────────────────────────────────────────────────────

export const ApprovalDecisionSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  feedback: z.string().max(2000).optional(),
});

// ── Inferred Types ─────────────────────────────────────────────────────────────

export type OAuthInitInput = z.infer<typeof OAuthInitSchema>;
export type OAuthCallbackInput = z.infer<typeof OAuthCallbackSchema>;
export type ApprovalDecisionInput = z.infer<typeof ApprovalDecisionSchema>;
