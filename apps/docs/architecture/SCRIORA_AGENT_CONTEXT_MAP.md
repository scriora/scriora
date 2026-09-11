# Scriora — Agent Context Map

> **READ THIS FILE FIRST. READ NOTHING ELSE UNTIL THIS FILE IS FULLY PARSED.**
>
> **Type:** Tier-1 Mandatory Context (Always Loaded)
> **Purpose:** This document is the navigation layer for any agent executing Scriora tasks. It tells you exactly which documents to read, and which to ignore, for any given task. Reading all 14 canonical documents at once is prohibited — it wastes context and degrades output quality.
>
> **Size:** Intentionally compact. This file replaces the need to scan 14 documents blindly.

---

# SECTION 1 — HOW TO USE THIS MAP

## The Three-Tier Context Protocol

```
Tier 1 — ALWAYS LOAD (this file only)
    You are reading it now.
    Size: ~10 KB. Always fits in context.
    Contains: Document index, task-to-file map, invariants, quick-reference.

Tier 2 — LOAD FOR YOUR SPECIFIC TASK (2-4 files max)
    Consult Section 3 (Task → Context Map).
    Match your current task to the row. Load only those files.
    Never load more than 4 Tier-2 documents at once.

Tier 3 — LOOKUP ON DEMAND (read specific sections, not full files)
    Use only when a Tier-2 file references a concept you need to verify.
    Read the specific section number, not the entire file.
```

## The Single Rule

> For any task, your active context must be:
> `this file + up to 4 task-specific files`
>
> If you feel you need more, the task scope is too large. Break it into sub-tasks.

---

# SECTION 2 — THE 14 CANONICAL DOCUMENTS

One-line decision authority for each file.

| # | File | Read When You Need To... |
| :-- | :-- | :-- |
| 1 | `SCRIORA_ARCHITECTURE_BASELINE.md` | Understand the overall system, 20 invariants, product loop, all 11 repos overview |
| 2 | `SCRIORA_REPOSITORY_CONTRACT_MATRIX.md` | Know which repo owns what, who calls whom, forbidden dependency directions |
| 3 | `SCRIORA_USE_CASE_CATALOG.md` | Implement a specific user-facing feature or flow end-to-end |
| 4 | `SCRIORA_DOMAIN_MODEL_AND_DB_OWNERSHIP.md` | Work with domain entities, understand table ownership, business rules |
| 5 | `SCRIORA_DATABASE_CONTRACT.md` | Implement database schema, fields, constraints, indexes for core entities |
| 6 | `SCRIORA_FINAL_DATABASE_CONTRACT.md` | Implement Approval domain, Analytics domain, or Retention policies |
| 7 | `SCRIORA_REPOSITORY_CONTRACT_ARCHITECTURE.md` | Implement inter-repo contracts, Application Contracts, event/command shapes |
| 8 | `SCRIORA_SOCIAL_PLATFORM_FRAMEWORK.md` | Work on any social platform adapter, OAuth, webhook, or capability model |
| 9 | `SCRIORA_AGENT_FRAMEWORK.md` | Implement any agent skill, tool, memory tier, policy, or provider |
| 10 | `SCRIORA_MEDIA_FRAMEWORK.md` | Implement media ingestion, processing, storage, or transformation |
| 11 | `SCRIORA_TEST_AND_SECURITY.md` | Write tests, enforce security rules, set up CI gates |
| 12 | `SCRIORA_STATE_AND_ERROR_MODEL.md` | Handle state transitions, classify errors, implement retry/DLQ logic |
| 13 | `SCRIORA_VERSIONING_AND_RELEASE.md` | Release a change, write migrations, deprecate an API, set quality gates |
| 14 | `SCRIORA_REPOSITORY_SPECIFICATIONS.md` | Scaffold a repository, set up tooling, configure environment variables |

---

# SECTION 3 — TASK → CONTEXT MAP

Find your task. Load only the listed files.

---

## 3.1 — Scaffolding & Setup Tasks

