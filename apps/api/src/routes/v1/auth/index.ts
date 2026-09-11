import crypto from 'node:crypto';
import argon2 from 'argon2';
import type { FastifyPluginAsync } from 'fastify';
import { prisma } from 'scriora-core';
import { z } from 'zod';
import { err, ok } from '../../../lib/response.js';
import { verifyAuth } from '../../../middleware/auth.js';

const RegisterSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(100),
  password: z.string().min(8).optional(),
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

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  // 1. Magic Link Request (AD-11)
  fastify.post('/magic-link', async (request, reply) => {
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

    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      user = await prisma.$transaction(async (tx) => {
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

        return newUser;
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

    const isDev = process.env.NODE_ENV !== 'production';
    return reply.status(200).send(
      ok(
        {
          message: 'Magic login link generated. Check your inbox.',
          email,
          ...(isDev
            ? {
                devMagicLink: `${process.env.APP_URL ?? 'http://localhost:3000'}/v1/auth/verify?token=${rawToken}`,
              }
            : {}),
        },
        request.id
      )
    );
  });

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

    // Clear token
    await prisma.user.update({
      where: { id: user.id },
      data: {
        magicLinkTokenHash: null,
        magicLinkExpiresAt: null,
        emailVerifiedAt: user.emailVerifiedAt || new Date(),
        lastLoginAt: new Date(),
      },
    });

    const accessToken = fastify.jwt.sign({ sub: user.id, email: user.email }, { expiresIn: '15m' });
    const refreshToken = fastify.jwt.sign({ sub: user.id, type: 'refresh' }, { expiresIn: '30d' });

    reply.setCookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/v1/auth',
      maxAge: 30 * 24 * 60 * 60,
    });

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
  fastify.post('/register', async (request, reply) => {
    const parseResult = RegisterSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply
        .status(400)
        .send(
          err('VALIDATION_ERROR', 'VALIDATION_ERROR', 'Invalid registration parameters', request.id)
        );
    }

    const { email, name, password } = parseResult.data;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return reply
        .status(409)
        .send(err('USER_EXISTS', 'CONFLICT', 'A user with this email already exists', request.id));
    }

    const hashedPassword = password ? await hashPassword(password) : null;

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

    const accessToken = fastify.jwt.sign({ sub: user.id, email: user.email }, { expiresIn: '15m' });
    const refreshToken = fastify.jwt.sign({ sub: user.id, type: 'refresh' }, { expiresIn: '30d' });

    reply.setCookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/v1/auth',
      maxAge: 30 * 24 * 60 * 60,
    });

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
  });

  // 4. Login with Email + Password
  fastify.post('/login', async (request, reply) => {
    const parseResult = LoginSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply
        .status(400)
        .send(err('VALIDATION_ERROR', 'VALIDATION_ERROR', 'Invalid login parameters', request.id));
    }

    const { email, password } = parseResult.data;
    const user = await prisma.user.findUnique({ where: { email } });

    const isPasswordValid = user?.passwordHash
      ? await verifyPassword(password, user.passwordHash)
      : false;

    if (!user || !user.passwordHash || !isPasswordValid) {
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

    const accessToken = fastify.jwt.sign({ sub: user.id, email: user.email }, { expiresIn: '15m' });
    const refreshToken = fastify.jwt.sign({ sub: user.id, type: 'refresh' }, { expiresIn: '30d' });

    reply.setCookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/v1/auth',
      maxAge: 30 * 24 * 60 * 60,
    });

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

  // 5. Refresh token
  fastify.post('/refresh', async (request, reply) => {
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
          .send(err('USER_NOT_FOUND', 'AUTHENTICATION_ERROR', 'User no longer exists', request.id));
      }

      const newAccessToken = fastify.jwt.sign(
        { sub: user.id, email: user.email },
        { expiresIn: '15m' }
      );
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
  });

  // 6. Logout
  fastify.delete('/logout', async (request, reply) => {
    reply.clearCookie('refreshToken', { path: '/v1/auth' });
    return reply.status(200).send(ok({ message: 'Successfully logged out' }, request.id));
  });

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
