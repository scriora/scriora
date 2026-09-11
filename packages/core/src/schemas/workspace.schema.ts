/**
 * packages/core/src/schemas/workspace.schema.ts
 * Canonical Zod schemas for Workspace domain — used by apps/api request validation.
 * Single source of truth: all downstream packages import from here.
 */

import { z } from 'zod';

// ── Shared primitives ─────────────────────────────────────────────────────────

export const WorkspaceIdSchema = z.string().uuid('workspace_id must be a valid UUID');

export const WorkspaceSlugSchema = z
  .string()
  .min(3, 'Slug must be at least 3 characters')
  .max(48, 'Slug must be at most 48 characters')
  .regex(/^[a-z0-9-]+$/, 'Slug may only contain lowercase letters, numbers, and hyphens');

// ── Operating Mode ────────────────────────────────────────────────────────────

export const OperatingModeSchema = z.enum(['CLASSIC', 'AGENTIC']);

// ── Workspace Purpose ─────────────────────────────────────────────────────────

export const WorkspacePurposeSchema = z.enum(['PERSONAL', 'WORK', 'CLIENT', 'AGENT']);

// ── Member Role ───────────────────────────────────────────────────────────────

export const WorkspaceRoleSchema = z.enum(['OWNER', 'ADMIN', 'EDITOR', 'VIEWER', 'EXTERNAL_APPROVER']);

// ── Request Schemas ───────────────────────────────────────────────────────────

export const CreateWorkspaceSchema = z.object({
  name: z.string().min(2, 'Workspace name too short').max(100),
  slug: WorkspaceSlugSchema,
  purpose: WorkspacePurposeSchema.default('WORK'),
  operatingMode: OperatingModeSchema.default('CLASSIC'),
  requiresApproval: z.boolean().default(false),
  description: z.string().max(500).optional(),
});

export const UpdateWorkspaceSchema = CreateWorkspaceSchema.partial().omit({ slug: true });

export const InviteMemberSchema = z.object({
  email: z.string().email('Must be a valid email address'),
  role: WorkspaceRoleSchema.exclude(['OWNER']),
});

// ── Response Types ────────────────────────────────────────────────────────────

export type CreateWorkspaceInput = z.infer<typeof CreateWorkspaceSchema>;
export type UpdateWorkspaceInput = z.infer<typeof UpdateWorkspaceSchema>;
export type InviteMemberInput = z.infer<typeof InviteMemberSchema>;