| Task | Load These Files (Tier 2) |
| :-- | :-- |
| Scaffold any new repository from scratch | `#14` (repo specs) + `#2` (contract matrix) + `#11` (test setup) |
| Set up `scriora-core` | `#14` + `#4` (domain model) + `#5` (DB contract) |
| Set up `scriora-api` | `#14` + `#7` (contracts) + `#12` (error model) |
| Set up `scriora-web` | `#14` + `#3` (use cases for UI flows) |
| Set up `scriora-worker` | `#14` + `#7` (contracts) + `#12` (state/error) |
| Set up `scriora-social` | `#14` + `#8` (social framework) |
| Set up `scriora-agent` | `#14` + `#9` (agent framework) |
| Set up `scriora-media` | `#14` + `#10` (media framework) |
| Set up `scriora-mcp` | `#14` + `#7` (contracts) + `#9` (agent, tool shapes) |
| Set up `scriora-cloud` (Docker/K8s) | `#14` + `#1` (architecture baseline, deployment section) |

---

## 3.2 — Database & Schema Tasks

| Task | Load These Files (Tier 2) |
| :-- | :-- |
| Write Prisma schema for core business entities | `#5` + `#4` + `#12` (states as enums) |
| Write migration for Content / Publication / Approval | `#5` + `#13` (zero-downtime migration strategy) |
| Write migration for Mission / Hypothesis / Experiment | `#6` + `#13` |
| Add RLS policies | `#5` + `#11` (RLS security requirements) |
| Add new index to existing table | `#5` + `#13` (migration safety) |
| Implement Analytics timeseries schema | `#6` + `#4` |

---

## 3.3 — API & HTTP Layer Tasks

| Task | Load These Files (Tier 2) |
| :-- | :-- |
| Implement any HTTP endpoint in `scriora-api` | `#7` (contracts) + `#12` (error codes/states) + `#3` (use case) |
| Implement input validation (Zod schemas) | `#7` + `#12` |
| Implement authentication middleware | `#11` (auth security model) + `#7` |
| Implement rate limiting | `#11` (rate limit table) + `#14` (api env vars) |
| Implement Webhook ingress endpoint | `#8` (social webhooks) + `#11` (HMAC security) |
| Implement Approval signed-link endpoint | `#6` (approval domain) + `#11` (signed link security) |
| Generate OpenAPI spec | `#7` (contracts) + `#13` (versioning strategy) |

---

## 3.4 — Publishing & Social Tasks

| Task | Load These Files (Tier 2) |
| :-- | :-- |
| Implement a new platform adapter | `#8` (social framework) + `#12` (platform error normalization) |
| Implement OAuth flow for a platform | `#8` (OAuth adapters section) + `#11` (token security) |
| Implement publish job (worker) | `#8` + `#12` (Publication state machine) + `#7` (OutboxCommand contract) |
| Implement verification after publish | `#12` (VERIFYING → SUCCEEDED / UNKNOWN) + `#8` |
| Implement rate limit tracking per platform | `#8` (rate limit normalization) + `#12` (RETRYABLE classification) |
| Add platform capability model | `#8` (capability model section) |

---

## 3.5 — Agent & AI Tasks

| Task | Load These Files (Tier 2) |
| :-- | :-- |
| Implement a new deterministic Skill | `#9` (skill contract section) + `#12` (SkillExecution state) |
| Implement an AI-driven Skill | `#9` (full) + `#12` (AgentTask state + agent error codes) |
| Implement a new Tool | `#9` (tools vs skills section) + `#7` (which contract the tool wraps) |
| Implement Provider Router / Failover | `#9` (provider router section) + `#12` (provider error codes) |
| Implement Agent Memory tier | `#9` (6-tier memory section) |
| Write Agent evaluation tests | `#9` (evaluation section) + `#11` (agent evaluation test requirements) |
| Implement Mission execution loop | `#9` (Mission loop) + `#3` (Mission use case) + `#12` (Mission state machine) |
| Implement Human Approval Gate | `#9` (Sovereign Human Gate) + `#6` (Approval domain) + `#12` (Approval state machine) |
| Implement Prompt Injection defense | `#9` (security section) + `#11` (prompt injection defense) |

