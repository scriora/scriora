# Scriora — Versioning, Compatibility & Release Contracts

> **Status:** Canonical Engineering Specification (Versioning & Release 100% Complete)
> **Scope:** All 11 Scriora Repositories — Versioning Policy, Compatibility Rules, Release Gates, and Deployment Strategy
> **Core Principle:** A change in one repository must never silently break another. Every release must be predictable, reversible, and verifiable.

---

# 1. Versioning Philosophy

Scriora is a multi-repository system where components can evolve independently. Without disciplined versioning:
- A schema change in `scriora-core` breaks `scriora-api` at runtime.
- An API field removal breaks `scriora-web` silently.
- A Skill contract change breaks live `scriora-agent` executions.

### The Three Versioning Dimensions
1. **Application Version:** Each repository's own release version.
2. **Contract Version:** The version of the interface between two repositories.
3. **Schema Version:** The database migration version.

---

# 2. Semantic Versioning (SemVer) Policy

All 11 repositories follow strict SemVer: `MAJOR.MINOR.PATCH`

| Version Component | When to Bump | Example |
| :--- | :--- | :--- |
| **MAJOR** | Breaking change to external contract | `1.0.0` → `2.0.0` |
| **MINOR** | Backward-compatible new capability | `1.0.0` → `1.1.0` |
| **PATCH** | Backward-compatible bug fix | `1.0.0` → `1.0.1` |

### What Constitutes a Breaking Change
- Removing or renaming a field from a contract or API response.
- Changing the type of an existing field.
- Removing a valid enum value that callers may depend on.
- Removing a database column or changing its type.
- Adding a NOT NULL constraint to an existing column without a default.
- Removing a public function or class from a shared library.

---

# 3. API Versioning Strategy

`scriora-api` uses **URL path versioning** for all HTTP endpoints:

```text
/api/v1/content        ← Current stable API
/api/v2/content        ← New version (when breaking change required)
```

### Rules
- `v1` and `v2` may coexist in production during the transition window.
- New versions are released alongside the old version — never replacing it immediately.
- Old versions are deprecated with a `Deprecation` response header and sunset date.
- Old versions receive critical security patches until EOL.
- `scriora-web` consumes only a single API version at a time.

---

# 4. Internal Contract Versioning

Contracts between repositories (not exposed as HTTP) use typed Zod schemas with version identifiers:

```typescript
// Contract: scriora-core → scriora-api
export const ContentDTOv1 = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  body: z.string(),
  status: ContentStatusSchema,
  createdAt: z.string().datetime(),
});

export type ContentDTOv1 = z.infer<typeof ContentDTOv1>;
```

When a breaking change is required:
1. Create `ContentDTOv2` with the new shape.
2. Update producer to emit `v2`.
3. Update consumer to accept `v2`.
4. Run contract tests against both schemas during transition.
5. Remove `v1` only when all consumers have migrated.

---

# 5. Database Schema Versioning

Every database change is a migration file tracked in version control:

```text
scriora-core/prisma/migrations/
  20260901000000_initial_schema/
  20260905120000_add_content_locale/
  20260910090000_add_approval_nonce/
  ← Never modify existing migrations
  ← Always add new migration files
```

### Migration Invariants
1. **Append-only:** Migration files are immutable once merged to `main`.
2. **Forward-only in CI:** CI runs `prisma migrate deploy`, never `reset`.
3. **Zero-downtime by default:** See zero-downtime migration strategy.
4. **Idempotent:** Re-running a migration on an already-migrated database is safe.

---

# 6. Zero-Downtime Migration Strategy

All schema changes must be deployable without taking the application offline:

### Safe (Zero-Downtime) Operations
- Adding a nullable column with no default
- Adding a new table
- Adding a new index (via `CREATE INDEX CONCURRENTLY`)
- Adding a new enum value
- Widening a VARCHAR constraint

### Unsafe (Downtime-Required) Operations
These require a multi-phase migration:

**Phase 1 (Deploy First):** Add the new column/constraint as nullable.
**Phase 2 (Background):** Backfill existing rows.
**Phase 3 (Deploy After):** Add NOT NULL constraint or drop old column.

### Example: Renaming a Column

```text
Phase 1: Add new_column (nullable), keep old_column
Phase 2: Dual-write to both columns during transition
Phase 3: Migrate reads to new_column
Phase 4: Drop old_column
```

---

# 7. MCP Protocol Versioning

`scriora-mcp` uses the MCP protocol version negotiation:

```json
{
  "protocolVersion": "2024-11-05",
  "capabilities": { "tools": {} }
}
```

- Protocol version negotiated on connection initialization.
- Tool schemas include a `version` field for individual tool evolution.
- Older protocol versions supported for minimum 6 months after new version release.

---

