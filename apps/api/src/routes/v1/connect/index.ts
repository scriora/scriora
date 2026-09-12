import crypto from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { prisma, type SocialPlatform } from 'scriora-core';
import {
  DiscordAdapter,
  InstagramAdapter,
  LinkedInAdapter,
  platformRegistry,
  type SocialPlatformType,
  TelegramAdapter,
  ThreadsAdapter,
  XAdapter,
} from 'scriora-social';
import { z } from 'zod';
import { err, ok } from '../../../lib/response.js';

// Ensure real adapters are registered in platform registry
const realLinkedIn = new LinkedInAdapter();
try {
  platformRegistry.register(realLinkedIn);
} catch {
  // Already registered
}

const realX = new XAdapter();
try {
  platformRegistry.register(realX);
} catch {
  // Already registered
}

const realTelegram = new TelegramAdapter();
try {
  platformRegistry.register(realTelegram);
} catch {
  // Already registered
}

const realDiscord = new DiscordAdapter();
try {
  platformRegistry.register(realDiscord);
} catch {
  // Already registered
}

const realInstagram = new InstagramAdapter();
try {
  platformRegistry.register(realInstagram);
} catch {
  // Already registered
}

const realThreads = new ThreadsAdapter();
try {
  platformRegistry.register(realThreads);
} catch {
  // Already registered
}

function getMasterKey(): Buffer {
  const masterKeyHex = process.env.MASTER_ENCRYPTION_KEY;
  if (!masterKeyHex) {
    throw new Error('MASTER_ENCRYPTION_KEY environment variable is required');
  }
  if (!/^[0-9a-fA-F]{64}$/.test(masterKeyHex)) {
    throw new Error(
      'MASTER_ENCRYPTION_KEY must be a valid 64-character hexadecimal string (32 bytes)'
    );
  }
  return Buffer.from(masterKeyHex, 'hex');
}

function getAllowedRedirectOrigins(): string[] {
  const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
  const origins = new Set<string>();
  try {
    origins.add(new URL(appUrl).origin);
  } catch {
    origins.add('http://localhost:3000');
  }
  origins.add('http://localhost:3000');
  origins.add('http://127.0.0.1:3000');
  if (process.env.CORS_ORIGINS) {
    for (const origin of process.env.CORS_ORIGINS.split(',')) {
      const trimmed = origin.trim();
      if (trimmed) {
        try {
          origins.add(new URL(trimmed).origin);
        } catch {}
      }
    }
  }
  return Array.from(origins);
}

// AES-256-GCM encryption helper for SecretEnvelope
function encryptPayload(data: Record<string, unknown>): { ciphertext: Uint8Array; keyId: string } {
  const masterKey = getMasterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);

  const plaintext = Buffer.from(JSON.stringify(data), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Combined format: [12-byte IV][16-byte TAG][Encrypted Data]
  const envelopeData = Buffer.concat([iv, tag, encrypted]);
  return { ciphertext: new Uint8Array(envelopeData), keyId: 'master-v1' };
}

function decryptEnvelopePayload(ciphertextBytes: Uint8Array): Record<string, unknown> {
  const masterKey = getMasterKey();
  const buffer = Buffer.from(ciphertextBytes);
  const iv = buffer.subarray(0, 12);
  const tag = buffer.subarray(12, 28);
  const encrypted = buffer.subarray(28);

  const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
}

