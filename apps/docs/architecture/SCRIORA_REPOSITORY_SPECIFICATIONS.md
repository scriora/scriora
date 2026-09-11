# Scriora — Repository Specifications

> **Status:** Canonical Engineering Specification (Repository Specifications 100% Complete)
> **Scope:** All 11 Scriora Repositories — Directory Structure, Tech Stack, Environment, Entry Points, and Deployment
> **Core Principle:** Every repository is self-contained with a clear mandate, known tech stack, and documented entry points. No repository is a mystery.

---

# 1. Repository System Overview

```text
scriora/
 ├── scriora-core          Business domain engine
 ├── scriora-social        Social platform framework (ACL)
 ├── scriora-api           HTTP API gateway
 ├── scriora-web           Next.js frontend application
 ├── scriora-worker        Durable background job executor
 ├── scriora-media         Media processing & storage
 ├── scriora-agent         AI agent framework
 ├── scriora-mcp           MCP protocol server
 ├── scriora-cli           Developer CLI tool
 ├── scriora-docs          Documentation site
 └── scriora-cloud         Cloud & self-hosting configuration
```

---

# 2. Shared Infrastructure Assumptions

All repositories follow these shared conventions:
- **Language:** TypeScript (strict mode, `noUncheckedIndexedAccess: true`)
- **Package Manager:** pnpm (workspaces for monorepo-style shared types)
- **Node.js:** >= 20 / 22 LTS
- **Testing:** Vitest
- **Linting & Formatting:** Biome (replaces ESLint + Prettier)
- **CI:** GitHub Actions
- **Container:** Docker (multi-stage builds)
- **Secret Management:** Environment variables (Vault in production)

---

# REPOSITORY 1: scriora-core

---

# 3. scriora-core — Technical Summary

The Domain and Persistence Authority for all of Scriora. Owns the canonical Prisma schema, all database migrations, core domain business logic, state machines, and exported application contracts.

**Type:** Node.js library (imported by other repositories - NOT a standalone HTTP server)
**Runtime:** Node.js 22 LTS
**Database:** PostgreSQL 16+ (via Supabase)
**Cache:** Redis 7+

---

# 4. scriora-core — Directory Structure

```text
scriora-core/
 ├── prisma/
 │   ├── schema.prisma          ← Canonical data model
 │   └── migrations/            ← Versioned SQL migrations
 ├── src/
 │   ├── domain/                ← Domain entities and pure business logic
 │   │   ├── workspace/
 │   │   ├── content/
 │   │   ├── calendar/
 │   │   ├── analytics/
 │   │   ├── approval/
 │   │   ├── mission/
 │   │   └── publication/
 │   ├── application/           ← Application contracts & interfaces
 │   ├── infrastructure/        ← Prisma client wrapper, Redis client
 │   │   ├── db/
 │   │   └── repositories/
 │   └── index.ts               ← Barrel export for consumers
 ├── test/
 │   ├── unit/
 │   ├── integration/
 │   └── fixtures/
 ├── package.json
```

---

# 5. scriora-core — Tech Stack

| Dependency | Purpose |
| :--- | :--- |
| `prisma` v7+ | ORM & migration runner |
| `@prisma/client` v7+ | Type-safe database client |
| `zod` v4+ | Schema validation for contracts |
| `date-fns` v4+ | Date arithmetic |
| `nanoid` v5+ | Short ID generation (non-UUID contexts) |

---

# 6. scriora-core — Environment Variables

```bash
DATABASE_URL              # Primary PostgreSQL connection string
DATABASE_SERVICE_ROLE_URL # Service role (migrations only)
```

---

# 7. scriora-core — Entry Points & Scripts

```json
{
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:migrate:dev": "prisma migrate dev",
    "db:migrate:deploy": "prisma migrate deploy",
    "db:generate": "prisma generate",
    "db:studio": "prisma studio",
    "typecheck": "tsc --noEmit"
  }
}
```

---

# 8. scriora-core — Quality Gate

```bash
pnpm typecheck && pnpm test && pnpm build
```

