FROM node:22-alpine AS deps
WORKDIR /app
RUN npm install -g pnpm
COPY package.json pnpm-workspace.yaml* pnpm-lock.yaml* ./
RUN pnpm install --no-frozen-lockfile

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx tsc

FROM node:22-alpine AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 scriora
COPY --from=builder --chown=scriora:nodejs /app/dist ./dist
COPY --from=builder --chown=scriora:nodejs /app/node_modules ./node_modules
USER scriora
EXPOSE 5000
ENV MCP_TRANSPORT=stdio
CMD ["node", "dist/server.js"]