---

## 3.6 — Media Tasks

| Task | Load These Files (Tier 2) |
| :-- | :-- |
| Implement image processing pipeline | `#10` (image processor section) + `#12` (MediaAsset state + media errors) |
| Implement video transcoding | `#10` (video processor section) + `#12` (media errors) |
| Implement PDF → carousel | `#10` (PDF rasterization section) |
| Implement panorama splitter | `#10` (panorama splitter section) |
| Implement presigned upload flow | `#10` (ingestion section) + `#11` (upload security) |
| Implement object storage adapter | `#10` (storage abstraction section) + `#14` (media env vars) |
| Write media security tests | `#11` (media security test cases) + `#10` |
| Implement garbage collection | `#10` (lifecycle/GC section) + `#12` (MediaAsset EXPIRED/DELETED states) |

---

## 3.7 — Testing & Quality Tasks

| Task | Load These Files (Tier 2) |
| :-- | :-- |
| Write unit tests for any domain entity | `#11` (unit test standards) + the relevant domain doc |
| Write contract tests between two repos | `#11` (contract test matrix) + `#7` (contract shapes) |
| Write integration tests for DB operations | `#11` (DB integration test requirements) + `#5` |
| Write E2E tests (Playwright) | `#11` (E2E critical paths) + `#3` (use cases) |
| Set up CI/CD pipeline for a repo | `#11` (CI gate requirements) + `#13` (quality gates) |
| Perform security audit on a component | `#11` (OWASP mapping + security checklist) |
| Write load tests (K6) | `#11` (performance targets table) |

---

## 3.8 — Release & Operations Tasks

| Task | Load These Files (Tier 2) |
| :-- | :-- |
| Release a new minor/major version | `#13` (release gates + versioning) + `#11` (security checklist) |
| Write a database migration | `#13` (zero-downtime protocol) + `#5` or `#6` (schema contracts) |
| Deprecate an API endpoint | `#13` (deprecation policy) |
| Perform Go/No-Go decision | `#13` (Production Go/No-Go checklist) |
| Write CHANGELOG entry | `#13` (changelog standards) |
| Package self-hosted release | `#13` + `#14` (cloud repo specs) |

---

# SECTION 4 — THE 15 INVIOLABLE INVARIANTS

These are non-negotiable. Violating any one of these invalidates the entire implementation.
Memorize these before writing a single line of code.

```
INV-01  scriora-core owns all business state. No other repo writes business entities directly.
INV-02  scriora-social is the only layer that holds or uses social platform credentials.
INV-03  The Agent has zero business authority. It proposes. Humans or policies decide.
INV-04  scriora-media processes files. It never generates them via AI.
INV-05  scriora-web contains zero business logic. It renders API responses only.
INV-06  scriora-mcp cannot bypass the Human Approval Gate.
INV-07  scriora-cli is a client only. It holds zero server-side state.
INV-08  No platform SDK lives inside scriora-core. ACL lives in scriora-social.
INV-09  Every state transition is auditable — actor, event, timestamp recorded.
INV-10  No error is ever swallowed silently. Every failure is classified and logged.
INV-11  No raw SQL in application code. All DB access via Prisma parameterized queries.
INV-12  RLS is enabled on every tenant-scoped table. No bypass from application runtime.
INV-13  Webhook processing requires HMAC-SHA256 verification before any action.
INV-14  Scriora must run in Classic Mode without any AI provider. AI is enhancement, not dependency.
INV-15  No production deployment without passing all quality gates in the CI pipeline.
```

---

# SECTION 5 — QUICK REFERENCE: STATE MACHINES

Use this as a fast lookup. For full transition details, load `#12`.

