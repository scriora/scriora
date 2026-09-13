# Build with the repository root as context.
FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.21.0 --activate

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/agent/package.json ./packages/agent/package.json
COPY packages/core/package.json ./packages/core/package.json
COPY packages/mcp/package.json ./packages/mcp/package.json
COPY packages/social/package.json ./packages/social/package.json
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app /app
COPY packages/agent ./packages/agent
COPY packages/core ./packages/core
COPY packages/mcp ./packages/mcp
COPY packages/social ./packages/social
RUN pnpm --filter scriora-core db:generate \
 && pnpm --filter scriora-core build \
 && pnpm --filter scriora-social build \
 && pnpm --filter scriora-agent build \
 && pnpm --filter scriora-mcp build

FROM node:22-alpine AS runner
WORKDIR /app/packages/mcp
ENV NODE_ENV=production
ENV MCP_TRANSPORT=stdio
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 scriora
COPY --from=builder --chown=scriora:nodejs /app /app
USER scriora
EXPOSE 5000
CMD ["node", "dist/server.js"]
