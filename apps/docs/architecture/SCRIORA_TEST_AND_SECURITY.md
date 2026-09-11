# Scriora — Test Strategy & Security Architecture

> **Status:** Canonical Engineering Specification (Test Strategy & Security 100% Complete)
> **Scope:** All 11 Scriora Repositories
> **Core Principle:** Tests and security are not optional layers added at the end. They are baked into every boundary, contract, and state transition from the first line of code.

---

# PART I — TEST STRATEGY

---

# 1. Testing Philosophy

Scriora adopts a **Contract-First, Evidence-Driven** testing philosophy:

1. Every inter-repository boundary has an explicit contract test.
2. Every state transition has a unit test.
3. Every API route has an integration test against a real database.
4. Every agent cognitive path has a deterministic stub evaluation.
5. Every media transformation has a visual regression golden fixture.
6. Every security boundary has a penetration test.

> **The test suite is the living proof that the architecture works.**

---

# 2. The Unified Test Pyramid

```text
                   ┌─────────────────────────────────┐
                   │     Evaluation / Regression     │  ← Agent AI quality
                   ├─────────────────────────────────┤
                   │         E2E Tests               │  ← Full user journeys
                   ├─────────────────────────────────┤
                   │      Security Tests             │  ← Penetration & audit
                   ├─────────────────────────────────┤
                   │     Integration Tests           │  ← Real DB, real queue
                   ├─────────────────────────────────┤
                   │      Contract Tests             │  ← Inter-repo boundaries
                   ├─────────────────────────────────┤
                   │        Unit Tests               │  ← Pure functions, state
                   └─────────────────────────────────┘
```

---

# 3. Test Tooling Stack

| Layer | Tool | Rationale |
| :--- | :--- | :--- |
| Unit / Integration | **Vitest** | Fast, ESM-native, TypeScript-first |
| API Integration | **Supertest** | HTTP assertion against live routes |
| E2E Browser | **Playwright** | Cross-browser, reliable selectors |
| Agent Evaluation | **Custom Harness** | Deterministic stub execution |
| Load Testing | **K6** | JS-based, CI-compatible |
| Contract Testing | **Zod + Custom** | Schema contract validation |
| Media Regression | **Sharp + pHash** | Perceptual hash comparison |
| Security Scanning | **OWASP ZAP / Semgrep** | DAST + SAST automated |

---

# 4. Mandatory Coverage Thresholds

Every repository must meet these minimums before merge:

| Repository | Min Line Coverage | Contract Tests | Security Tests |
| :--- | :---: | :---: | :---: |
| `scriora-core` | 90% | Required | Required |
| `scriora-social` | 85% | Required | Required |
| `scriora-api` | 85% | Required | Required |
| `scriora-web` | 70% | Required | Optional |
| `scriora-worker` | 85% | Required | Required |
| `scriora-media` | 90% | Required | Required |
| `scriora-agent` | 80% | Required | Required |
| `scriora-mcp` | 85% | Required | Required |
| `scriora-cli` | 75% | Optional | Optional |
| `scriora-docs` | N/A | N/A | N/A |
| `scriora-cloud` | N/A | N/A | N/A |

---

# 5. Unit Tests — Standards

Unit tests target pure functions, domain logic, and state machines:
- **Scope:** Single function, single class, no external I/O.
- **Dependencies:** All external dependencies mocked via `vi.mock()`.
- **Speed:** Must complete in under 5 seconds for the entire unit suite.
- **Naming:** `describe("EntityName") → it("should [observable behavior]")`

### What Must Have Unit Tests
- Every State Machine transition
- Every domain validation function
- Every error classification function
- Every media processing utility
- Every policy evaluation rule
- Every skill input/output transformer

---

# 6. Contract Tests — The Inter-Repository Boundary Shield

Contract tests verify that a producer's output conforms to a consumer's expectation:

```text
Consumer (e.g., scriora-api)
    Defines expected response shape via Zod schema

Producer (e.g., scriora-core)
    Must emit data conforming to that schema
```

### Contract Test Matrix

