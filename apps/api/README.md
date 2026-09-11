# scriora-api

HTTP API Gateway for Scriora  -  built with Fastify.

**Mandate:** The single HTTP entry point for scriora-web and scriora-cli.
Owns: Routes, auth middleware, request validation, rate limiting, OpenAPI spec.
Delegates all business logic to scriora-core Application Contracts.

**Port:** 4000 (default)

**Invariants:**
- Zero business logic in this layer (delegate to scriora-core)
- Every route validates input via Zod schema before processing
- Every route enforces authentication before reaching domain logic
- No direct database access (only via scriora-core contracts)

Reference: scriora-docs/architecture/SCRIORA_REPOSITORY_SPECIFICATIONS.md

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start with hot-reload (tsx watch) |
| `pnpm build` | Compile TypeScript |
| `pnpm test` | Run route integration tests |
| `pnpm typecheck` | Type-check without emitting |

## Quality Gate

```bash
pnpm typecheck && pnpm test && pnpm build
```

Coverage minimum: 85%

## Health Check

`GET /health` → `{ status: "ok", service: "scriora-api" }`
