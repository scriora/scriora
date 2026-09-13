# Build with the repository root as context:
# docker build -f apps/api/Dockerfile -t scriora-api .
FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.21.0 --activate

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/core/package.json ./packages/core/package.json
COPY packages/media/package.json ./packages/media/package.json
COPY packages/social/package.json ./packages/social/package.json
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app /app
COPY apps/api ./apps/api
COPY packages/core ./packages/core
COPY packages/media ./packages/media
COPY packages/social ./packages/social
RUN pnpm --filter scriora-core db:generate \
 && pnpm --filter scriora-core build \
 && pnpm --filter scriora-media build \
 && pnpm --filter scriora-social build \
 && pnpm --filter scriora-api build

FROM node:22-alpine AS runner
WORKDIR /app/apps/api
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 scriora
COPY --from=builder --chown=scriora:nodejs /app /app
USER scriora
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/health || exit 1
CMD ["node", "dist/server.js"]
