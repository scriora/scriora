import crypto from 'node:crypto';
import argon2 from 'argon2';
import type { FastifyInstance, FastifyPluginAsync, FastifyReply } from 'fastify';
import { prisma } from 'scriora-core';
import { z } from 'zod';
import {
  buildMagicLinkVerifyUrl,
  deliverMagicLink,
} from '../../../lib/magic-link-mailer.js';
import { err, ok } from '../../../lib/response.js';
import { verifyAuth } from '../../../middleware/auth.js';

const AUTH_SENSITIVE_RATE_LIMIT = { max: 8, timeWindow: '1 minute' as const };
const AUTH_REFRESH_RATE_LIMIT = { max: 30, timeWindow: '1 minute' as const };
const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;

const RegisterSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(100),
  password: z.string().min(8).max(200),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const MagicLinkRequestSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).optional(),
});

const VerifyQuerySchema = z.object({
  token: z.string().min(1, 'Token parameter is required'),
});

const RefreshTokenBodySchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
  });
}

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  try {
    return await argon2.verify(storedHash, password);
  } catch {
    return false;
  }
}

function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function createRefreshToken(fastify: FastifyInstance, userId: string): string {
  return fastify.jwt.sign(
    { sub: userId, type: 'refresh', jti: crypto.randomUUID() },
    { expiresIn: '30d' }
  );
}

function setRefreshCookie(reply: FastifyReply, refreshToken: string): void {
  reply.setCookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/v1/auth',
    maxAge: REFRESH_TTL_SECONDS,
  });
}

