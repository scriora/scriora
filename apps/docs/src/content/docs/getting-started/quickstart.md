---
title: "Developer Quickstart"
---

Get your local Scriora monorepo development environment running in under 5 minutes.

---

## 📋 Prerequisites

- **Node.js**: v22 LTS or newer
- **pnpm**: v11.21.0 or newer
- **Docker**: For PostgreSQL 16, Redis 7, and MinIO S3 storage
- **Git**

---

## ⚡ 1. Clone & Install

```bash
git clone https://github.com/scriora/scriora.git
cd scriora

# Install all workspace dependencies
pnpm install
```

---

## 🗄️ 2. Start Infrastructure & Generate Database Client

```bash
# Start local PostgreSQL and Redis (or use docker compose from scriora-cloud)
docker run --name scriora-postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16-alpine
docker run --name scriora-redis -p 6379:6379 -d redis:7-alpine

# Generate Prisma Client
pnpm db:generate

# Push schema to database
pnpm --filter scriora-core exec prisma db push
```

---

## 🚀 3. Run Development Servers

Run the entire platform with a single command via Turborepo:

```bash
pnpm dev
```

Or run individual apps:

```bash
# Next.js Web App (:3000)
pnpm --filter scriora-web dev

# Fastify API Gateway (:4000)
pnpm --filter scriora-api dev

# Inngest Background Worker
pnpm --filter scriora-worker dev

# Starlight Documentation (:4321)
pnpm --filter scriora-docs dev
```

---

## 🧪 4. Running Quality Checks

```bash
# Typecheck all packages
pnpm typecheck

# Run all test suites
pnpm test

# Lint with Biome
pnpm lint

# Verify architectural boundaries
pnpm verify:architecture
```