Coverage minimum: **90%**

---

# REPOSITORY 2: scriora-social

---

# 9. scriora-social — Technical Summary

The Social Platform Framework (Anti-Corruption Layer). Owns all platform adapters, OAuth flows, capability models, rate limiting normalization, webhook ingress, and the 6-stage platform certification lifecycle.

**Type:** Node.js library (imported by `scriora-api` and `scriora-worker`)
**Runtime:** Node.js 20 LTS
**External APIs:** LinkedIn, Bluesky, Telegram, Discord, Mastodon, Threads, X, Pinterest, Reddit, Facebook, Instagram, YouTube, TikTok

---

# 10. scriora-social — Directory Structure

```text
scriora-social/
 ├── src/
 │   ├── platforms/             ← One directory per platform
 │   │   ├── linkedin/
 │   │   │   ├── adapter.ts     ← Implements PlatformAdapter
 │   │   │   ├── oauth.ts
 │   │   │   ├── capabilities.ts
 │   │   │   └── mock.ts        ← Deterministic mock for tests
 │   │   ├── bluesky/
 │   │   ├── telegram/
 │   │   ├── discord/
 │   │   ├── mastodon/
 │   │   ├── threads/
 │   │   ├── x/
 │   │   ├── pinterest/
 │   │   ├── reddit/
 │   │   ├── facebook/
 │   │   ├── instagram/
 │   │   ├── youtube/
 │   │   └── tiktok/
 │   ├── contracts/             ← PlatformAdapter, CapabilityModel interfaces
 │   ├── registry/              ← PlatformRegistry, CapabilityRegistry
 │   ├── errors/                ← Platform error normalization
 │   ├── webhooks/              ← Webhook signature verification
 │   ├── rate-limit/            ← Rate limit tracking
 │   └── index.ts
 ├── test/
 │   ├── unit/
 │   ├── contract/
 │   ├── integration/           ← Against mock HTTP servers (MSW)
 │   └── security/
 └── certification/             ← Platform certification test suites
```

---

# 11. scriora-social — Tech Stack

| Dependency | Purpose |
| :--- | :--- |
| `axios` / native `fetch` | HTTP client for platform APIs |
| `msw` | Mock Service Worker (test-time API mocking) |
| `zod` | Platform response validation |
| `@atproto/api` | Bluesky / AT Protocol client |
| `node-telegram-bot-api` | Telegram Bot API |

---

# 12. scriora-social — Environment Variables

```bash
# Platform credentials stored encrypted in DB, not as env vars
# Only infrastructure configuration:
SOCIAL_TOKEN_ENCRYPTION_KEY   # AES-256 key for encrypting stored platform tokens
```

---

# 13. scriora-social — Quality Gate

```bash
pnpm typecheck && pnpm test && pnpm build
```

Coverage minimum: **85%**

---

# REPOSITORY 3: scriora-api

---

# 14. scriora-api — Technical Summary

The HTTP API gateway. Exposes all HTTP endpoints, enforces authentication and authorization, performs input validation, and routes requests to Core Application Contracts.

**Type:** HTTP Server (Fastify)
**Runtime:** Node.js 20 LTS
**Port:** 4000 (configurable)

---

# 15. scriora-api — Directory Structure

```text
scriora-api/
 ├── src/
 │   ├── routes/                ← One file per resource domain
 │   │   ├── content.routes.ts
 │   │   ├── publication.routes.ts
 │   │   ├── approval.routes.ts
 │   │   ├── media.routes.ts
 │   │   ├── analytics.routes.ts
 │   │   ├── workspace.routes.ts
 │   │   └── webhooks.routes.ts
 │   ├── middleware/
 │   │   ├── auth.ts            ← JWT verification
 │   │   ├── workspace.ts       ← Workspace context injection
 │   │   ├── rate-limit.ts      ← Redis-backed sliding window
 │   │   └── error-handler.ts   ← Canonical error mapping
 │   ├── schemas/               ← Zod schemas for request/response
 │   ├── openapi/               ← Auto-generated OpenAPI spec
 │   └── server.ts              ← Fastify bootstrap
 ├── test/
 │   ├── routes/                ← Supertest integration tests
 │   └── security/
 └── Dockerfile
```

