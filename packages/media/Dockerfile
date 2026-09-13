# Build with the repository root as context.
FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache vips-dev python3 make g++
RUN corepack enable && corepack prepare pnpm@11.21.0 --activate

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json ./packages/core/package.json
COPY packages/media/package.json ./packages/media/package.json
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app /app
COPY packages/core ./packages/core
COPY packages/media ./packages/media
RUN pnpm --filter scriora-core db:generate \
 && pnpm --filter scriora-core build \
 && pnpm --filter scriora-media build

FROM node:22-alpine AS runner
WORKDIR /app/packages/media
ENV NODE_ENV=production
ENV FFMPEG_BINARY_PATH=/usr/bin/ffmpeg
RUN apk add --no-cache ffmpeg vips \
 && addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 scriora
COPY --from=builder --chown=scriora:nodejs /app /app
USER scriora
CMD ["node", "dist/index.js"]