| Entity | States (→ terminal in **bold**) |
| :-- | :-- |
| Content | DRAFT → IN_REVIEW → APPROVED → PUBLISHING / **REJECTED** / **ARCHIVED** |
| Publication | DRAFT → SCHEDULED → EXECUTING → VERIFYING → **SUCCEEDED** / **FAILED_PERMANENT** / **CANCELLED** |
| Approval | PENDING → UNDER_REVIEW → **APPROVED** / **REJECTED** / **EXPIRED** / **INVALIDATED** |
| AgentTask | PENDING → PLANNING → WAITING_APPROVAL → EXECUTING → **SUCCEEDED** / **FAILED_PERMANENT** / **CANCELLED** |
| MediaAsset | REGISTERED → UPLOADED → VALIDATING → PROCESSING → **READY** / **FAILED_PERMANENT** |
| Mission | DRAFT → ACTIVE → PAUSED → **COMPLETED** / **ABANDONED** |
| SocialAccount | PENDING_AUTH → CONNECTED → REFRESH_REQUIRED → **REVOKED** (reconnectable) |

---

# SECTION 6 — QUICK REFERENCE: ERROR CLASSIFICATION

Use this to classify any error immediately. For full taxonomy, load `#12`.

```
RETRYABLE (exponential backoff, up to 5 attempts)
    ERR_RATE_LIMIT_PLATFORM / ERR_RATE_LIMIT_PROVIDER
    ERR_TIMEOUT_PLATFORM / ERR_TIMEOUT_PROVIDER
    ERR_PLATFORM_MAINTENANCE
    ERR_PROVIDER_TRANSIENT
    ERR_MEDIA_PROCESSING_TIMEOUT

TERMINAL (mark failed, alert user, no retry)
    ERR_VALIDATION_*
    ERR_FORBIDDEN_*
    ERR_PLATFORM_CONTENT_POLICY
    ERR_AUTH_TOKEN_REVOKED
    ERR_MEDIA_INVALID_MAGIC_BYTES / ERR_MEDIA_CORRUPTED_STREAM
    ERR_AGENT_TOOL_NOT_FOUND / ERR_AGENT_POLICY_DENIED

RECONCILIATION (query external system before deciding)
    ERR_EXTERNAL_UNKNOWN_PUBLISH
    ERR_TIMEOUT_PUBLISH (response never received)
```

---

# SECTION 7 — QUICK REFERENCE: REPOSITORY OWNERSHIP

Who owns what. Never cross these lines.

```
scriora-core      → Business entities, domain logic, DB migrations, RLS, Application Contracts
scriora-social    → Platform adapters, OAuth tokens, webhooks, rate limits, capability models
scriora-api       → HTTP routes, auth middleware, request validation, OpenAPI spec
scriora-web       → UI rendering, user interactions, API client only
scriora-worker    → Durable job execution (Inngest), outbox consumption, retry orchestration
scriora-media     → Binary validation, image/video processing, storage abstraction
scriora-agent     → Cognitive runtime, skills, tools, memory, provider abstraction
scriora-mcp       → MCP protocol transport, tool exposure, boundary enforcement
scriora-cli       → CLI commands, developer tooling, config management
scriora-docs      → Documentation site, OpenAPI rendering
scriora-cloud     → Docker, K8s, Terraform, CI/CD templates, self-hosted packaging
```

---

# SECTION 8 — QUICK REFERENCE: FORBIDDEN PATTERNS

These patterns are banned. If you find yourself writing any of these, stop and re-read the relevant invariant.

```
❌ scriora-core importing scriora-social
❌ scriora-web calling scriora-core directly (must go through scriora-api)
❌ Agent receiving access_token or refresh_token
❌ Platform SDK imported in scriora-core
❌ try { ... } catch { } // empty catch — no silent failures
❌ Raw SQL string in application code: db.$queryRawUnsafe(...)
❌ Hardcoded secrets, API keys, or JWT secrets in source code
❌ Status field updated without recording the transition event
❌ Media file trusted based on file extension alone
❌ Publishing to a platform without checking workspace platform policy first
❌ Agent invoking a tool without passing through the permission + policy check
❌ Deploying to production without passing all CI/CD quality gates
```

---

# SECTION 9 — CONTEXT BUDGET GUIDE

