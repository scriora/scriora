FROM node:22-alpine AS deps
WORKDIR /app

# Install system dependencies for Sharp and FFmpeg
RUN apk add --no-cache \
    ffmpeg \
    vips-dev \
    python3 \
    make \
    g++

RUN npm install -g pnpm
COPY package.json pnpm-workspace.yaml* pnpm-lock.yaml* ./
RUN pnpm install --no-frozen-lockfile

FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache vips-dev python3 make g++
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx tsc

FROM node:22-alpine AS runner
WORKDIR /app

# Runtime system deps only
RUN apk add --no-cache ffmpeg vips

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 scriora

COPY --from=builder --chown=scriora:nodejs /app/dist ./dist
COPY --from=builder --chown=scriora:nodejs /app/node_modules ./node_modules

USER scriora

# Security: no network access for media processing sandbox
ENV FFMPEG_BINARY_PATH=/usr/bin/ffmpeg

CMD ["node", "dist/index.js"]