# 8. Skill Versioning in scriora-agent

Every Agent Skill carries a semantic version:

```typescript
export const contentGenerationSkillV2: SkillContract = {
  name: "content-generation",
  version: "2.1.0",
  // ...
};
```

- Execution records store the skill name AND version: `content-generation@2.1.0`.
- Analytics can query: "Which skill version produced better engagement?"
- Old skill versions remain loadable for 30 days after being superseded.

---

# 9. AI Model Provider Version Tracking

Every AI model call records the exact model identifier used:

```text
provider_runs.model_id = "anthropic/claude-3-5-sonnet-20241022"
```

This allows:
- Attribution of output quality to specific model versions.
- Detection of behavioral regressions after model provider updates.
- Evidence-backed decisions on model upgrades.

---

# 10. Social Platform API Version Tracking

`scriora-social` tracks the API version used per platform:

```typescript
export const linkedInAdapter: PlatformAdapter = {
  platform: "linkedin",
  apiVersion: "v2", // LinkedIn API version
  // ...
};
```

When a platform deprecates an API version:
1. New adapter version is created.
2. Old adapter version is maintained in parallel during transition.
3. Platform certification re-run on new adapter version before promoting.

---

# 11. Backward Compatibility Rules

A change is backward-compatible if existing consumers continue to work without modification:

### Always Backward-Compatible (Safe to ship)
- Adding optional fields to responses.
- Adding new endpoints.
- Adding new enum values (if consumers handle unknown values gracefully).
- Adding new tables to the database.
- Adding new agent skills.
- Adding new platform adapters.

### Never Backward-Compatible (Requires coordinated release)
- Removing fields from responses.
- Changing field types.
- Removing endpoints.
- Adding required fields to request bodies.
- Changing authentication mechanisms.

---

# 12. Deprecation Policy

When a feature or contract element must be deprecated:

1. **Announce deprecation** via `Deprecation` HTTP header and changelog entry.
2. **Minimum notice period:** 90 days for external-facing APIs; 30 days for internal contracts.
3. **Runtime warning:** Deprecated code paths emit `WARN` level log entries.
4. **Sunset date:** Hard removal date is set and communicated at deprecation time.
5. **Migration guide:** Published documentation with upgrade path.

---

# 13. Contract Compatibility Tests

Automated tests verify that producer output always satisfies consumer expectations:

```text
Consumer schema (what scriora-api expects from scriora-core)
    │
    ▼
Validated against actual producer output in CI
    │
    ├── PASS → Contract intact
    └── FAIL → Build blocked — coordination required
```

Contract tests run on every PR in both producer and consumer repositories.

---

# 14. Definition of Done — Per Repository

A feature is "done" only when all criteria are met:

**Code Quality**
- [ ] TypeScript compilation passes with zero errors (`tsc --noEmit`)
- [ ] All lint rules pass (`biome check src/`)
- [ ] Biome formatting applied

**Tests**
- [ ] Unit tests written and passing
- [ ] Coverage threshold met for the repository
- [ ] Contract tests passing for affected contracts
- [ ] Integration tests passing

**Documentation**
- [ ] Public API changes documented in OpenAPI spec
- [ ] CHANGELOG.md updated
- [ ] Breaking changes highlighted

**Security**
- [ ] No new `any` types in security-critical paths
- [ ] Input validation added for new endpoints
- [ ] Semgrep SAST scan passes

---

# 15. Quality Gate — Pull Request

```text
Gate 1: TypeScript (tsc --noEmit)              → Zero errors required
Gate 2: Biome (Lint + Format)                  → Zero warnings/errors required
Gate 3: Unit Tests (Vitest)                    → 100% pass rate
Gate 4: Coverage Check                         → Must meet repository minimum
Gate 5: Contract Tests                         → 100% pass rate
Gate 6: Integration Tests                      → 100% pass rate (test DB)
Gate 7: Semgrep SAST                           → Zero critical findings
Gate 8: Build (`pnpm build`)                   → Zero errors
```

**Merge is blocked** if any gate fails. No exceptions. No bypasses.

---

# 16. Quality Gate — Staging Release

```text
Gate 1: All PR gates passed
Gate 2: E2E Playwright suite passing           → Critical paths only
Gate 3: Media regression suite passing         → Golden fixtures match
Gate 4: Agent evaluation suite passing         → Deterministic stubs
Gate 5: Database migration applied cleanly     → On staging database
Gate 6: OWASP ZAP DAST scan                   → Zero HIGH findings
Gate 7: Load test baseline                     → p95 within thresholds
Gate 8: Rollback tested                        → Can revert in < 5 minutes
```

---

# 17. Quality Gate — Production Release (Go / No-Go)

The Production Go/No-Go Checklist:

