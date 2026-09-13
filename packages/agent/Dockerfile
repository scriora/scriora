# Build with the repository root as context.
FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.21.0 --activate

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/agent/package.json ./packages/agent/package.json
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app /app
COPY packages/agent ./packages/agent
RUN pnpm --filter scriora-agent build

FROM node:22-alpine AS runner
WORKDIR /app/packages/agent
ENV NODE_ENV=production
ENV AGENT_DEFAULT_PROVIDER=stub
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 scriora
COPY --from=builder --chown=scriora:nodejs /app /app
USER scriora
CMD ["node", "dist/index.js"]
