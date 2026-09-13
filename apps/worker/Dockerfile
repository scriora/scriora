# Build with the repository root as context:
# docker build -f apps/worker/Dockerfile -t scriora-worker .
FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.21.0 --activate

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/worker/package.json ./apps/worker/package.json
COPY packages/core/package.json ./packages/core/package.json
COPY packages/social/package.json ./packages/social/package.json
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app /app
COPY apps/worker ./apps/worker
COPY packages/core ./packages/core
COPY packages/social ./packages/social
RUN pnpm --filter scriora-core db:generate \
 && pnpm --filter scriora-core build \
 && pnpm --filter scriora-social build \
 && pnpm --filter scriora-worker build

FROM node:22-alpine AS runner
WORKDIR /app/apps/worker
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 scriora
COPY --from=builder --chown=scriora:nodejs /app /app
USER scriora
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/health || exit 1
CMD ["node", "dist/server.js"]
