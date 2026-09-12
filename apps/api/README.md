# scriora-api

HTTP API Gateway for Scriora — built with Fastify v5.

**Mandate:** The single HTTP entry point for scriora-web, scriora-cli, and third-party integrations.
Owns: Routes, auth middleware, request validation, rate limiting, OpenAPI spec.
Delegates all business logic to scriora-core Application Contracts and scriora-media.

**Port:** 4000 (default)

**Invariants:**
- Zero untyped business logic in this layer (delegate to domain services)
- Every route validates input via Zod schema before processing
- Every route enforces authentication and workspace membership before reaching domain logic
- Centralized Argon2id password hashing and AES-256-GCM secret envelope management

## 🛣️ Core Route Groups (`/v1`)

| Route Prefix | Purpose | Key Endpoints |
| :--- | :--- | :--- |
| `/v1/auth` | Identity & Session | `POST /login`, `POST /register`, `POST /magic-link`, `POST /refresh` |
| `/v1/workspaces` | Multi-tenancy | `GET /`, `POST /`, `GET /:wsId`, `PATCH /:wsId` |
| `/v1/connect` | Social OAuth 2.0 | `GET /:platform`, `GET /callback` (LinkedIn, Discord, X) |
| `/v1/social-accounts` | Connected Accounts | `GET /`, `DELETE /:accountId` |
| `/v1/posts` | Unified Gateway | `POST /` (ACID Outbox queueing with idempotency) |
| `/v1/media` | Media & Carousels | `POST /carousel` (PDF Carousel generation & download) |
| `/v1/approve` | C2 Governance | `GET /`, `POST /:action` |
| `/v1/webhooks` | Inbound Webhooks | `POST /telegram` (Telegram Bot C2 interactions) |

## 🧪 Quality Gate

```bash
pnpm --filter scriora-api typecheck && pnpm --filter scriora-api test && pnpm --filter scriora-api build
```