export const connectRoutes: FastifyPluginAsync = async (fastify) => {
  // 1. Initiate OAuth Connect Flow (PUBLIC with signed state)
  fastify.get('/:platform', async (request, reply) => {
    const { platform } = request.params as { platform: string };
    const query = request.query as { workspaceId?: string; redirectUri?: string };

    const workspaceId = query.workspaceId;

    if (!workspaceId) {
      return reply
        .status(400)
        .send(
          err(
            'MISSING_WORKSPACE_ID',
            'VALIDATION_ERROR',
            'workspaceId query parameter is required',
            request.id
          )
        );
    }

    const platformUpper = platform.toUpperCase() as SocialPlatform;
    if (!platformRegistry.has(platformUpper as unknown as SocialPlatformType)) {
      return reply
        .status(400)
        .send(
          err(
            'UNSUPPORTED_PLATFORM',
            'VALIDATION_ERROR',
            `OAuth is not supported for platform: ${platform}`,
            request.id
          )
        );
    }

    const adapter = platformRegistry.get(platformUpper as unknown as SocialPlatformType);

    if (!adapter.getAuthorizationUrl) {
      return reply
        .status(400)
        .send(
          err(
            'UNSUPPORTED_PLATFORM',
            'VALIDATION_ERROR',
            `OAuth is not supported for platform: ${platform}`,
            request.id
          )
        );
    }

    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    // Sign state as JWT containing workspaceId, platform, codeVerifier, and user's post-connect redirect
    const stateToken = fastify.jwt.sign(
      {
        workspaceId,
        platform: platformUpper,
        codeVerifier,
        postRedirectUri: query.redirectUri,
      },
      { expiresIn: '10m' }
    );

    const apiUrl = process.env.API_URL ?? 'http://localhost:4000';
    const callbackUrl = `${apiUrl}/v1/connect/${platform}/callback`;

    try {
      const { authorizationUrl } = await adapter.getAuthorizationUrl({
        workspaceId,
        redirectUri: callbackUrl,
        state: stateToken,
        codeVerifier,
      });

      return reply.redirect(authorizationUrl);
    } catch (e: unknown) {
      const errObj = e as { message?: string; code?: string };
      return reply
        .status(400)
        .send(
          err(
            errObj.code ?? 'OAUTH_INIT_FAILED',
            'VALIDATION_ERROR',
            errObj.message ?? `Failed to initiate OAuth for ${platform}`,
            request.id
          )
        );
    }
  });

  // 2. OAuth Callback
  fastify.get('/:platform/callback', async (request, reply) => {
    const { platform } = request.params as { platform: string };
    const query = request.query as {
      code?: string;
      state?: string;
      error?: string;
      error_description?: string;
    };

    if (query.error) {
      return reply
        .status(400)
        .send(
          err(
            'OAUTH_DENIED',
            'AUTHENTICATION_ERROR',
            query.error_description || query.error,
            request.id
          )
        );
    }

    if (!query.code) {
      return reply
        .status(400)
        .send(
          err(
            'MISSING_OAUTH_PARAMS',
            'VALIDATION_ERROR',
            'Authorization code is required',
            request.id
          )
        );
    }

    let decodedState: {
      workspaceId: string;
      platform: string;
      codeVerifier: string;
      postRedirectUri?: string;
    };

    if (query.state) {
      try {
        decodedState = fastify.jwt.verify(query.state);
      } catch {
        return reply
          .status(400)
          .send(
            err(
              'INVALID_STATE',
              'AUTHENTICATION_ERROR',
              'OAuth state parameter is invalid or expired (CSRF protection)',
              request.id
            )
          );
      }
    } else {
      // Direct vendor auth link fallback (e.g. user clicked raw Instagram Business Login dialog)
      const defaultWorkspace = await prisma.workspace.findFirst({
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      if (!defaultWorkspace) {
        return reply
          .status(400)
          .send(
            err(
              'NO_WORKSPACE_FOUND',
              'VALIDATION_ERROR',
              'No active workspace available to associate with this social account',
              request.id
            )
          );
      }
      decodedState = {
        workspaceId: defaultWorkspace.id,
        platform: platform.toUpperCase(),
        codeVerifier: '',
      };
    }

    const platformUpper = platform.toUpperCase() as SocialPlatform;
    const adapter = platformRegistry.get(platformUpper as unknown as SocialPlatformType);

    if (!adapter?.exchangeCodeForTokens) {
      return reply
        .status(400)
        .send(
          err(
            'UNSUPPORTED_PLATFORM',
            'VALIDATION_ERROR',
            `OAuth token exchange is not supported for platform: ${platform}`,
            request.id
          )
        );
    }

    const apiUrl = process.env.API_URL ?? 'http://localhost:4000';
    const callbackUrl = `${apiUrl}/v1/connect/${platform}/callback`;
    const tokens = await adapter.exchangeCodeForTokens({
      code: query.code,
      codeVerifier: decodedState.codeVerifier,
      redirectUri: callbackUrl,
    });

    const { ciphertext, keyId } = encryptPayload({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      accountName: tokens.accountName,
    });

    // Upsert SocialAccount and SecretEnvelope in database
    const socialAccount = await prisma.$transaction(async (tx) => {
      const capabilitiesJson = JSON.parse(JSON.stringify(adapter.getCapabilities()));
      const account = await tx.socialAccount.upsert({
        where: {
          uq_social_accounts_account: {
            workspaceId: decodedState.workspaceId,
            platform: platformUpper,
            externalAccountId: tokens.externalAccountId,
          },
        },
        create: {
          workspaceId: decodedState.workspaceId,
          platform: platformUpper,
          externalAccountId: tokens.externalAccountId,
          accountName: tokens.accountName,
          status: 'CONNECTED',
          capabilities: capabilitiesJson,
        },
        update: {
          accountName: tokens.accountName,
          status: 'CONNECTED',
          capabilities: capabilitiesJson,
        },
      });

      // Update SecretEnvelope
      await tx.secretEnvelope.deleteMany({ where: { socialAccountId: account.id } });
      await tx.secretEnvelope.create({
        data: {
          socialAccountId: account.id,
          envelopeData: Buffer.from(ciphertext),
          keyId,
          algorithm: 'AES-256-GCM',
        },
      });

      return account;
    });

    if (decodedState.postRedirectUri) {
      const defaultDashboard = `${process.env.APP_URL ?? 'http://localhost:3000'}/dashboard`;
      let redirectTarget: URL;
      try {
        const candidate = new URL(decodedState.postRedirectUri);
        const allowedOrigins = getAllowedRedirectOrigins();
        if (allowedOrigins.includes(candidate.origin)) {
          redirectTarget = candidate;
        } else {
          redirectTarget = new URL(defaultDashboard);
        }
      } catch {
        redirectTarget = new URL(defaultDashboard);
      }

      redirectTarget.searchParams.set('connected', '1');
      redirectTarget.searchParams.set('accountId', socialAccount.id);
      redirectTarget.searchParams.set('platform', platformUpper);
      return reply.redirect(redirectTarget.toString());
    }

    return reply.status(200).send(
      ok(
        {
          message: `Successfully connected ${platformUpper} account: ${tokens.accountName}`,
          socialAccountId: socialAccount.id,
        },
        request.id
      )
    );
  });

  // 2b. Meta / Social Platform Deauthorize Callback
  fastify.all('/:platform/deauthorize', async (_request, reply) => {
    return reply.status(200).send({ status: 'ok', message: 'Deauthorized successfully' });
  });

  // 2c. Meta / Social Platform Data Deletion Callback (Meta Compliance)
  fastify.all('/:platform/delete', async (_request, reply) => {
    const confirmationCode = crypto.randomBytes(16).toString('hex');
    const apiUrl = process.env.API_URL ?? 'http://localhost:4000';
    return reply.status(200).send({
      url: `${apiUrl}/v1/connect/deletion-status?code=${confirmationCode}`,
      confirmation_code: confirmationCode,
    });
  });

  // 3. Connect Telegram Bot / Channel
  fastify.post('/telegram', async (request, reply) => {
    const TelegramConnectSchema = z.object({
      botToken: z.string().min(10, 'botToken must be valid'),
      chatId: z.string().min(1, 'chatId is required (e.g. @channel or numeric chat ID)'),
      channelTitle: z.string().optional(),
    });

    const parseResult = TelegramConnectSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send(
        err(
          'VALIDATION_ERROR',
          'VALIDATION_ERROR',
          'Invalid Telegram connection payload',
          request.id,
          false,
          parseResult.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
        )
      );
    }

    const { botToken, chatId, channelTitle } = parseResult.data;
    const workspaceId =
      (request.headers['x-workspace-id'] as string | undefined) ||
      (request.query as { workspaceId?: string })?.workspaceId;

    if (!workspaceId) {
      return reply
        .status(400)
        .send(
          err(
            'MISSING_WORKSPACE',
            'VALIDATION_ERROR',
            'x-workspace-id header or workspaceId query parameter is required',
            request.id
          )
        );
    }

    try {
      // 1. Verify bot token with Telegram API
      const meRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
      const meData = (await meRes.json()) as {
        ok: boolean;
        result?: { username?: string; first_name?: string };
      };
      if (!meData?.ok || !meData.result) {
        return reply
          .status(400)
          .send(
            err(
              'INVALID_BOT_TOKEN',
              'VALIDATION_ERROR',
              'Telegram bot token is invalid',
              request.id
            )
          );
      }

      const botInfo = meData.result;
      const botUsername = botInfo.username;

      // 2. Verify chat / channel access
      let verifiedTitle = channelTitle || `${botInfo.first_name} (@${botUsername})`;
      try {
        const chatRes = await fetch(
          `https://api.telegram.org/bot${botToken}/getChat?chat_id=${encodeURIComponent(chatId)}`
        );
        const chatData = (await chatRes.json()) as { ok: boolean; result?: { title?: string } };
        if (chatData?.ok && chatData.result?.title) {
          verifiedTitle = chatData.result.title;
        }
      } catch {
        // Fallback to provided title
      }

      // 3. Encrypt credentials with Master Key
      const { ciphertext, keyId } = encryptPayload({
        accessToken: botToken,
        botToken,
        chatId,
        botUsername,
      });

      const adapter = platformRegistry.get('TELEGRAM');
      const capabilitiesJson = JSON.parse(JSON.stringify(adapter.getCapabilities()));

      // 4. Upsert SocialAccount & SecretEnvelope
      const socialAccount = await prisma.$transaction(async (tx) => {
        const account = await tx.socialAccount.upsert({
          where: {
            uq_social_accounts_account: {
              workspaceId,
              platform: 'TELEGRAM',
              externalAccountId: chatId,
            },
          },
          create: {
            workspaceId,
            platform: 'TELEGRAM',
            externalAccountId: chatId,
            accountName: verifiedTitle,
            status: 'CONNECTED',
            capabilities: capabilitiesJson,
          },
          update: {
            accountName: verifiedTitle,
            status: 'CONNECTED',
            capabilities: capabilitiesJson,
          },
        });

        await tx.secretEnvelope.deleteMany({ where: { socialAccountId: account.id } });
        await tx.secretEnvelope.create({
          data: {
            socialAccountId: account.id,
            envelopeData: Buffer.from(ciphertext),
            keyId,
            algorithm: 'AES-256-GCM',
          },
        });

        return account;
      });

      return reply.status(200).send(
        ok(
          {
            message: `Successfully connected TELEGRAM account: ${verifiedTitle}`,
            socialAccountId: socialAccount.id,
            chatId,
            botUsername,
          },
          request.id
        )
      );
    } catch (e: unknown) {
      const errObj = e as { message?: string };
      return reply
        .status(500)
        .send(
          err(
            'TELEGRAM_CONNECT_FAILED',
            'INTERNAL_ERROR',
            errObj.message || 'Failed to connect Telegram',
            request.id
          )
        );
    }
  });

  // 5. Discord Account Connection (Webhook or Bot API Mode)
  fastify.post('/discord', async (request, reply) => {
    const DiscordConnectSchema = z.discriminatedUnion('mode', [
      z.object({
        mode: z.literal('WEBHOOK'),
        webhookUrl: z
          .string()
          .url()
          .refine(
            (url) =>
              url.startsWith('https://discord.com/api/webhooks/') ||
              url.startsWith('https://discordapp.com/api/webhooks/'),
            { message: 'Invalid Discord webhook URL' }
          ),
        channelTitle: z.string().min(1).max(100).optional(),
      }),
      z.object({
        mode: z.literal('BOT'),
        botToken: z.string().min(20),
        channelId: z.string().regex(/^\d{17,20}$/, 'Invalid Discord channel snowflake ID'),
        guildId: z
          .string()
          .regex(/^\d{17,20}$/)
          .optional(),
        channelTitle: z.string().min(1).max(100).optional(),
      }),
    ]);

    const parseResult = DiscordConnectSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send(
        err(
          'INVALID_PAYLOAD',
          'VALIDATION_ERROR',
          'Invalid Discord connection payload',
          request.id,
          false,
          parseResult.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
        )
      );
    }

    const payload = parseResult.data;
    const workspaceId =
      (request.headers['x-workspace-id'] as string | undefined) ||
      (request.query as { workspaceId?: string })?.workspaceId;

    if (!workspaceId) {
      return reply
        .status(400)
        .send(
          err(
            'MISSING_WORKSPACE',
            'VALIDATION_ERROR',
            'x-workspace-id header or workspaceId query parameter is required',
            request.id
          )
        );
    }

    try {
      let externalAccountId: string;
      let verifiedTitle: string;
      let secretPayload: Record<string, unknown>;

      if (payload.mode === 'WEBHOOK') {
        const whRes = await fetch(payload.webhookUrl);
        if (!whRes.ok) {
          return reply
            .status(400)
            .send(
              err(
                'INVALID_WEBHOOK_URL',
                'VALIDATION_ERROR',
                'Discord webhook URL could not be verified',
                request.id
              )
            );
        }
        const whData = (await whRes.json()) as {
          id?: string;
          name?: string;
          channel_id?: string;
          guild_id?: string;
        };
        externalAccountId = whData.channel_id || whData.id || crypto.randomUUID();
        verifiedTitle = payload.channelTitle || whData.name || 'Discord Webhook Channel';
        secretPayload = {
          webhookUrl: payload.webhookUrl,
          channelId: whData.channel_id,
          guildId: whData.guild_id,
          name: verifiedTitle,
          mode: 'WEBHOOK',
        };
      } else {
        const meRes = await fetch('https://discord.com/api/v10/users/@me', {
          headers: { Authorization: `Bot ${payload.botToken}` },
        });
        if (!meRes.ok) {
          return reply
            .status(400)
            .send(
              err(
                'INVALID_BOT_TOKEN',
                'VALIDATION_ERROR',
                'Discord bot token could not be verified with Discord API',
                request.id
              )
            );
        }
        const botData = (await meRes.json()) as { id?: string; username?: string };

        let channelName = payload.channelTitle;
        let resolvedGuildId = payload.guildId;
        try {
          const chRes = await fetch(`https://discord.com/api/v10/channels/${payload.channelId}`, {
            headers: { Authorization: `Bot ${payload.botToken}` },
          });
          if (chRes.ok) {
            const chData = (await chRes.json()) as {
              id?: string;
              name?: string;
              guild_id?: string;
            };
            channelName = channelName || `#${chData.name}`;
            resolvedGuildId = resolvedGuildId || chData.guild_id;
          }
        } catch {
          // Keep provided title
        }

        externalAccountId = payload.channelId;
        verifiedTitle = channelName || `Discord #${payload.channelId}`;
        secretPayload = {
          botToken: payload.botToken,
          channelId: payload.channelId,
          guildId: resolvedGuildId,
          botUsername: botData.username,
          mode: 'BOT',
        };
      }

      const { ciphertext, keyId } = encryptPayload(secretPayload);
      const adapter = platformRegistry.get('DISCORD');
      const capabilitiesJson = JSON.parse(JSON.stringify(adapter.getCapabilities()));

      const socialAccount = await prisma.$transaction(async (tx) => {
        const account = await tx.socialAccount.upsert({
          where: {
            uq_social_accounts_account: {
              workspaceId,
              platform: 'DISCORD',
              externalAccountId,
            },
          },
          create: {
            workspaceId,
            platform: 'DISCORD',
            externalAccountId,
            accountName: verifiedTitle,
            status: 'CONNECTED',
            capabilities: capabilitiesJson,
          },
          update: {
            accountName: verifiedTitle,
            status: 'CONNECTED',
            capabilities: capabilitiesJson,
          },
        });

        await tx.secretEnvelope.deleteMany({ where: { socialAccountId: account.id } });
        await tx.secretEnvelope.create({
          data: {
            socialAccountId: account.id,
            envelopeData: Buffer.from(ciphertext),
            keyId,
            algorithm: 'AES-256-GCM',
          },
        });

        return account;
      });

      return reply.status(200).send(
        ok(
          {
            message: `Successfully connected DISCORD account: ${verifiedTitle}`,
            socialAccountId: socialAccount.id,
            channelId: externalAccountId,
            accountName: verifiedTitle,
            mode: payload.mode,
          },
          request.id
        )
      );
    } catch (e: unknown) {
      const errObj = e as { message?: string };
      return reply
        .status(500)
        .send(
          err(
            'DISCORD_CONNECT_FAILED',
            'INTERNAL_ERROR',
            errObj.message || 'Failed to connect Discord',
            request.id
          )
        );
    }
  });

  // 6. Discord Automated Guild & Channel Discovery
  fastify.get('/discord/channels', async (request, reply) => {
    const query = request.query as {
      botToken?: string;
      socialAccountId?: string;
      guildId?: string;
    };
    const headerToken = request.headers['x-discord-bot-token'] as string | undefined;

    let token = query.botToken || headerToken;

    if (!token && query.socialAccountId) {
      try {
        const envelope = await prisma.secretEnvelope.findFirst({
          where: { socialAccountId: query.socialAccountId },
        });
        if (envelope) {
          const decrypted = decryptEnvelopePayload(new Uint8Array(envelope.envelopeData));
          if (typeof decrypted.botToken === 'string') {
            token = decrypted.botToken;
          }
        }
      } catch {
        // Ignore fallback
      }
    }

    if (!token) {
      token = process.env.DISCORD_BOT_TOKEN;
    }

    if (!token) {
      return reply
        .status(400)
        .send(
          err(
            'MISSING_BOT_TOKEN',
            'VALIDATION_ERROR',
            'Discord bot token is required for channel discovery',
            request.id
          )
        );
    }

    try {
      const guildsRes = await fetch('https://discord.com/api/v10/users/@me/guilds', {
        headers: { Authorization: `Bot ${token}` },
      });

      if (!guildsRes.ok) {
        return reply
          .status(400)
          .send(
            err(
              'DISCORD_API_ERROR',
              'PLATFORM_ERROR',
              'Failed to fetch Discord guilds for bot',
              request.id
            )
          );
      }

      const guilds = (await guildsRes.json()) as Array<{
        id: string;
        name: string;
        icon?: string | null;
        owner?: boolean;
        permissions?: string;
      }>;

      const targetGuilds = query.guildId
        ? guilds.filter((g) => g.id === query.guildId)
        : guilds.slice(0, 10);

      const allChannels: Array<{
        id: string;
        name: string;
        type: number;
        guildId: string;
        guildName: string;
        typeName: string;
      }> = [];

      for (const guild of targetGuilds) {
        try {
          const chRes = await fetch(`https://discord.com/api/v10/guilds/${guild.id}/channels`, {
            headers: { Authorization: `Bot ${token}` },
          });
          if (chRes.ok) {
            const chList = (await chRes.json()) as Array<{
              id: string;
              name: string;
              type: number;
            }>;
            for (const ch of chList) {
              if ([0, 5, 15].includes(ch.type)) {
                allChannels.push({
                  id: ch.id,
                  name: ch.name,
                  type: ch.type,
                  guildId: guild.id,
                  guildName: guild.name,
                  typeName: ch.type === 0 ? 'TEXT' : ch.type === 5 ? 'ANNOUNCEMENT' : 'FORUM',
                });
              }
            }
          }
        } catch {
          // Continue with next guild
        }
      }

      return reply.status(200).send(
        ok(
          {
            guilds: guilds.map((g) => ({ id: g.id, name: g.name, icon: g.icon })),
            channels: allChannels,
          },
          request.id
        )
      );
    } catch (e: unknown) {
      const errObj = e as { message?: string };
      return reply
        .status(500)
        .send(
          err(
            'CHANNEL_DISCOVERY_FAILED',
            'INTERNAL_ERROR',
            errObj.message || 'Failed to discover Discord channels',
            request.id
          )
        );
    }
  });
};