| Consumer → | scriora-core | scriora-social | scriora-media | scriora-agent |
| :--- | :---: | :---: | :---: | :---: |
| **scriora-api** | ✓ Required | ✓ Required | ✓ Required | ✓ Required |
| **scriora-worker** | ✓ Required | ✓ Required | ✓ Required | - |
| **scriora-agent** | ✓ Required | ✓ Required | ✓ Required | - |
| **scriora-mcp** | ✓ Required | - | - | ✓ Required |
| **scriora-web** | Via API | - | - | - |

---

# 7. Integration Tests — Real Infrastructure

Integration tests run against actual PostgreSQL (test database), Redis, and object storage:

- **Isolation:** Each test suite runs in a dedicated schema transaction, rolled back after completion.
- **Seeding:** Fixture factories produce deterministic test data sets.
- **No Mocks for DB:** Database interactions use real queries to catch index failures, constraint violations, and RLS issues.
- **Parallelism:** Suites run in parallel with isolated schemas per worker.

---

# 8. Database Integration Tests

Every database-touching operation must have an integration test verifying:
1. Record created with correct field values.
2. Unique constraints are enforced (duplicate rejection).
3. Foreign key constraints are enforced (orphan rejection).
4. RLS prevents cross-tenant reads and writes.
5. Cascade deletes fire correctly.
6. Timestamps are set by database triggers, not application code.

---

# 9. E2E Tests — Full User Journey

Playwright tests simulate real user interactions across the full stack:

### Critical Paths Under E2E Coverage
1. **Workspace Onboarding:** Register → Connect Social Account → Create First Content → Schedule
2. **Classic Publishing Flow:** Create Draft → Approve → Schedule → Verify Published State
3. **Approval Flow:** Request Approval → Open Signed Link → Approve → Verify Publication
4. **Mission Mode Flow:** Create Mission → Define Goal → Review Agent Strategy → Approve Content → Publish
5. **Media Upload Flow:** Upload Video → Confirm Processing → Attach to Post → Publish

---

# 10. API Route Integration Tests

Every `scriora-api` route must have Supertest integration tests covering:
- **Happy path:** Valid input → expected response shape and status code.
- **Validation failure:** Invalid input → 422 with structured error body.
- **Authentication failure:** Missing/invalid JWT → 401.
- **Authorization failure:** Valid JWT but wrong workspace → 403.
- **Not found:** Non-existent resource ID → 404.
- **Rate limiting:** Burst beyond threshold → 429 (where applicable).

---

# 11. Worker Job Tests

Every Inngest job handler must have integration tests verifying:
- Correct execution on valid payload.
- Idempotency: running the same job twice produces the same result.
- Retry behavior: transient failure triggers retry with backoff.
- Terminal failure: permanent error marks job as failed without retry loop.
- Cancellation: job respects cancellation signal mid-execution.

---

# 12. Agent Evaluation Tests — Deterministic AI Stubs

Agent tests use fully deterministic stubs — no live LLM calls during CI:

### Evaluation Dimensions
1. **Schema Compliance:** Output conforms to `OutputSchema` Zod contract.
2. **Policy Compliance:** No tool invoked without required permission.
3. **Evidence Grounding:** Every insight references at least one Evidence ID.
4. **Hallucination Detection:** Zero fabricated metrics or platform capabilities.
5. **Tool Selection Precision:** Correct tool chosen for each step.
6. **Context Economy:** Context payload within defined token budget.
7. **Failure Recovery:** Graceful degradation on tool failure or provider timeout.

### Mandatory Evaluation Scenarios
- Mission with complete Goal context → correct strategy structure
- Mission with missing baseline metric → explicit `UNKNOWN` (not hallucinated value)
- Content generation with brand taboo word → content rejected, not published
- Policy L2 task requiring L3 approval → approval request emitted, not auto-published
- Prompt injection in social platform comment → treated as data, not instruction

---

# 13. Media Processing Tests

Media tests validate binary transformations with exact assertions:

### Image Test Cases
- JPEG 1920×1080 → crop to 1080×1350 (4:5) → verify pixel dimensions, format, file size
- PNG with transparency → WebP conversion → verify alpha channel preserved
- Panorama 3240×1080 → split into 3 tiles of 1080×1080 → verify seam alignment via pHash

