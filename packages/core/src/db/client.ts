import { PrismaClient } from '@prisma/client';

declare global {
  var __scriora_prisma__: PrismaClient | undefined;
}

export const prisma =
  globalThis.__scriora_prisma__ ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__scriora_prisma__ = prisma;
}

export type { PrismaClient };