async function persistRefreshSession(
  fastify: FastifyInstance,
  reply: FastifyReply,
  userId: string
): Promise<string> {
  const refreshToken = createRefreshToken(fastify, userId);
  await prisma.refreshSession.create({
    data: {
      userId,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000),
    },
  });
  setRefreshCookie(reply, refreshToken);
  return refreshToken;
}

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  // 1. Magic Link Request (AD-11)
  fastify.post(
    '/magic-link',
    { config: { rateLimit: AUTH_SENSITIVE_RATE_LIMIT } },
    async (request, reply) => {
      const parseResult = MagicLinkRequestSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply
          .status(400)
          .send(err('VALIDATION_ERROR', 'VALIDATION_ERROR', 'Invalid email address', request.id));
      }

      const { email, name } = parseResult.data;
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins
      const verifyUrl = buildMagicLinkVerifyUrl(rawToken);

      const user = await prisma.user.findUnique({ where: { email } });

      if (!user) {
        await prisma.$transaction(async (tx) => {
          const newUser = await tx.user.create({
            data: {
              email,
              name: name || email.split('@')[0] || 'User',
              authProvider: 'MAGIC_LINK',
              magicLinkTokenHash: tokenHash,
              magicLinkExpiresAt: expiresAt,
            },
          });

          // Create initial default workspace
          const defaultSlug = `${newUser.name.toLowerCase().replace(/[^a-z0-9]/g, '')}-${crypto.randomBytes(3).toString('hex')}`;
          const workspace = await tx.workspace.create({
            data: {
              name: `${newUser.name}'s Workspace`,
              slug: defaultSlug,
              ownerUserId: newUser.id,
            },
          });

          await tx.workspaceMember.create({
            data: {
              workspaceId: workspace.id,
              userId: newUser.id,
              workspaceRole: 'OWNER',
            },
          });
        });
      } else {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            magicLinkTokenHash: tokenHash,
            magicLinkExpiresAt: expiresAt,
          },
        });
      }

      const delivery = await deliverMagicLink({ email, url: verifyUrl, expiresAt });
      const isDev = process.env.NODE_ENV !== 'production';
      return reply.status(200).send(
        ok(
          {
            message: 'Magic login link generated. Check your inbox.',
            email,
            delivery,
            ...(isDev ? { devMagicLink: verifyUrl } : {}),
          },
          request.id
        )
      );
    }
  );

  // 2. Verify Magic Link
  fastify.get('/verify', async (request, reply) => {
    const parseResult = VerifyQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply
        .status(400)
        .send(err('MISSING_TOKEN', 'VALIDATION_ERROR', 'Token parameter is required', request.id));
    }
    const { token } = parseResult.data;

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const user = await prisma.user.findFirst({
      where: {
        magicLinkTokenHash: tokenHash,
        magicLinkExpiresAt: { gt: new Date() },
      },
    });

    if (!user) {
      return reply
        .status(401)
        .send(
          err(
            'INVALID_OR_EXPIRED_TOKEN',
            'AUTHENTICATION_ERROR',
            'Magic link is invalid or expired',
            request.id
          )
        );
    }

    const verifiedAt = new Date();
    const claimed = await prisma.user.updateMany({
      where: {
        id: user.id,
        magicLinkTokenHash: tokenHash,
        magicLinkExpiresAt: { gt: verifiedAt },
      },
      data: {
        magicLinkTokenHash: null,
        magicLinkExpiresAt: null,
        emailVerifiedAt: user.emailVerifiedAt || verifiedAt,
        lastLoginAt: verifiedAt,
      },
    });
    if (claimed.count !== 1) {
      return reply
        .status(401)
        .send(
          err(
            'INVALID_OR_EXPIRED_TOKEN',
            'AUTHENTICATION_ERROR',
            'Magic link is invalid or expired',
            request.id
          )
        );
    }

    const accessToken = fastify.jwt.sign({ sub: user.id, email: user.email }, { expiresIn: '15m' });
    await persistRefreshSession(fastify, reply, user.id);

    return reply.status(200).send(
      ok(
        {
          accessToken,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
          },
        },
        request.id
      )
    );
  });

  // 3. Register with Email + Password
  fastify.post(
    '/register',
    { config: { rateLimit: AUTH_SENSITIVE_RATE_LIMIT } },
    async (request, reply) => {
      const parseResult = RegisterSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply
          .status(400)
          .send(
            err(
              'VALIDATION_ERROR',
              'VALIDATION_ERROR',
              'Invalid registration parameters',
              request.id
            )
          );
      }

      const { email, name, password } = parseResult.data;
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        return reply
          .status(409)
          .send(
            err('USER_EXISTS', 'CONFLICT', 'A user with this email already exists', request.id)
          );
      }

      const hashedPassword = await hashPassword(password);

      const user = await prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: {
            email,
            name,
            authProvider: 'LOCAL',
            passwordHash: hashedPassword,
            emailVerifiedAt: new Date(),
          },
        });

        const defaultSlug = `${name.toLowerCase().replace(/[^a-z0-9]/g, '')}-${crypto.randomBytes(3).toString('hex')}`;
        const workspace = await tx.workspace.create({
          data: {
            name: `${name}'s Workspace`,
            slug: defaultSlug,
            ownerUserId: newUser.id,
          },
        });

        await tx.workspaceMember.create({
          data: {
            workspaceId: workspace.id,
            userId: newUser.id,
            workspaceRole: 'OWNER',
          },
        });

        return newUser;
      });

      const accessToken = fastify.jwt.sign(
        { sub: user.id, email: user.email },
        { expiresIn: '15m' }
      );
      await persistRefreshSession(fastify, reply, user.id);

      return reply.status(201).send(
        ok(
          {
            accessToken,
            user: {
              id: user.id,
              email: user.email,
              name: user.name,
            },
          },
          request.id
        )
      );
    }
  );

  // 4. Login with Email + Password
  fastify.post(
    '/login',
    { config: { rateLimit: AUTH_SENSITIVE_RATE_LIMIT } },
    async (request, reply) => {
      const parseResult = LoginSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply
          .status(400)
          .send(
            err('VALIDATION_ERROR', 'VALIDATION_ERROR', 'Invalid login parameters', request.id)
          );
      }

      const { email, password } = parseResult.data;
      const user = await prisma.user.findUnique({ where: { email } });

      const isPasswordValid = user?.passwordHash
        ? await verifyPassword(password, user.passwordHash)
        : false;

      if (!user?.passwordHash || !isPasswordValid) {
        return reply
          .status(401)
          .send(
            err(
              'INVALID_CREDENTIALS',
              'AUTHENTICATION_ERROR',
              'Invalid email or password',
              request.id
            )
          );
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      const accessToken = fastify.jwt.sign(
        { sub: user.id, email: user.email },
        { expiresIn: '15m' }
      );
      await persistRefreshSession(fastify, reply, user.id);

      return reply.status(200).send(
        ok(
          {
            accessToken,
            user: {
              id: user.id,
              email: user.email,
              name: user.name,
            },
          },
          request.id
        )
      );
    }
  );

  // 5. Refresh token
  fastify.post(
    '/refresh',
    { config: { rateLimit: AUTH_REFRESH_RATE_LIMIT } },
    async (request, reply) => {
      const cookieToken = request.cookies.refreshToken;
      let bodyToken: string | undefined;

      if (request.body !== undefined && request.body !== null) {
        const bodyResult = RefreshTokenBodySchema.safeParse(request.body);
        if (!bodyResult.success) {
          if (!cookieToken) {
            return reply
              .status(400)
              .send(
                err(
                  'VALIDATION_ERROR',
                  'VALIDATION_ERROR',
                  'Invalid refresh token payload',
                  request.id
                )
              );
          }
        } else {
          bodyToken = bodyResult.data.refreshToken;
        }
      }

      const token = cookieToken || bodyToken;

      if (!token) {
        return reply
          .status(401)
          .send(
            err(
              'MISSING_REFRESH_TOKEN',
              'AUTHENTICATION_ERROR',
              'Refresh token is missing',
              request.id
            )
          );
      }

      try {
        const decoded = fastify.jwt.verify<{ sub: string; type?: string }>(token);
        if (decoded.type !== 'refresh') {
          return reply
            .status(401)
            .send(
              err(
                'INVALID_TOKEN_TYPE',
                'AUTHENTICATION_ERROR',
                'Not a valid refresh token',
                request.id
              )
            );
        }

        const user = await prisma.user.findUnique({ where: { id: decoded.sub } });
        if (!user) {
          return reply
            .status(401)
            .send(
              err('USER_NOT_FOUND', 'AUTHENTICATION_ERROR', 'User no longer exists', request.id)
            );
        }

        const presentedTokenHash = hashRefreshToken(token);
        const presented = await prisma.refreshSession.findUnique({
          where: { tokenHash: presentedTokenHash },
        });
        if (
          !presented ||
          presented.userId !== user.id ||
          presented.revokedAt ||
          presented.expiresAt <= new Date()
        ) {
          return reply
            .status(401)
            .send(
              err(
                'INVALID_REFRESH_TOKEN',
                'AUTHENTICATION_ERROR',
                'Refresh token is expired or revoked',
                request.id
              )
            );
        }

        const newAccessToken = fastify.jwt.sign(
          { sub: user.id, email: user.email },
          { expiresIn: '15m' }
        );
        const nextRefresh = createRefreshToken(fastify, user.id);
        const rotatedAt = new Date();

        await prisma.$transaction(async (tx) => {
          const claimed = await tx.refreshSession.updateMany({
            where: {
              id: presented.id,
              userId: user.id,
              tokenHash: presentedTokenHash,
              revokedAt: null,
              expiresAt: { gt: rotatedAt },
            },
            data: { revokedAt: rotatedAt },
          });
          if (claimed.count !== 1) {
            throw new Error('REFRESH_SESSION_ALREADY_ROTATED');
          }

          const replacement = await tx.refreshSession.create({
            data: {
              userId: user.id,
              tokenHash: hashRefreshToken(nextRefresh),
              expiresAt: new Date(rotatedAt.getTime() + REFRESH_TTL_SECONDS * 1000),
            },
            select: { id: true },
          });
          await tx.refreshSession.update({
            where: { id: presented.id },
            data: { replacedBy: replacement.id },
          });
        });
        setRefreshCookie(reply, nextRefresh);
        return reply.status(200).send(ok({ accessToken: newAccessToken }, request.id));
      } catch {
        return reply
          .status(401)
          .send(
            err(
              'INVALID_REFRESH_TOKEN',
              'AUTHENTICATION_ERROR',
              'Refresh token is expired or invalid',
              request.id
            )
          );
      }
    }
  );

  // 6. Logout
  fastify.delete(
    '/logout',
    { config: { rateLimit: AUTH_SENSITIVE_RATE_LIMIT } },
    async (request, reply) => {
      const cookieToken = request.cookies.refreshToken;
      let bodyToken: string | undefined;
      if (request.body !== undefined && request.body !== null) {
        const bodyResult = RefreshTokenBodySchema.safeParse(request.body);
        if (bodyResult.success) {
          bodyToken = bodyResult.data.refreshToken;
        }
      }
      const token = cookieToken || bodyToken;
      if (token) {
        await prisma.refreshSession.updateMany({
          where: { tokenHash: hashRefreshToken(token), revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      reply.clearCookie('refreshToken', { path: '/v1/auth' });
      return reply.status(200).send(ok({ message: 'Successfully logged out' }, request.id));
    }
  );

  // 7. Get Current User Profile
  fastify.get('/me', { preHandler: [verifyAuth] }, async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.authContext!.userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        createdAt: true,
        memberships: {
          select: {
            workspaceRole: true,
            workspace: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      return reply
        .status(404)
        .send(err('USER_NOT_FOUND', 'NOT_FOUND', 'User record not found', request.id));
    }

    return reply.status(200).send(ok(user, request.id));
  });
};
