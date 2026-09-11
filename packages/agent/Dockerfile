FROM node:22-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm
COPY package.json ./
RUN pnpm install --no-frozen-lockfile
COPY . .
RUN pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 scriora
COPY --from=builder --chown=scriora:nodejs /app/dist ./dist
COPY --from=builder --chown=scriora:nodejs /app/node_modules ./node_modules
USER scriora
# Default to stub provider — live AI requires explicit env override
ENV AGENT_DEFAULT_PROVIDER=stub
CMD ["node", "dist/index.js"]
