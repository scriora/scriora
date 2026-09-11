# scriora-web

Next.js 16 frontend for Scriora.

**Mandate:** UI rendering only. No business logic.
Consumes scriora-api exclusively via `lib/api-client.ts`.
Never imports scriora-core, scriora-social, or any backend package directly.

**Stack:** Next.js 16.3 (`^16.3.4`) · React 19.3 (`^19.3.0`) · Tailwind CSS v4.3 (CSS-First) · TanStack Query v5.102 · Zustand v5.0 · Zod v4.6

**Styling Architecture (Tailwind CSS v4):**
- Pure CSS-First setup (`app/globals.css` with `@import "tailwindcss";`)
- Zero legacy `tailwind.config.js/ts` file
- PostCSS compilation via `@tailwindcss/postcss` in `postcss.config.mjs`

**Invariant:**
- Zero business logic in components or pages
- All data fetched via `apiClient()`  -  never raw fetch to DB
- All state managed via TanStack Query (server) + Zustand (client)

Reference: scriora-docs/architecture/SCRIORA_REPOSITORY_SPECIFICATIONS.md

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start dev server (port 3000) |
| `pnpm build` | Production build |
| `pnpm test` | Component unit tests (Vitest) |
| `pnpm test:e2e` | E2E tests (Playwright) |
| `pnpm typecheck` | Type-check without emitting |

## Quality Gate

```bash
pnpm typecheck && pnpm test && pnpm build
```

Coverage minimum: 70% (UI components)