### Video Test Cases
- MP4 H.264 1080p → transcode to baseline → verify codec string, faststart atom position
- Variable frame rate video → normalize to 30fps → verify duration delta < 0.1s
- Video with audio → transcode → verify audio-video sync drift < 50ms

### Security Test Cases
- JPEG with embedded PHP code → magic byte check → rejected with `INVALID_MAGIC_BYTES`
- PNG decompression bomb → pixel count check → rejected before decode
- Malformed MP4 with corrupt moov → container parse → rejected with `CORRUPTED_STREAM`

---

# 14. Social Platform Integration Tests (Mock Adapters)

Platform tests use mock HTTP servers (MSW / nock) simulating real platform API responses:
- Successful publish → extract and store external post ID
- Rate limit 429 response → classify as `RATE_LIMITED`, schedule retry
- OAuth token expired 401 → classify as `AUTH_FAILURE`, revoke account, alert user
- Network timeout → classify as `EXTERNAL_UNKNOWN`, trigger reconciliation
- Platform maintenance 503 → classify as `TRANSIENT`, retry with backoff

---

# 15. MCP Transport Tests

`scriora-mcp` tests verify:
- Tool invocations through MCP protocol execute correct underlying Application Contracts.
- Human Approval gates are not bypassed by MCP tool calls.
- Cross-tenant resource access is structurally blocked.
- Unknown tool names return standard MCP error responses.
- Tool arguments are strictly validated before execution.

---

# 16. CLI Tests

`scriora-cli` tests verify:
- Every command produces correct stdout output and exit codes.
- Invalid arguments produce human-readable error messages.
- Auth tokens are read from secure config paths, not environment variable leaks.

---

# 17. Load & Performance Tests (K6)

Performance targets verified via K6 load scripts:

| Endpoint | p95 Target | Concurrent Users | Pass Threshold |
| :--- | :---: | :---: | :---: |
| `GET /content` | < 120ms | 500 | Error rate < 0.1% |
| `POST /publications` | < 300ms | 200 | Error rate < 0.5% |
| `GET /analytics/metrics` | < 500ms | 200 | Error rate < 0.1% |
| `POST /media/upload-url` | < 100ms | 100 | Error rate < 0.1% |
| Agent task initiation | < 2s | 50 | Error rate < 1% |

---

# 18. Database Migration Tests

Every database migration must pass a migration integration test:
1. Apply migration on a clean test database → verify schema state matches expected.
2. Apply migration on a database with production-like volume seed → verify completion in under 30 seconds.
3. Verify RLS policies remain intact after migration.
4. Verify existing data conforms to new constraints.

---

# 19. CI/CD Pipeline Gate Requirements

Every pull request must pass all gates before merge is permitted:

```text
Gate 1: TypeScript Compilation (tsc --noEmit)        → Zero errors
Gate 2: Biome (Lint + Format)                        → Zero warnings/errors
Gate 3: Unit Tests (Vitest)                          → All pass
Gate 4: Coverage Threshold                           → Must meet per-repo minimum
Gate 5: Contract Tests                               → All pass
Gate 6: Integration Tests                            → All pass (test DB)
Gate 7: Security Scan (Semgrep)                      → Zero critical findings
Gate 8: Build Artifact                               → Successful compilation
```

---

# 20. Regression Suite Execution Policy

Regression tests run on every merge to `main`:
- Full media golden fixture suite
- Full agent evaluation suite
- Full E2E browser suite (Playwright)
- Full security scan (OWASP ZAP DAST)

Results are published as CI artifacts and compared to previous baseline.

---

# 21. Test Data & Fixture Strategy

- **Factory Pattern:** All test data generated via typed factories (`createWorkspace()`, `createContent()`).
- **No Hardcoded IDs:** UUIDs always generated dynamically in tests.
- **No Shared State:** Every test suite sets up and tears down its own data.
- **Golden Media Fixtures:** Stored in `__fixtures__/media/` directory per repository.
- **Sensitive Data:** Test fixtures must never contain real PII, credentials, or secrets.

---

# 22. Snapshot Testing Policy

