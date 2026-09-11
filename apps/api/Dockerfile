# scriora-api — Container image
FROM node:22-alpine AS deps
WORKDIR /app
RUN npm install -g pnpm

COPY pnpm-workspace.yaml ./
COPY scriora-core/package.json ./scriora-core/
COPY scriora-api/package.json ./scriora-api/

RUN pnpm install --no-frozen-lockfile

FROM node:22-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm
COPY --from=deps /app ./
COPY scriora-core ./scriora-core
COPY scriora-api ./scriora-api

RUN pnpm --filter scriora-core db:generate \
 && pnpm --filter scriora-core build \
 && pnpm --filter scriora-api build

FROM node:22-alpine AS runner
WORKDIR /app/scriora-api
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 scriora

COPY --from=builder --chown=scriora:nodejs /app /app

USER scriora
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:4000/health || exit 1

CMD ["node", "dist/server.js"]
