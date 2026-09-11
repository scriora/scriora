# scriora-worker — Container image
FROM node:22-alpine AS deps
WORKDIR /app
RUN npm install -g pnpm

COPY pnpm-workspace.yaml package.json ./
COPY packages/core/package.json ./packages/core/
COPY packages/social/package.json ./packages/social/
COPY apps/worker/package.json ./apps/worker/

RUN pnpm install --no-frozen-lockfile

FROM node:22-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm
COPY --from=deps /app ./
COPY packages/core ./packages/core
COPY packages/social ./packages/social
COPY apps/worker ./apps/worker

RUN pnpm --filter scriora-core db:generate \
 && pnpm --filter scriora-core build \
 && pnpm --filter scriora-social build \
 && pnpm --filter scriora-worker build

FROM node:22-alpine AS runner
WORKDIR /app/apps/worker
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 scriora

COPY --from=builder --chown=scriora:nodejs /app /app

USER scriora
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "process.exit(0)" || exit 1

CMD ["node", "dist/server.js"]