---

# 16. scriora-api — Tech Stack

| Dependency | Purpose |
| :--- | :--- |
| `fastify` v5 | HTTP framework |
| `@fastify/jwt` v10 | JWT verification plugin |
| `@fastify/rate-limit` v11 | Rate limiting plugin |
| `@fastify/cors` v11 | CORS handling |
| `zod` v4+ | Request/response schema validation |
| `@fastify/swagger` v9 | OpenAPI spec generation |
| `@fastify/swagger-ui` v6 | Interactive Swagger UI documentation |
| `supertest` v7 | Integration test HTTP client |
| `ioredis` v6 | Redis client for rate limiting |

---

# 17. scriora-api — Environment Variables

```bash
PORT=4000
DATABASE_URL
REDIS_URL
AUTH_JWT_PUBLIC_KEY           # RS256 public key for JWT verification
CORS_ALLOWED_ORIGINS          # Comma-separated allowed origins
STORAGE_ENDPOINT
STORAGE_BUCKET_NAME
```

---

# 18. scriora-api — Entry Points & Scripts

```json
{
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "start": "node dist/server.js",
    "build": "tsc",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```

---

# 19. scriora-api — Quality Gate

```bash
pnpm typecheck && pnpm test && pnpm build
```

Coverage minimum: **85%**

---

# REPOSITORY 4: scriora-web

---

# 20. scriora-web — Technical Summary

The Next.js 16 frontend application. Renders the product UI (Content Studio, Calendar, Analytics, Mission Control, Approvals, Media Library). Consumes `scriora-api` exclusively.

**Type:** Next.js 16 App Router
**Runtime:** Node.js 22 LTS (SSR) + Cloudflare Pages / Vercel (optional edge)
**Port:** 3000 (dev)

---

# 21. scriora-web — Directory Structure

```text
scriora-web/
 ├── app/
 │   ├── (marketing)/           ← Landing, pricing, docs
 │   ├── (app)/                 ← Authenticated product routes
 │   │   ├── dashboard/
 │   │   ├── content/
 │   │   ├── calendar/
 │   │   ├── analytics/
 │   │   ├── approvals/
 │   │   ├── media/
 │   │   └── mission/
 │   ├── api/                   ← Next.js API routes (thin proxy only)
 │   ├── globals.css            ← Tailwind v4 CSS entry (@import "tailwindcss";)
 │   └── layout.tsx
 ├── components/
 │   ├── ui/                    ← shadcn/ui base components
 │   ├── content/
 │   ├── calendar/
 │   ├── analytics/
 │   └── mission/
 ├── lib/
 │   ├── api-client.ts          ← Typed API client (uses Zod contracts)
 │   ├── auth.ts                ← Session management
 │   └── utils.ts
 ├── public/
 ├── test/
 │   ├── components/            ← React component unit tests
 │   └── e2e/                   ← Playwright E2E tests
 ├── postcss.config.mjs         ← PostCSS config for Tailwind v4 (@tailwindcss/postcss)
 ├── next.config.ts
 ├── package.json
 ├── tsconfig.json
 └── vitest.config.ts
```
*(Note: Tailwind CSS v4 is CSS-first; `tailwind.config.ts` is omitted by design).*

---

# 22. scriora-web — Tech Stack

| Dependency | Purpose |
| :--- | :--- |
| `next` 16 | Modern React SSR framework |
| `react` 19 | UI library |
| `tailwindcss` v4 | CSS framework (CSS-first, zero config file) |
| `@tailwindcss/postcss` | PostCSS plugin for Tailwind v4 compilation |
| `shadcn/ui` | Component library (Radix-based) |
| `@tanstack/react-query` v5 | Server state management |
| `zustand` v5 | Client state management |
| `zod` v4+ | Runtime response validation |
| `@playwright/test` | E2E testing |
| `next-intl` v4 | i18n (Arabic + English) |

