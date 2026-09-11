// Media Contract — defines the interface boundary
// All callers (scriora-api, scriora-worker) use only this interface
// Reference: scriora-docs/architecture/SCRIORA_MEDIA_FRAMEWORK.md

import { z } from 'zod';

// Supported media types
export const MediaTypeSchema = z.enum(['IMAGE', 'VIDEO', 'PDF', 'AUDIO']);
export type MediaType = z.infer<typeof MediaTypeSchema>;

// Supported aspect ratios (canonical 4 only)
export const AspectRatioSchema = z.enum(['1:1', '4:5', '16:9', '9:16']);
export type AspectRatio = z.infer<typeof AspectRatioSchema>;

// Media asset state (mirrors SCRIORA_STATE_AND_ERROR_MODEL.md)
export const MediaAssetStateSchema = z.enum([
  'REGISTERED',
  'UPLOADED',
  'VALIDATING',
  'PROCESSING',
  'READY',
  'FAILED_RETRYABLE',
  'FAILED_PERMANENT',
  'EXPIRED',
  'DELETED',
]);
export type MediaAssetState = z.infer<typeof MediaAssetStateSchema>;

// Presigned upload request
export const PresignedUploadRequestSchema = z.object({
  workspaceId: z.string().uuid(),
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1),
  fileSizeBytes: z.number().positive(),
});
export type PresignedUploadRequest = z.infer<typeof PresignedUploadRequestSchema>;

// Presigned upload response
export const PresignedUploadResponseSchema = z.object({
  assetId: z.string().uuid(),
  uploadUrl: z.string().url(),
  expiresAt: z.string().datetime(),
});
export type PresignedUploadResponse = z.infer<typeof PresignedUploadResponseSchema>;
