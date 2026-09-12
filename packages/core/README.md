# scriora-core

Business domain engine for Scriora.

**Mandate:** Owns all business state, domain entities, state machines,
application contracts, and the Prisma database schema. Tenant isolation is
enforced in application queries via `workspaceId` (Postgres RLS is not applied).

**Type:** Node.js library  -  NOT a standalone HTTP server.
Only imported by: scriora-api, scriora-worker, scriora-agent (contracts only).

**Phase 0 next step:** Implement Prisma schema.
Reference: scriora-docs/architecture/SCRIORA_DATABASE_CONTRACT.md

## Scripts

| Command | Description |
|---|---|
| pnpm build | Compile TypeScript |
| pnpm test | Run unit + integration tests |
| pnpm typecheck | Type-check without emitting |
| pnpm db:migrate:dev | Create new migration (dev) |
| pnpm db:migrate:deploy | Apply migrations (production) |
| pnpm db:studio | Open Prisma Studio |

## Quality Gate

```bash
pnpm typecheck && pnpm test && pnpm build
```

Coverage minimum: 90%