---

# 23. scriora-web — Environment Variables

```bash
NEXT_PUBLIC_API_URL=https://api.scriora.com
NEXT_PUBLIC_APP_URL=https://app.scriora.com
NEXTAUTH_SECRET
NEXTAUTH_URL
```

---

# 24. scriora-web — Quality Gate

```bash
pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e
```

Coverage minimum: **70%** (UI components)

---

# REPOSITORY 5: scriora-worker

---

# 25. scriora-worker — Technical Summary

The durable background job executor. Orchestrates long-running operations using Inngest: publication scheduling, retry logic, media job dispatch, analytics ingestion, and outbox consumption.

**Type:** Node.js worker process
**Runtime:** Node.js 20 LTS
**Job Framework:** Inngest

---

# 26. scriora-worker — Directory Structure

```text
scriora-worker/
 ├── src/
 │   ├── jobs/
 │   │   ├── publish.job.ts       ← Execute scheduled publication
 │   │   ├── verify.job.ts        ← Verify post is live on platform
 │   │   ├── retry.job.ts         ← Handle retryable failures
 │   │   ├── media.job.ts         ← Dispatch media processing
 │   │   ├── analytics.job.ts     ← Ingest platform metrics
 │   │   ├── outbox.job.ts        ← Consume outbox_commands table
 │   │   └── cleanup.job.ts       ← Lifecycle cleanup tasks
 │   ├── middleware/
 │   │   ├── idempotency.ts       ← Idempotency key checking
 │   │   └── workspace.ts         ← Inject workspace context
 │   └── server.ts                ← Inngest serve handler
 ├── test/
 │   ├── unit/
 │   └── integration/
 └── Dockerfile
```

---

# 27. scriora-worker — Tech Stack

| Dependency | Purpose |
| :--- | :--- |
| `inngest` | Durable job orchestration |
| `ioredis` | Distributed locks, idempotency cache |
| `scriora-core` | Business application contracts |
| `scriora-social` | Platform adapters |
| `scriora-media` | Media processing |

---

# 28. scriora-worker — Environment Variables

```bash
DATABASE_URL
REDIS_URL
INNGEST_EVENT_KEY
INNGEST_SIGNING_KEY
SOCIAL_TOKEN_ENCRYPTION_KEY
STORAGE_ENDPOINT
STORAGE_BUCKET_NAME
```

---

# 29. scriora-worker — Quality Gate

```bash
pnpm typecheck && pnpm test && pnpm build
```

Coverage minimum: **85%**

---

# REPOSITORY 6: scriora-media

---

# 30. scriora-media — Technical Summary

The media processing and storage infrastructure engine. Owns binary validation, image processing (Sharp), video transcoding (FFmpeg), PDF rasterization, panorama splitting, thumbnail generation, and object storage abstraction.

**Type:** Node.js library + optional Worker process
**Runtime:** Node.js 20 LTS
**System Dependencies:** `ffmpeg` binary, `libvips` (Sharp dependency)

---

# 31. scriora-media — Directory Structure

```text
scriora-media/
 ├── src/
 │   ├── contracts/              ← MediaContract interface
 │   ├── ingestion/              ← Upload registration, validation pipeline
 │   │   ├── validator.ts        ← Magic byte, MIME, dimensions
 │   │   ├── metadata.ts         ← Exif, duration, codec extraction
 │   │   └── sandbox.ts          ← Process isolation
 │   ├── processors/
 │   │   ├── image/              ← Sharp-based image processing
 │   │   │   ├── resize.ts
 │   │   │   ├── crop.ts
 │   │   │   ├── compress.ts
 │   │   │   └── thumbnail.ts
 │   │   ├── video/              ← FFmpeg-based video processing
 │   │   │   ├── transcode.ts
 │   │   │   ├── thumbnail.ts
 │   │   │   └── sandbox.ts
 │   │   ├── pdf/                ← PDF rasterization
 │   │   │   └── carousel.ts
 │   │   └── panorama/           ← Panorama splitter
 │   │       └── split.ts
 │   ├── storage/                ← Object storage abstraction
 │   │   ├── storage.interface.ts
 │   │   ├── s3.adapter.ts
 │   │   ├── r2.adapter.ts
 │   │   └── minio.adapter.ts
 │   ├── lifecycle/              ← Cleanup, expiry, orphan detection
 │   └── index.ts
 ├── test/
 │   ├── unit/
 │   ├── integration/
 │   ├── security/
 │   └── __fixtures__/           ← Golden media fixtures
 │       ├── valid-jpeg.jpg
 │       ├── panorama.jpg
 │       ├── document.pdf
 │       ├── h264-video.mp4
 │       └── malicious-bomb.png
 └── Dockerfile
```