- **Approved Use:** API response shapes, rendered HTML output for email templates.
- **Prohibited Use:** Pixel-perfect UI snapshots (too brittle; use visual regression instead).
- **Update Policy:** Snapshots may only be updated intentionally via `--update-snapshots` flag.

---

# 23. Test Environment Configuration

Each repository ships a `vitest.config.ts` with:
- Test database URL pointing to isolated test schema.
- Redis URL pointing to dedicated test instance.
- Storage provider pointing to local MinIO or mock.
- All external API calls disabled by default (no accidental live calls).

---

# 24. Deterministic Time in Tests

All tests use controlled, frozen time:
- `vi.useFakeTimers()` for unit tests involving expiry or TTL logic.
- Database `now()` overridden via session variable in integration tests.
- No `Date.now()` calls in production code — always injected via context.

---

# 25. The No-Flaky-Test Mandate

Flaky tests must be eliminated immediately upon detection:
1. Identify source of non-determinism (network, time, random, shared state).
2. Fix or quarantine within 24 hours of detection.
3. Quarantined tests tracked as technical debt issues.

---

# PART II — SECURITY ARCHITECTURE

---

# 26. Security Philosophy — Zero Trust

Scriora adopts a **Zero Trust Security Model**:

> **Never trust. Always verify. Enforce at every layer.**

Every request, every agent action, every file upload, every webhook, and every internal service call is authenticated, authorized, and validated independently — regardless of where it originates.

---

# 27. Security Layers

```text
Layer 1: Network & Transport      → TLS 1.3, HTTPS-only, HSTS
Layer 2: Authentication           → JWT, Sessions, HMAC Signed Links
Layer 3: Authorization            → RBAC, Row Level Security (RLS)
Layer 4: Input Validation         → Zod schemas at every boundary
Layer 5: Business Logic           → Domain invariants, policy engine
Layer 6: Data Isolation           → Tenant-scoped queries, RLS
Layer 7: Secret Management        → Environment variables, Vault
Layer 8: Observability & Audit    → Immutable audit logs, alerts
```

---

# 28. OWASP Top 10 — Scriora Mapping

| OWASP Risk | Scriora Mitigation |
| :--- | :--- |
| A01 Broken Access Control | RLS on all tables, RBAC checks in API layer |
| A02 Cryptographic Failures | TLS 1.3, bcrypt for passwords, AES-256 at rest |
| A03 Injection | Prisma parameterized queries, zero raw SQL |
| A04 Insecure Design | Threat modeling per feature, contract tests |
| A05 Security Misconfiguration | Hardened Docker images, secret scanning in CI |
| A06 Vulnerable Components | Dependabot + automated CVE scanning |
| A07 Auth Failures | JWT expiry, refresh rotation, session invalidation |
| A08 Software & Data Integrity | Webhook HMAC verification, signed releases |
| A09 Logging Failures | Structured audit logs, no secrets in logs |
| A10 SSRF | Block internal IP ranges in media import |

---

# 29. Authentication Architecture

Scriora uses a layered authentication model:

```text
Browser User
    ├── Session Cookie (HTTP-only, Secure, SameSite=Strict)
    └── JWT Bearer Token (for API clients)

External Agent (MCP)
    └── API Key + HMAC Signature

Approval Reviewer (External Stakeholder)
    └── Signed Link (HMAC-SHA256, 7-day TTL, single-use nonce)
```

---

# 30. JWT Security Standards

- **Algorithm:** RS256 (asymmetric) — private key on auth server, public key on API.
- **Access Token TTL:** 15 minutes.
- **Refresh Token TTL:** 30 days (stored HTTP-only cookie).
- **Claims:** `sub`, `workspace_id`, `role`, `iat`, `exp` — no sensitive PII.
- **Rotation:** Refresh tokens are rotated on every use (sliding window).
- **Revocation:** Revoked refresh tokens stored in Redis blocklist.

---

# 31. RBAC — Role-Based Access Control

Every workspace user has a role:

| Role | Capabilities |
| :--- | :--- |
| `OWNER` | Full workspace control, billing, member management |
| `ADMIN` | Content, publishing, social accounts, team management |
| `EDITOR` | Create/edit content, request approval, view analytics |
| `VIEWER` | Read-only access to content and analytics |
| `EXTERNAL_APPROVER` | Approve/reject specific approval requests via signed link only |

