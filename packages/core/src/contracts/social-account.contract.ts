import { z } from 'zod';

export const ConnectSocialAccountSchema = z.object({
  workspaceId: z.string().uuid(),
  platform: z.enum([
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
  ]),
  externalAccountId: z.string().min(1),
  accountName: z.string().min(1),
  capabilities: z.record(z.string(), z.unknown()).default({}),
});
export type ConnectSocialAccountDTO = z.infer<typeof ConnectSocialAccountSchema>;