---

# 32. scriora-media — Tech Stack

| Dependency | Purpose |
| :--- | :--- |
| `sharp` | Image processing (libvips) |
| `@aws-sdk/client-s3` | S3 / R2 / MinIO object storage |
| `fluent-ffmpeg` | FFmpeg wrapper |
| `pdf2pic` | PDF → image rasterization |
| `file-type` | Magic byte detection |
| `exif-parser` | EXIF metadata extraction |

---

# 33. scriora-media — Environment Variables

```bash
DATABASE_URL
STORAGE_PROVIDER=s3          # s3 | r2 | minio
STORAGE_ACCESS_KEY_ID
STORAGE_SECRET_ACCESS_KEY
STORAGE_BUCKET_NAME
STORAGE_ENDPOINT             # Required for MinIO / R2
STORAGE_REGION=auto
FFMPEG_BINARY_PATH=/usr/bin/ffmpeg
MEDIA_MAX_IMAGE_SIZE_MB=50
MEDIA_MAX_VIDEO_SIZE_GB=2
MEDIA_MAX_VIDEO_DURATION_SECONDS=3600
```

---

# 34. scriora-media — Quality Gate

```bash
pnpm typecheck && pnpm test && pnpm build
```

Coverage minimum: **90%**

---

# REPOSITORY 7: scriora-agent

---

# 35. scriora-agent — Technical Summary

The AI Agent Framework. Owns the autonomous execution runtime, planning engine, skill registry, tool execution engine, policy governance layer, 6-tier memory model, AI provider abstraction, and evaluation harness.

**Type:** Node.js library + optional Agent Server process
**Runtime:** Node.js 20 LTS
**Key Pattern:** Deterministic AI Stubs first; live providers activated in production phase

---

# 36. scriora-agent — Directory Structure

```text
scriora-agent/
 ├── src/
 │   ├── runtime/               ← Agent Runtime & Execution Loop
 │   │   ├── runtime.ts
 │   │   ├── planner.ts
 │   │   ├── context-assembler.ts
 │   │   └── policy-engine.ts
 │   ├── skills/                ← Skill Registry & Implementations
 │   │   ├── registry.ts
 │   │   ├── deterministic/     ← Deterministic skills (no LLM)
 │   │   │   ├── content-adapt.skill.ts
 │   │   │   └── constraint-check.skill.ts
 │   │   └── ai/                ← AI-driven skills
 │   │       ├── strategy-generation.skill.ts
 │   │       ├── content-generation.skill.ts
 │   │       └── insight-synthesis.skill.ts
 │   ├── tools/                 ← Tool Registry & Contracts
 │   │   ├── registry.ts
 │   │   ├── social.tool.ts
 │   │   ├── content.tool.ts
 │   │   ├── analytics.tool.ts
 │   │   ├── media.tool.ts
 │   │   └── approval.tool.ts
 │   ├── memory/                ← 6-Tier Memory Implementation
 │   │   ├── working.ts
 │   │   ├── short-term.ts
 │   │   ├── brand-knowledge.ts
 │   │   ├── evidence.ts
 │   │   └── preferences.ts
 │   ├── providers/             ← LLM & Media Provider Abstraction
 │   │   ├── llm/
 │   │   │   ├── provider.interface.ts
 │   │   │   ├── anthropic.adapter.ts
 │   │   │   ├── openai.adapter.ts
 │   │   │   ├── gemini.adapter.ts
 │   │   │   └── stub.adapter.ts  ← Deterministic stub
 │   │   ├── image/
 │   │   └── video/
 │   ├── router/                ← Provider Router
 │   └── evaluation/            ← Agent Evaluation Harness
 ├── test/
 │   ├── unit/
 │   ├── contract/
 │   ├── integration/
 │   ├── security/
 │   └── evaluation/            ← Deterministic evaluation scenarios
 └── Dockerfile
```

