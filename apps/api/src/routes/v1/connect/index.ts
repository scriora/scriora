import crypto from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { prisma, type SocialPlatform } from 'scriora-core';
import { LinkedInAdapter, platformRegistry, type SocialPlatformType } from 'scriora-social';
import { err } from '../../../lib/response.js';

// Ensure real LinkedIn adapter is registered in platform registry
const realLinkedIn = new LinkedInAdapter();
try {
  platformRegistry.register(realLinkedIn);
} catch {
  // Already registered
}

// AES-256-GCM encryption helper for SecretEnvelope
function encryptPayload(
  data: Record<string, unknown>,
  masterKeyHex?: string
): { ciphertext: Uint8Array; keyId: string } {
  const masterKey = masterKeyHex ? Buffer.from(masterKeyHex, 'hex') : crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);

  const plaintext = Buffer.from(JSON.stringify(data), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Combined format: [12-byte IV][16-byte TAG][Encrypted Data]
  const envelopeData = Buffer.concat([iv, tag, encrypted]);
  return { ciphertext: new Uint8Array(envelopeData), keyId: 'master-v1' };
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
    const adapter = platformRegistry.get(platformUpper as unknown as SocialPlatformType);

    if (!adapter || !adapter.getAuthorizationUrl) {
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

    const callbackUrl = `http://localhost:3001/v1/connect/${platform}/callback`;
    const { authorizationUrl } = await adapter.getAuthorizationUrl({
      workspaceId,
      redirectUri: callbackUrl,
      state: stateToken,
      codeVerifier,
    });

    return reply.redirect(authorizationUrl);
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

    if (!query.code || !query.state) {
      return reply
        .status(400)
        .send(
          err(
            'MISSING_OAUTH_PARAMS',
            'VALIDATION_ERROR',
            'Authorization code and state are required',
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

    const platformUpper = platform.toUpperCase() as SocialPlatform;
    const adapter = platformRegistry.get(platformUpper as unknown as SocialPlatformType);

    if (!adapter || !adapter.exchangeCodeForTokens) {
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

    const callbackUrl = `http://localhost:3001/v1/connect/${platform}/callback`;
    const tokens = await adapter.exchangeCodeForTokens({
      code: query.code,
      codeVerifier: decodedState.codeVerifier,
      redirectUri: callbackUrl,
    });

    const masterKeyHex =
      process.env.MASTER_ENCRYPTION_KEY ||
      '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';
    const { ciphertext, keyId } = encryptPayload(
      {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
        accountName: tokens.accountName,
      },
      masterKeyHex
    );

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
      const redirectTarget = new URL(decodedState.postRedirectUri);
      redirectTarget.searchParams.set('connected', '1');
      redirectTarget.searchParams.set('accountId', socialAccount.id);
      redirectTarget.searchParams.set('platform', platformUpper);
      return reply.redirect(redirectTarget.toString());
    }

    return reply.status(200).send({
      success: true,
      message: `Successfully connected ${platformUpper} account: ${tokens.accountName}`,
      socialAccountId: socialAccount.id,
    });
  });
};
