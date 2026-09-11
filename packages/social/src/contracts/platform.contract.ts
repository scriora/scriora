import { z } from 'zod';

export const SocialPlatformTypeSchema = z.enum([
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

export type SocialPlatformType = z.infer<typeof SocialPlatformTypeSchema>;

export const PlatformCapabilitiesSchema = z.object({
  supportsText: z.boolean(),
  supportsImage: z.boolean(),
  supportsVideo: z.boolean(),
  supportsCarousel: z.boolean(),
  supportsThreads: z.boolean(),
  supportsScheduling: z.boolean(),
  supportsMetrics: z.boolean(),
  supportsWebhooks: z.boolean(),
  maxTextLength: z.number().int(),
});

export type PlatformCapabilities = z.infer<typeof PlatformCapabilitiesSchema>;

export const PublishRequestSchema = z.object({
  workspaceId: z.string().uuid(),
  accountId: z.string(),
  text: z.string().nullable().optional(),
  mediaUrls: z.array(z.string().url()).default([]),
  idempotencyKey: z.string().min(1),
  fingerprint: z.string().length(64),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type PublishRequest = z.infer<typeof PublishRequestSchema>;

export const PublishResultSchema = z.object({
  status: z.enum(['SUCCEEDED', 'PLATFORM_PENDING', 'UNKNOWN_EXTERNAL_STATE', 'FAILED']),
  externalPostId: z.string().optional(),
  externalPostUrl: z.string().optional(),
  platformMetadata: z.record(z.string(), z.unknown()).default({}),
  publishedAt: z.date().optional(),
  operationId: z.string(),
});

export type PublishResult = z.infer<typeof PublishResultSchema>;

export interface OAuthInitParams {
  workspaceId: string;
  redirectUri: string;
  state: string;
  codeVerifier: string;
}

export interface OAuthInitResult {
  authorizationUrl: string;
}

export interface OAuthCallbackParams {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}

export interface TokenExchangeResult {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  refreshTokenExpiresIn?: number;
  externalAccountId: string;
  accountName: string;
  rawPayload?: Record<string, unknown>;
}

export interface PlatformAdapter {
  readonly platform: SocialPlatformType;
  getCapabilities(): PlatformCapabilities;
  publish(request: PublishRequest): Promise<PublishResult>;
  verify(externalPostId: string): Promise<boolean>;
  getAuthorizationUrl?(params: OAuthInitParams): Promise<OAuthInitResult>;
  exchangeCodeForTokens?(params: OAuthCallbackParams): Promise<TokenExchangeResult>;
  refreshAccessToken?(
    refreshToken: string
  ): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number }>;
}