---

# 37. scriora-agent — Tech Stack

| Dependency | Purpose |
| :--- | :--- |
| `@anthropic-ai/sdk` | Anthropic Claude provider |
| `openai` | OpenAI GPT provider |
| `@google/generative-ai` | Gemini provider |
| `ai` (Vercel AI SDK) | Unified streaming abstraction |
| `zod` | Skill I/O schema validation |
| `ioredis` | Working memory ephemeral store |
| `pgvector` | Semantic evidence retrieval (optional) |

---

# 38. scriora-agent — Environment Variables

```bash
DATABASE_URL
REDIS_URL
ANTHROPIC_API_KEY
OPENAI_API_KEY
GOOGLE_AI_API_KEY
AGENT_DEFAULT_PROVIDER=stub   # stub | anthropic | openai | gemini
AGENT_MAX_DAILY_COST_USD=10
AGENT_MAX_TOKENS_PER_TASK=100000
```

---

# 39. scriora-agent — Quality Gate

```bash
pnpm typecheck && pnpm test && pnpm test:evaluation && pnpm build
```

Coverage minimum: **80%** | Evaluation pass rate: **100%**

---

# REPOSITORY 8: scriora-mcp

---

# 40. scriora-mcp — Technical Summary

The MCP Protocol Server. Exposes Scriora capabilities to external agents and AI clients via the Model Context Protocol standard. Acts as a boundary enforcing Human Approval gates.

**Type:** MCP Server (stdio or HTTP transport)
**Runtime:** Node.js 20 LTS
**Protocol:** MCP 2024-11-05

---

# 41. scriora-mcp — Directory Structure

```text
scriora-mcp/
 ├── src/
 │   ├── tools/                 ← MCP tool definitions
 │   │   ├── create-content.tool.ts
 │   │   ├── get-analytics.tool.ts
 │   │   ├── request-approval.tool.ts
 │   │   └── get-mission-status.tool.ts
 │   ├── resources/             ← MCP resource definitions
 │   │   ├── workspace.resource.ts
 │   │   └── content-library.resource.ts
 │   ├── middleware/
 │   │   ├── auth.ts            ← API key + HMAC verification
 │   │   └── rate-limit.ts
 │   └── server.ts              ← MCP server bootstrap
 ├── test/
 │   ├── unit/
 │   ├── contract/
 │   └── security/              ← Approval bypass tests
 └── Dockerfile
```

---

# 42. scriora-mcp — Tech Stack

| Dependency | Purpose |
| :--- | :--- |
| `@modelcontextprotocol/sdk` | MCP protocol implementation |
| `zod` | Tool argument validation |
| `scriora-core` | Business application contracts |

---

# 43. scriora-mcp — Environment Variables

```bash
DATABASE_URL
REDIS_URL
MCP_API_KEY_SALT              # For API key hashing
MCP_SIGNING_SECRET            # For request HMAC verification
MCP_TRANSPORT=stdio            # stdio | http
MCP_HTTP_PORT=5000             # Only when transport=http
```

---

# 44. scriora-mcp — Quality Gate

```bash
pnpm typecheck && pnpm test && pnpm build
```

Coverage minimum: **85%**

---

# REPOSITORY 9: scriora-cli

---

# 45. scriora-cli — Technical Summary

The developer and power-user CLI tool. Provides commands for workspace management, content operations, social account management, local development setup, and self-hosting administration.

**Type:** CLI binary (compiled with `pkg` or distributed via npm)
**Runtime:** Node.js 20 LTS or compiled binary