**Functionality**
- [ ] All staging gates have passed
- [ ] Feature tested manually by at least one team member on staging
- [ ] Critical user journeys verified (publish, approve, schedule)
- [ ] Social platform adapters verified with test accounts

**Database**
- [ ] Migration applied to staging without downtime
- [ ] Migration rollback tested (if applicable)
- [ ] No destructive operations without explicit approval

**Security**
- [ ] Security checklist reviewed
- [ ] No new secrets committed
- [ ] All dependency audits clean
- [ ] DAST scan passed on staging

**Observability**
- [ ] Logs confirmed structured and routed to aggregation platform
- [ ] Alerts configured for new failure modes
- [ ] Dashboards updated for new metrics

**Rollback**
- [ ] Rollback procedure documented and tested
- [ ] Previous version deployment tested
- [ ] Data migration reversibility confirmed (or acknowledged as irreversible)

**Decision:** 🟢 GO / 🔴 NO-GO (requires team consensus)

---

# 18. Rollback Strategy

Every production release must have a defined rollback plan:

| Scenario | Rollback Action | Time Target |
| :--- | :--- | :--- |
| Application code regression | Re-deploy previous Docker image | < 2 minutes |
| Database migration regression | Apply reverse migration (if prepared) | < 15 minutes |
| Destructive DB migration | Restore from point-in-time backup | < 30 minutes |
| Social adapter regression | Disable platform in feature flag | < 1 minute |
| AI provider regression | Switch provider via router config | < 1 minute |

---

# 19. Feature Flags

Feature flags allow progressive rollout without code branches:

```typescript
const flags = {
  "mission-mode": false,          // Available only to beta workspace
  "tiktok-publishing": true,      // Available to all workspaces
  "ai-strategy-generation": false // Disabled until evaluation complete
};
```

### Feature Flag Rules
- Flags are stored in the database, not in code.
- Flags can be toggled per workspace, per user, or globally.
- Dead code paths behind old flags are removed within 30 days of full rollout.
- Agent features must pass evaluation suite before flag is enabled in production.

---

# 20. Canary Releases

For high-risk changes, traffic is split progressively:

```text
5% traffic → New version
    │ Monitor error rates and p95 for 30 minutes
    ▼
25% traffic → New version
    │ Monitor
    ▼
100% traffic → New version
```

Canary is aborted and rolled back immediately if:
- Error rate exceeds 1% above baseline.
- p95 latency exceeds 200% of baseline.

---

# 21. Blue-Green Deployment

For zero-downtime releases of stateful changes:

```text
Blue (current production) ← 100% traffic

Green (new version deployed)
    │ Smoke tests pass
    ▼
Traffic switched: Blue ← 0%, Green ← 100%
    │ Monitoring window (15 minutes)
    ▼
Blue decommissioned OR kept hot for rollback
```

---

# 22. Self-Hosted Release Packaging

Scriora releases a self-hosted distribution package:

```text
scriora-release-v1.2.0/
  ├── docker-compose.yml          # Full stack definition
  ├── docker-compose.worker.yml   # Worker extension
  ├── .env.template               # Configuration template
  ├── init-db.sql                 # Initial database schema
  ├── INSTALL.md                  # Installation guide
  ├── UPGRADE.md                  # Upgrade instructions
  └── CHANGELOG.md                # What's new
```

### Self-Hosted Upgrade Path
1. Pull new Docker images from registry.
2. Run database migration: `docker exec scriora-core pnpm migrate:deploy`.
3. Restart services: `docker compose up -d`.
4. Verify health endpoints.

---

# 23. Changelog Standards

Every release publishes a structured changelog:

```markdown
## [1.2.0] — 2026-09-15

### Added
- LinkedIn PDF carousel publishing (Tier 1 platform)
- Mission Mode goal tracking dashboard

### Changed
- Content approval flow now supports external reviewer signed links

### Fixed
- Video aspect ratio calculation for 9:16 TikTok format

### Security
- Signed approval links now enforce single-use nonce

### Breaking Changes (MAJOR only)
- None
```

---

# 24. Release Calendar & Cadence

| Track | Cadence | Type |
| :--- | :--- | :--- |
| Patch releases | As needed | Bug fixes, security patches |
| Minor releases | Bi-weekly | New features (backward-compatible) |
| Major releases | Quarterly | Breaking changes (with migration guide) |
| Security hotfixes | Immediately | Critical CVE patches |

---

# 25. Status: 100% Complete

```text
Versioning, Compatibility & Release Contracts
████████████████████████████████████ 100% COMPLETE
```

All SemVer policies, API versioning strategy, zero-downtime migration protocols, PR/Staging/Production quality gates, Go/No-Go checklist, rollback strategies, feature flag architecture, and self-hosted release packaging specifications are formally frozen and canonical.
