# Scriora Security Remediation Program Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every validated security, data-integrity, CI, Docker, environment-contract, and functional-cohesion finding from the 2026-09-12 review through narrow pull requests.

**Architecture:** Every root cause gets a branch from `origin/main` and an independently reviewable PR. Security changes are enforced at the narrowest shared boundary and include a malicious regression plus a legitimate control. Database invariants use forward-only migrations; operational fixes are proved at the real E2E or container boundary.

**Tech Stack:** TypeScript, Fastify 5, Next.js 16, Prisma, PostgreSQL 16, Vitest, Playwright, pnpm/Turborepo, Docker, GitHub Actions.

**Spec:** `security_best_practices_report.md`

## Global Constraints

- Preserve existing successful public flows unless the report identifies their contract as unsafe.
- Do not log raw credentials or tokens.
- Every security PR requires a negative regression test and a legitimate control.
- Every source PR starts from `origin/main`, stays single-purpose, and is pushed only after focused tests, owning-package typecheck, and diff review pass.
- Migrations are forward-only and must pass Prisma validation, migration tests, and a real PostgreSQL deployment when available.
- Open PRs only; do not merge them.

---

### Task 1: Documentation baseline

**Files:** Create `security_best_practices_report.md` and this plan.

- [ ] Run `rg -n '^### (SEC|OPS)-' security_best_practices_report.md` and confirm SEC-01..09 plus OPS-01..07.
- [ ] Run `git diff --check`.
- [ ] Commit on `docs/security-remediation-program`, push, and open `docs: record security remediation program`.

### Task 2: MediaAsset tenant boundary

**Files:** Modify `packages/core/src/domain/publishing/create-post.service.ts`; test `packages/core/test/unit/create-post.service.test.ts`.

- [ ] Add a failing test where requested media is absent from the active workspace; expect `MEDIA_ASSET_NOT_FOUND` and no transaction.
- [ ] Require `workspaceId`, `deletedAt:null`, every distinct requested ID, and a non-empty `storageKey`; preserve request order and remove the ID fallback.
- [ ] Run `pnpm --filter scriora-core test -- create-post.service.test.ts`, `pnpm --filter scriora-core typecheck`, and `git diff --check`.
- [ ] Open `fix/media-asset-tenant-boundary` as `fix(security): enforce media asset tenant boundary`.

### Task 3: Auth rate-limit identity

**Files:** Modify `apps/api/src/plugins/rate-limit.ts`; test `apps/api/test/security/security.test.ts`.

- [ ] Add tests proving arbitrary Authorization/API-key headers keep the IP bucket while verified principals use stable server-side IDs.
- [ ] Export a key generator that uses verified `authContext.apiKey.id` or `authContext.userId`, otherwise `request.ip`; never include raw credentials.
- [ ] Run focused API tests, API typecheck, and diff check.
- [ ] Open `fix/auth-rate-limit-identity` as `fix(security): prevent auth rate-limit key rotation`.

### Task 4: Approval token CAS

**Files:** Create `apps/api/src/lib/consume-approval-token.ts`; modify approval HTTP/Telegram paths and their tests.

- [ ] Add losing-race tests where conditional token consumption returns `{count:0}`; assert no Approval or Publication mutation.
- [ ] In one transaction use `approvalToken.updateMany` with `usedAt:null` and unexpired predicates, then `approval.updateMany` with `status:PENDING`; require exactly one row at each gate.
- [ ] Route HTTP and Telegram decisions through the same helper and preserve their existing conflict/boolean contracts.
- [ ] Run approval/Telegram tests, API typecheck, and diff check.
- [ ] Open `fix/approval-token-cas` as `fix(security): consume approval tokens atomically`.

### Task 5: Refresh rotation CAS

**Files:** Modify `apps/api/src/routes/v1/auth/index.ts`; test `apps/api/test/routes/auth.route.test.ts`.

- [ ] Add a stale-session test that returns `{count:0}` from conditional revoke and proves no replacement is created.
- [ ] Generate the replacement token in memory; atomically revoke the predecessor and create/link one replacement inside a transaction.
- [ ] Run auth tests, API typecheck, and diff check.
- [ ] Open `fix/refresh-rotation-cas` as `fix(security): make refresh rotation atomic`.

### Task 6: Magic-link consumption CAS

**Files:** Modify the same auth route and auth tests.

- [ ] Add a consumed-between-read-and-write test; expect 401 and no session creation.
- [ ] Clear the token with `user.updateMany` keyed by ID, token hash, and expiry; issue sessions only when `count===1`.
- [ ] Run auth tests, API typecheck, and diff check.
- [ ] Open `fix/magic-link-cas` as `fix(security): consume magic links atomically`.

### Task 7: Tenant-integrity migration

**Files:** Modify `packages/core/prisma/schema.prisma`; add a migration; update `packages/core/test/unit/migrations-baseline.test.ts`.

- [ ] Add migration contract tests for tenant-consistent ContentVariant, Publication, PublishAttempt, OutboxCommand, ApprovalToken, and OAuthConnectNonce relations.
- [ ] Add preflight checks that abort on inconsistent legacy rows, composite `(workspace_id,id)` uniques/FKs, and supporting child indexes.
- [ ] Reflect compound relations in Prisma and preserve deletion behavior.
- [ ] Run `pnpm db:validate`, migration tests, real `pnpm db:migrate:deploy`, core typecheck, and diff check.
- [ ] Open `fix/database-tenant-integrity` as `fix(database): enforce tenant-consistent relations`.