All role checks are enforced in `scriora-api` middleware before request reaches domain logic.

---

# 32. Row Level Security (RLS) Policy

All tables in Scriora that contain tenant-specific data have RLS enabled:

```sql
-- Pattern for all business tables
ALTER TABLE contents ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON contents
    USING (workspace_id = current_setting('app.current_workspace_id')::uuid);
```

### RLS Invariants
- **Zero rows returned** if `workspace_id` is not set in the session.
- **Service role** (used only in migrations and admin operations) bypasses RLS explicitly.
- **Agents never receive service role credentials.**
- **All SELECT, INSERT, UPDATE, DELETE** are gated by RLS.

---

# 33. SQL Injection Prevention

- Prisma ORM used exclusively — zero raw SQL strings in application code.
- All query parameters are bound via Prisma's parameterized query engine.
- Dynamic ORDER BY / WHERE expressions validated against allowlist of column names.
- Database user has minimal privileges — no DDL access from application runtime.

---

# 34. Webhook Security — HMAC-SHA256

All incoming webhooks (social platform events, Stripe billing events) are verified:

```text
Incoming Webhook Request
    │
    ▼
Extract X-Signature Header
    │
    ▼
Compute HMAC-SHA256(request_body, platform_secret)
    │
    ▼
Timing-safe comparison (crypto.timingSafeEqual)
    │
    ▼
Reject if mismatch → Log attempt with IP
    │
    ▼
Check idempotency key against Redis
    │
    ▼
Process exactly once
```

---

# 35. Replay Attack Prevention

- Every webhook carries a `timestamp` claim.
- Webhooks older than 5 minutes are rejected.
- Webhook event ID stored in Redis with 24-hour TTL for idempotency.

---

# 36. Signed Approval Links — Security Model

```text
HMAC-SHA256(
    workspace_id + approval_id + nonce + expires_at,
    workspace_signing_secret
)
```

- **Raw token is NEVER stored** — only `token_hash` (SHA-256 of the raw token).
- **Single-use:** Token is marked consumed on first use; replay rejected.
- **TTL:** Default 7 days, configurable per workspace policy.
- **Scope:** Token grants access ONLY to the specific approval action — not workspace-wide.

---

# 37. Media Upload Security

```text
Untrusted File Upload
    │
    ▼
Workspace size quota check (before accepting bytes)
    │
    ▼
MIME type validation (magic bytes, NOT file extension)
    │
    ▼
Container structure validation (MP4 atoms, PDF headers)
    │
    ▼
Decompression bomb check (image pixel count before decode)
    │
    ▼
Processing sandbox (non-root, no network, resource limits)
    │
    ▼
EXIF metadata sanitization (GPS stripped from public variants)
    │
    ▼
Virus/malware scan (optional, enterprise tier)
    │
    ▼
Stored in private bucket (no public ACL)
```

---

# 38. Object Storage Security

- All storage buckets have **ACL: Private** by default.
- No public URLs are issued for raw assets.
- Assets are served via **Presigned URLs** with configurable expiration (15 minutes default).
- CORS headers restrict presigned URL usage to Scriora origins only.
- Bucket policies block all direct S3 API access from non-application identities.

---

# 39. Agent Security — OAuth Token Shield

The Agent Framework is hermetically isolated from social credentials:

```text
Agent ──► social.publish(account_id: UUID) ──► Social Contract
                                                      │
                                                      ▼
                                             Token Vault (scriora-core)
                                                      │
                                                      ▼
                                              Platform SDK Call
```

- The Agent NEVER receives `access_token`, `refresh_token`, or `client_secret`.
- Token Vault is accessible only to `scriora-social` via encrypted internal service call.

---

# 40. Prompt Injection Defense

All external untrusted content (social post text, imported documents, web scrapes) is treated as hostile input:

1. **Boundary Delimiters:** Injected into prompts with explicit `[USER_CONTENT_START]` / `[USER_CONTENT_END]` markers.
2. **System Instruction Lock:** System prompt begins with non-overridable instructions that cannot be cancelled by user content.
3. **Content Filtering:** Outputs containing instruction-like patterns trigger review before acceptance.
4. **Privilege Separation:** The model processes content inside a strict data context that cannot issue tool calls.