---

# 46. scriora-cli — Directory Structure

```text
scriora-cli/
 ├── src/
 │   ├── commands/
 │   │   ├── auth/              ← login, logout, whoami
 │   │   ├── workspace/         ← create, switch, list
 │   │   ├── content/           ← create, list, publish
 │   │   ├── social/            ← connect, list, disconnect
 │   │   └── admin/             ← migrate, seed, health-check
 │   ├── config/
 │   │   └── config.ts          ← ~/.scriora/config.json
 │   ├── api/
 │   │   └── client.ts          ← API client for CLI
 │   └── cli.ts                 ← Entry point
 ├── test/
 │   └── commands/
 └── package.json
```

---

# 47. scriora-cli — Tech Stack

| Dependency | Purpose |
| :--- | :--- |
| `commander` | CLI argument parsing |
| `inquirer` | Interactive prompts |
| `chalk` | Terminal color output |
| `ora` | Spinner for async operations |
| `conf` | Secure config file management |
| `axios` | API client |

---

# 48. scriora-cli — Environment Variables

```bash
SCRIORA_API_URL=https://api.scriora.com   # Or local dev URL
# Credentials stored in ~/.scriora/config.json (never in env)
```

---

# 49. scriora-cli — Quality Gate

```bash
pnpm typecheck && pnpm test && pnpm build
```

Coverage minimum: **75%**

---

# REPOSITORY 10: scriora-docs

---

# 50. scriora-docs — Technical Summary

The product documentation site. Built with Docusaurus or Astro + Starlight. Contains user guides, API reference (auto-generated from OpenAPI spec), integration guides, self-hosting documentation, and architectural decision records.

**Type:** Static site (deployed to CDN)
**Runtime:** Build-time Node.js; serves as static HTML

---

# 51. scriora-docs — Directory Structure

```text
scriora-docs/
 ├── docs/
 │   ├── getting-started/
 │   ├── guides/
 │   │   ├── connecting-social-accounts.md
 │   │   ├── content-approval-flow.md
 │   │   └── mission-mode.md
 │   ├── api-reference/         ← Auto-generated from OpenAPI
 │   ├── self-hosting/
 │   │   ├── installation.md
 │   │   ├── configuration.md
 │   │   └── upgrade.md
 │   └── architecture/          ← ADRs (Architecture Decision Records)
 ├── openapi/
 │   └── scriora-api-v1.yaml    ← Generated from scriora-api
 └── astro.config.mjs
```

---

# 52. scriora-docs — Tech Stack

| Dependency | Purpose |
| :--- | :--- |
| `astro` v7+ + `@astrojs/starlight` v0.42+ | Documentation site framework |
| `mermaid` | Architecture diagram rendering |

---

# 53. scriora-docs — Quality Gate

```bash
pnpm build                     # Zero broken links, valid OpenAPI
```

---

# REPOSITORY 11: scriora-cloud

---

# 54. scriora-cloud — Technical Summary

Cloud infrastructure and self-hosting configuration. Contains Docker Compose definitions, Kubernetes manifests (optional), Terraform modules (cloud deployments), CI/CD pipeline templates, and the official self-hosted release bundle.

**Type:** Infrastructure-as-Code (no application runtime)

---

# 55. scriora-cloud — Directory Structure

```text
scriora-cloud/
 ├── docker/
 │   ├── docker-compose.yml        ← Full self-hosted stack
 │   ├── docker-compose.worker.yml ← Worker scale-out extension
 │   ├── docker-compose.dev.yml    ← Local development
 │   └── .env.template             ← Environment variable template
 ├── k8s/                          ← Kubernetes manifests (optional)
 │   ├── namespace.yaml
 │   ├── core.deployment.yaml
 │   ├── api.deployment.yaml
 │   ├── worker.deployment.yaml
 │   └── media.deployment.yaml
 ├── terraform/                    ← Cloud provider modules
 │   ├── aws/
 │   └── gcp/
 ├── scripts/
 │   ├── install.sh                ← One-line self-hosted installer
 │   ├── upgrade.sh                ← Upgrade script
 │   └── health-check.sh           ← Post-deploy verification
 ├── github-actions/               ← Reusable CI/CD workflow templates
 └── INSTALL.md
```