How much context each file costs. Use this to stay within budget.

| File | Approx. Lines | Approx. Size | Load Cost |
| :-- | :--: | :--: | :-- |
| This file (Agent Context Map) | ~350 | ~10 KB | Always — essential |
| SCRIORA_ARCHITECTURE_BASELINE | ~3,478 | ~99 KB | Heavy — load only for system-wide overview |
| SCRIORA_DATABASE_CONTRACT | ~1,848 | ~62 KB | Medium-heavy — load only for DB schema work |
| SCRIORA_AGENT_FRAMEWORK | ~1,460 | ~62 KB | Medium-heavy — load only for agent tasks |
| SCRIORA_DOMAIN_MODEL | ~1,570 | ~41 KB | Medium — load for domain entity work |
| SCRIORA_MEDIA_FRAMEWORK | ~1,175 | ~47 KB | Medium — load for media tasks |
| SCRIORA_REPOSITORY_SPECS | ~1,055 | ~31 KB | Medium — load for scaffold tasks |
| SCRIORA_USE_CASE_CATALOG | ~1,314 | ~26 KB | Medium — load for feature implementation |
| SCRIORA_CONTRACT_ARCHITECTURE | ~947 | ~34 KB | Medium — load for inter-repo contracts |
| SCRIORA_SOCIAL_FRAMEWORK | ~772 | ~27 KB | Light-medium — load for social tasks |
| SCRIORA_TEST_AND_SECURITY | ~860 | ~31 KB | Light-medium — load for testing/security |
| SCRIORA_CONTRACT_MATRIX | ~622 | ~20 KB | Light — fast lookup |
| SCRIORA_STATE_AND_ERROR_MODEL | ~752 | ~25 KB | Light — fast lookup |
| SCRIORA_VERSIONING_AND_RELEASE | ~490 | ~15 KB | Light — load for release tasks |
| SCRIORA_FINAL_DB_CONTRACT | ~661 | ~26 KB | Light — load for Approval/Analytics |

**Budget Rule:**
- This file + 1 Heavy = acceptable
- This file + 2 Medium = acceptable
- This file + 3-4 Light = acceptable
- This file + 2+ Heavy = context budget exceeded — break the task down

---

# SECTION 10 — TASK DECOMPOSITION GUIDE

If a task requires more than 4 documents, it is too large. Decompose it:

## Example: "Build scriora-core from scratch"

Too large for one agent pass. Decompose into:

```
Sub-task A: Prisma schema for Content + Publication
    Context: This file + #5 + #12 (state enums) + #13 (migration protocol)

Sub-task B: Prisma schema for Mission + Approval domains
    Context: This file + #6 + #12 + #13

Sub-task C: Application Contracts (content.contract.ts)
    Context: This file + #7 + #4

Sub-task D: RLS policies for all tables
    Context: This file + #5 + #11 (RLS requirements)

Sub-task E: Unit tests for domain state machines
    Context: This file + #11 + #12
```

Each sub-task is a clean, focused, verifiable unit of work.

---

# SECTION 11 — VERIFICATION CHECKLIST

Before marking any task complete, verify:

```
□ No invariant (Section 4) was violated
□ State transitions use only the states defined in Section 5 / doc #12
□ All errors are classified using Section 6 taxonomy
□ Ownership rules (Section 7) were respected
□ None of the forbidden patterns (Section 8) appear in the output
□ Quality gate command was executed and passed
□ No secrets, tokens, or PII appear in logs or error messages
□ New state changes are recorded with actor + event + timestamp
```

---

# SECTION 12 — THE SINGLE MOST IMPORTANT QUESTION

Before writing any code, answer this question:

> **"Which repository owns the data or behavior I am about to implement?"**

If the answer is unclear, read `#2` (Repository Contract Matrix) before proceeding.
If it is clear, load the task-specific files from Section 3 and proceed.

---

> **This document is complete. Begin your task-specific document loading now.**
> Context Map version: 1.0.0 | Covers: Scriora Architecture Specification Suite v1 (14 documents)