---

# 41. Tool Injection Protection

The Runtime enforces pre-execution authorization checks independently of the LLM's output:

```text
LLM Output: { tool: "social.publish", args: {...} }
    │
    ▼
Tool Registry Lookup → Tool exists? (If no → reject)
    │
    ▼
Permission Check → Workspace has platform enabled? (If no → reject)
    │
    ▼
Policy Engine → Action permitted at current autonomy level? (If no → reject / request approval)
    │
    ▼
Argument Schema Validation → All args conform to Zod schema? (If no → reject)
    │
    ▼
Execute tool safely
```

---

# 42. Cross-Tenant Isolation Tests

Penetration tests specifically verify cross-tenant attack resistance:
- User from Workspace A cannot read Workspace B content (RLS test).
- Agent task in Workspace A cannot query Workspace B analytics.
- Approval token from Workspace A cannot be used in Workspace B.
- Media presigned URL for Workspace A asset fails when accessed by Workspace B user.

---

# 43. Secret Management Standards

- **No hardcoded secrets** anywhere in source code (enforced by Semgrep + Gitleaks CI scan).
- **Development:** `.env.local` files not committed (enforced by `.gitignore`).
- **Staging/Production:** Secrets loaded from environment variables or Vault (HashiCorp Vault or Doppler).
- **Rotation Policy:** Database passwords and signing keys rotate every 90 days.
- **Audit Logging:** Every secret access is logged with principal and timestamp.

---

# 44. Environment Variable Standards

```text
# Database
DATABASE_URL                      # Encrypted at rest in Vault
DATABASE_SERVICE_ROLE_URL         # Only for migrations, never application runtime

# Auth
AUTH_JWT_PRIVATE_KEY              # RS256 private key
AUTH_JWT_PUBLIC_KEY               # RS256 public key
AUTH_SIGNING_SECRET               # HMAC for signed links

# Storage
STORAGE_PROVIDER                  # s3 | r2 | minio
STORAGE_ACCESS_KEY_ID
STORAGE_SECRET_ACCESS_KEY
STORAGE_BUCKET_NAME
STORAGE_ENDPOINT                  # For MinIO / R2

# Social Platforms
# Never stored as plain env vars — stored encrypted in DB, decrypted via Vault at runtime

# AI Providers
OPENAI_API_KEY
ANTHROPIC_API_KEY
# Never logged, never emitted in error messages
```

---

# 45. Audit Trail Architecture

Every significant action produces an immutable audit record:

```text
AuditLog
 ├── id: UUID
 ├── workspace_id: UUID
 ├── actor_id: UUID (user, agent, or system)
 ├── actor_type: USER | AGENT | SYSTEM | EXTERNAL
 ├── action: String (e.g., "content.approve", "publication.execute")
 ├── resource_type: String
 ├── resource_id: UUID
 ├── outcome: SUCCESS | FAILURE | BLOCKED
 ├── metadata: JSON (sanitized, no secrets)
 └── created_at: Timestamp
```

Audit logs are append-only — no UPDATE or DELETE permitted on this table.

---

# 46. Rate Limiting Strategy

| Endpoint Category | Limit | Window | Response |
| :--- | :---: | :---: | :---: |
| Auth endpoints | 10 requests | 1 minute | 429 + Retry-After |
| Content creation | 60 requests | 1 minute | 429 + Retry-After |
| Media upload registration | 30 requests | 1 minute | 429 + Retry-After |
| Agent task initiation | 10 requests | 1 minute | 429 + Retry-After |
| Webhook ingress | 100 requests | 1 minute | 429 + Retry-After |
| Analytics queries | 120 requests | 1 minute | 429 + Retry-After |

Rate limits are enforced in Redis using a sliding window algorithm per workspace.

---

# 47. CORS Security Policy

```text
Allowed Origins:    Explicit whitelist (no wildcard *)
Allowed Methods:    GET, POST, PUT, PATCH, DELETE, OPTIONS
Allowed Headers:    Content-Type, Authorization, X-Workspace-ID
Credentials:        true (required for cookie-based auth)
Max Age:            86400 (24 hours preflight cache)
```