---

# 56. scriora-cloud — Self-Hosted Stack (Docker Compose)

```yaml
# Core services in docker-compose.yml:
services:
  postgres:
    image: postgres:16-alpine
    
  redis:
    image: redis:7-alpine
    
  minio:
    image: minio/minio:latest
    
  core-migrate:
    image: scriora/core:latest
    command: pnpm db:migrate:deploy
    
  api:
    image: scriora/api:latest
    
  worker:
    image: scriora/worker:latest
    
  media:
    image: scriora/media:latest
    
  web:
    image: scriora/web:latest
```

---

# 57. Repository Dependency Graph

```text
scriora-cloud
    ├── Uses: All repositories (deployment only)

scriora-web
    └── Consumes: scriora-api (HTTP only)

scriora-api
    ├── Imports: scriora-core
    ├── Imports: scriora-social
    └── Imports: scriora-media

scriora-worker
    ├── Imports: scriora-core
    ├── Imports: scriora-social
    └── Imports: scriora-media

scriora-agent
    ├── Imports: scriora-core (contracts)
    ├── Imports: scriora-social (via tools)
    └── Imports: scriora-media (via tools)

scriora-mcp
    └── Imports: scriora-core (contracts)

scriora-cli
    └── Consumes: scriora-api (HTTP only)

scriora-docs
    └── Consumes: scriora-api (OpenAPI spec only)
```

---

# 58. Forbidden Dependencies

These dependency paths are structurally prohibited:

```text
scriora-core     → scriora-social      ← FORBIDDEN
scriora-core     → scriora-agent       ← FORBIDDEN
scriora-core     → scriora-api         ← FORBIDDEN
scriora-social   → scriora-core        ← FORBIDDEN (ACL must not leak up)
scriora-web      → scriora-core        ← FORBIDDEN (web only via API)
scriora-web      → scriora-agent       ← FORBIDDEN
scriora-mcp      → scriora-social      ← FORBIDDEN (only via agent contracts)
```

---

# 59. Mono-Deployment Topology (Self-Hosted)

Despite 11 repositories, self-hosted deployment can run as a simplified topology:

```text
Single Docker Host
  ├── PostgreSQL container
  ├── Redis container
  ├── MinIO container
  ├── API container        (scriora-api)
  ├── Web container        (scriora-web)
  ├── Worker container     (scriora-worker)
  └── Media Worker         (scriora-media, optional separate)
```

`scriora-agent` starts as a module embedded in the worker, activated when AI is enabled.

---

# 60. Per-Repository Quality Gate Summary

| Repository | TypeCheck | Unit | Contract | Integration | E2E | Security | Coverage |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| core | ✓ | ✓ | ✓ | ✓ | - | ✓ | 90% |
| social | ✓ | ✓ | ✓ | ✓ | - | ✓ | 85% |
| api | ✓ | ✓ | ✓ | ✓ | - | ✓ | 85% |
| web | ✓ | ✓ | - | - | ✓ | - | 70% |
| worker | ✓ | ✓ | ✓ | ✓ | - | ✓ | 85% |
| media | ✓ | ✓ | ✓ | ✓ | - | ✓ | 90% |
| agent | ✓ | ✓ | ✓ | ✓ | - | ✓ | 80% |
| mcp | ✓ | ✓ | ✓ | - | - | ✓ | 85% |
| cli | ✓ | ✓ | - | - | - | - | 75% |
| docs | - | - | - | - | - | - | N/A |
| cloud | - | - | - | - | - | - | N/A |

---

# 61. Status: 100% Complete

```text
Repository Specifications
████████████████████████████████████ 100% COMPLETE
```

All 11 repository technical summaries, directory structures, technology stacks, environment variable contracts, quality gates, entry points, dependency graphs, and deployment topologies are formally frozen and canonical.