### Task 8: Discord credential transport

**Files:** Modify `apps/api/src/routes/v1/connect/index.ts` and connect route tests.

- [ ] Prove a query-only bot token is rejected while the header flow works.
- [ ] Remove `botToken` from query parsing and accept the credential only in `x-discord-bot-token` or a validated body.
- [ ] Run connect tests/typecheck and open `fix/discord-token-transport`.

### Task 9: Linear X text splitting

**Files:** Modify `packages/social/src/platforms/x/x.adapter.ts` and its unit tests.

- [ ] Add a 10,000-character punctuation-free regression and ordinary sentence/thread controls.
- [ ] Replace the ambiguous regex with a deterministic linear scanner.
- [ ] Run social tests/typecheck and open `fix/x-text-splitter-redos`.

### Task 10: HTTP security headers

**Files:** Modify API dependencies/app, lockfile, Next config, and API/Web security tests.

- [ ] Add `@fastify/helmet` with compatible defaults and test representative API headers.
- [ ] Add Next CSP/frame-ancestors, nosniff, referrer, and permissions headers without blocking Next assets.
- [ ] Run API/Web tests, typechecks, web build, and diff check.
- [ ] Open `fix/http-security-headers`.

### Task 11: Web E2E in CI

**Files:** Modify `apps/web/playwright.config.ts`, web scripts if needed, and `.github/workflows/test.yml`.

- [ ] Point Playwright to `apps/web/.next/standalone/apps/web/server.js` with correct working directory/host.
- [ ] Run web build then Playwright locally.
- [ ] Add a Chromium E2E job to CI and open `fix/web-e2e-ci`.

### Task 12: Docker reproducibility

**Files:** Create `.dockerignore`; modify API/Web/Worker and package Dockerfiles plus development compose bindings.

- [ ] Pin pnpm 11.21.0 through Corepack and use `--frozen-lockfile`.
- [ ] Copy every required workspace manifest/source and correct monorepo standalone paths.
- [ ] Bind PostgreSQL/Redis development ports to `127.0.0.1`; preserve volumes.
- [ ] Build API/Web/Worker images, run health smoke checks, and open `fix/docker-reproducibility`.

### Task 13: Environment and magic-link origin contract

**Files:** Modify root/API env examples, auth route, mailer helper, and tests.

- [ ] Require production `API_URL` for verification links; keep the explicit development default.
- [ ] Document runtime names `JWT_SECRET`, `CORS_ORIGINS`, `API_URL`, and `MAGIC_LINK_MAILER_URL`; remove contradictory RS256/Resend claims.
- [ ] Test production missing-origin failure and generated URL, then open `fix/environment-contract`.

### Task 14: Publish target/account contract

**Files:** Modify publish schema/service and core tests.

- [ ] Reject duplicate `socialAccountId` targets.
- [ ] Select the stored account platform and reject any target/platform mismatch before creating records.
- [ ] Test both failures plus a valid multi-platform request, then open `fix/publish-target-contract`.

### Task 15: OpenAPI and route contract

**Files:** Modify `apps/docs/openapi/openapi.json` and docs configuration/content.

- [ ] Inventory registered Fastify methods/paths and add missing media, webhook, publication, schedule, and optimization operations.
- [ ] Preserve current paths and document the differing publications prefix accurately.
- [ ] Parse OpenAPI, build docs without current warnings, and open `fix/openapi-route-contract`.

### Task 16: Mission linkage

**Files:** Modify Prisma schema, add a forward migration, update publishing service and tests.

- [ ] Model one optional tenant-consistent Mission→Content relation as the single ownership point.
- [ ] Validate `missionId` belongs to the active workspace and persist it during content creation.
- [ ] Run migration deployment, core tests/typecheck, and open `fix/publish-mission-linkage`.

### Task 17: Cross-platform lint normalization

**Files:** Create `.gitattributes`; modify formatting configuration only if required.

- [ ] Reproduce the Windows CRLF failure and record the affected file class.
- [ ] Enforce LF for source/configuration files through `.gitattributes` without rewriting unrelated generated or binary files.
- [ ] Renormalize only files required to prove the rule, run `pnpm lint`, and open `fix/cross-platform-lint`.

### Task 18: CodeQL alert cleanup

**Files/settings:** Remove confirmed unused imports/assignments; classify Telegram alerts in GitHub with source-backed rationale.

- [ ] Re-query all open CodeQL alerts and confirm alert #5 is closed by Task 9.
- [ ] Remove the five confirmed unused test imports/assignments without changing behavior and run their owning tests.
- [ ] Dismiss alerts #6 and #7 as false positives only after verifying webhook-secret and fixed-admin-ID checks still exist.
- [ ] Open `fix/codeql-quality-residuals` for source changes and record any alert that cannot be changed through the API.

### Task 19: GitHub governance

**Files/settings:** Repository rules plus `SECURITY.md` if absent.

- [ ] Require PRs, one approval, conversation resolution, linear history, and existing CI checks on `main`.
- [ ] Enable secret scanning/push protection if available on the repository plan.
- [ ] Replace `--no-frozen-lockfile` in CI through the owning operational PR.
- [ ] Re-query GitHub settings and record unsupported settings instead of claiming success.

## Program completion gate

Run `gh pr list --repo scriora/scriora --state open` and `git status --short`. For every PR record its URL, focused tests, package typecheck, broader check status, and dependencies. Do not merge.