---

# 48. Security Headers (HTTP)

Every API and web response includes:

```text
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Content-Security-Policy: default-src 'self'; ...
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

---

# 49. Dependency Security

- **Dependabot / Renovate:** Automated dependency update PRs for all repositories.
- **`npm audit` / `pnpm audit`:** Runs in CI — fails build on HIGH or CRITICAL vulnerabilities.
- **License Compliance:** FOSS licenses only (MIT, Apache 2.0, BSD). GPL-licensed dependencies prohibited in distributed builds.
- **Pinned Lockfiles:** `pnpm-lock.yaml` committed and enforced — no `--no-lockfile` builds.

---

# 50. Container & Infrastructure Security

- **Non-root containers:** All Docker images run as `uid=1001` non-root user.
- **Read-only filesystem:** Container filesystems mounted read-only where possible.
- **No privileged containers:** Zero `--privileged` flags.
- **Minimal base images:** Alpine Linux or distroless images preferred.
- **Secret injection:** Secrets mounted as environment variables from Vault — never baked into images.
- **Image signing:** Production images signed via cosign.

---

# 51. Penetration Testing Schedule

| Test Type | Frequency | Owner |
| :--- | :--- | :--- |
| SAST (Semgrep) | Every PR | CI Pipeline |
| DAST (OWASP ZAP) | Every `main` merge | CI Pipeline |
| Dependency Audit | Daily | Dependabot |
| Cross-tenant isolation | Every release | QA Team |
| Social credential boundary | Every release | Security Team |
| Agent prompt injection | Every agent change | Security Team |
| Full penetration test | Quarterly | External Firm |

---

# 52. Security Incident Response Plan

```text
Detection
    │
    ▼
Triage (Severity: P0=Critical, P1=High, P2=Medium, P3=Low)
    │
    ▼
P0/P1: Immediate rotation of affected credentials
P0/P1: Workspace notification within 1 hour
    │
    ▼
Root cause analysis
    │
    ▼
Patch + regression test
    │
    ▼
Post-mortem document published internally
```

---

# 53. Data Retention & Deletion

- **User data deletion:** Full GDPR-compliant erasure within 30 days of account termination request.
- **Audit logs:** Retained for 2 years (compliance).
- **Analytics snapshots:** Retained for 1 year, then aggregated and anonymized.
- **Temporary media:** Deleted within 48 hours if not attached to content.
- **Published post metrics:** Retained indefinitely (business data, not PII).

---

# 54. PII Handling Standards

- User email, name, and profile data stored in dedicated `users` table with encryption at rest.
- PII is never included in:
  - Log messages
  - Error messages returned to clients
  - Agent context payloads
  - Analytics aggregations
  - Media EXIF metadata in public variants

---

# 55. The Security Testing Checklist (Per Feature Release)

Before any feature touching auth, publishing, agent, or media ships to production:

```text
□ RLS tested for new table
□ Input validation tested with invalid/malicious inputs
□ Cross-tenant access tested
□ Webhook HMAC verified
□ Signed link single-use tested
□ Secret never logged
□ Dependency audit passed
□ SAST scan passed with zero critical findings
□ Rate limit tested
□ Rollback tested
```

---

# 56. Formal Security Invariants

1. **No data crosses workspace boundaries.**
2. **No credentials flow through the Agent.**
3. **No webhook processed without HMAC verification.**
4. **No file trusted by extension alone.**
5. **No approval bypassable by any automated system.**
6. **No secrets logged or emitted in error responses.**
7. **No direct SQL execution in application code.**
8. **No public S3 buckets.**
9. **No `any` type in TypeScript security-critical code paths.**
10. **No production deployment without passing security gates.**

---

# 57. Status: 100% Complete

```text
Test Strategy & Security Architecture
████████████████████████████████████ 100% COMPLETE
```

All test pyramid layers, coverage thresholds, CI/CD gates, OWASP mitigation strategies, authentication architecture, RLS policies, agent security boundaries, and formal security invariants for Scriora are formally frozen and canonical.
