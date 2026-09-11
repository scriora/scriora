# Scriora — Database Contract v1

> **Status:** Canonical Operational Schema Specification  
> **Role:** Operational DDL and Database Contract for the Core Publishing Pipeline  
> **Authoritative Owner:** `scriora-core`  
> **Scope:** `Content` ──► `ContentVariant` ──► `Publication` ──► `SocialAccount` ──► `PublishAttempt` ──► `OutboxCommand`

---

# 1. Purpose & Scope

This specification establishes the definitive operational database contract for Scriora's core publishing backbone:

```text
Content
   ↓
ContentVariant
   ↓
Publication
   ↓
SocialAccount
   ↓
PublishAttempt
   ↓
OutboxCommand
```

This document specifies:
- Explicit Table Schemas & Data Types
- Field Nullability & Constraints
- Primary & Foreign Keys
- Unique Constraints
- Indexing Strategies
- Referential Integrity & Deletion Behavior
- Atomic Transaction Boundaries
- Cross-Tenant Isolation Guarantees

This document governs the operational schema prior to Prisma Schema Generation (`schema.prisma`) and DDL migrations.

---

# 2. Content

## Table Name

```text
contents
```

## Owning Repository

```text
scriora-core
```

## Architectural Separation

`Content` represents a creative and business asset independent of publishing schedules or platform channels:

```text
Content ≠ Publication
```

A single `Content` entity can produce multiple platform-specific variants (`ContentVariant`) and be scheduled across multiple releases (`Publication`).

## Physical Schema

| Field | SQL Type | Nullable | Default | Description / Invariants |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `UUID` | **NO** | `gen_random_uuid()` | Primary Key |
| `workspace_id` | `UUID` | **NO** | — | Foreign Key → `workspaces.id` (Tenant Boundary) |
| `title` | `VARCHAR(255)` | YES | `NULL` | Internal administrative title |
| `body` | `TEXT` | YES | `NULL` | Master source text / canonical body |
| `status` | `VARCHAR(50)` | **NO** | `'DRAFT'` | Content lifecycle state (`DRAFT`, `READY`, `ARCHIVED`) |
| `created_by_user_id`| `UUID` | YES | `NULL` | Foreign Key → `users.id` (Author) |
| `created_at` | `TIMESTAMPTZ`| **NO** | `now()` | Timestamp of creation |
| `updated_at` | `TIMESTAMPTZ`| **NO** | `now()` | Timestamp of last modification |
| `deleted_at` | `TIMESTAMPTZ`| YES | `NULL` | Soft deletion timestamp |

---

# 3. ContentVariant

## Table Name

```text
content_variants
```

## Owning Repository

```text
scriora-core
```

## Relationship

```text
Content
   │
   └──< ContentVariant
```

## Purpose & Strategy

A `ContentVariant` represents the platform-adapted, publishable version of a parent `Content` object.  
Scriora explicitly rejects the assumption that all social platforms share identical formats:

```text
Content ("Launch Announcement")
  ├── Variant: LinkedIn (Professional tone, document attachment, hashtag limits)
  ├── Variant: X / Twitter (Concise hook, 280-char limit, thread structure)
  ├── Variant: Instagram (Visual-centric caption, first-comment hashtags)
  └── Variant: TikTok (Hook script, audio prompt, trending sound references)
```

## Physical Schema

| Field | SQL Type | Nullable | Default | Description / Invariants |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `UUID` | **NO** | `gen_random_uuid()` | Primary Key |
| `workspace_id` | `UUID` | **NO** | — | Foreign Key → `workspaces.id` (Tenant Boundary) |
| `content_id` | `UUID` | **NO** | — | Foreign Key → `contents.id` (Parent Content) |
| `platform` | `VARCHAR(50)` | YES | `NULL` | Target social platform (`LINKEDIN`, `X`, `INSTAGRAM`, etc.) |
| `social_account_id`| `UUID` | YES | `NULL` | Optional direct target account |
| `body` | `TEXT` | YES | `NULL` | Channel-adapted text payload |
| `metadata` | `JSONB` | YES | `'{}'` | Platform-specific parameters validated by `scriora-social` |
| `status` | `VARCHAR(50)` | **NO** | `'DRAFT'` | Variant lifecycle state (`DRAFT`, `READY`, `ARCHIVED`) |
| `created_at` | `TIMESTAMPTZ`| **NO** | `now()` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ`| **NO** | `now()` | Last modification timestamp |

### Architectural Decision: Extensible Metadata

To prevent migration churn when social networks introduce new options, table columns are strictly abstracted:

```text
❌ Disallowed Schema Columns:
   - x_thread_count
   - instagram_container_id
   - pinterest_board_id
   - tiktok_privacy_level

✔ Standardized Approach:
   - `metadata JSONB` validated by `scriora-social` runtime contracts
```

Adding a new social platform or parameter requires zero database schema migrations.

---

# 4. Publication

## Table Name

```text
publications
```

## Owning Repository

```text
scriora-core
```

## Purpose

`Publication` encapsulates the business intent and scheduled delivery record for releasing a specific `ContentVariant` to a specific `SocialAccount`:

```text
Publication
    │
    └──< PublishAttempt
```

`Publication` represents the release agreement. It contains zero platform SDK integration or network handling logic.

## Physical Schema

| Field | SQL Type | Nullable | Default | Description / Invariants |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `UUID` | **NO** | `gen_random_uuid()` | Primary Key |
| `workspace_id` | `UUID` | **NO** | — | Foreign Key → `workspaces.id` (Tenant Boundary) |
| `content_variant_id`| `UUID` | **NO** | — | Foreign Key → `content_variants.id` |
| `social_account_id` | `UUID` | **NO** | — | Foreign Key → `social_accounts.id` |
| `status` | `VARCHAR(50)` | **NO** | `'DRAFT'` | Publication lifecycle status |
| `scheduled_at` | `TIMESTAMPTZ`| YES | `NULL` | Explicit UTC instant for planned release |
| `timezone` | `VARCHAR(50)` | YES | `'UTC'` | User scheduling context / timezone |
| `published_at` | `TIMESTAMPTZ`| YES | `NULL` | Confirmed real-world publish timestamp |
| `external_post_id` | `VARCHAR(255)`| YES | `NULL` | Social platform's native post identifier |
| `external_post_url`| `TEXT` | YES | `NULL` | Canonical public live post URL |
| `idempotency_key` | `VARCHAR(255)`| **NO** | — | Stable idempotency token across retries |
| `fingerprint` | `CHAR(64)` | **NO** | — | SHA-256 payload and media hash |
| `created_by_user_id`| `UUID` | YES | `NULL` | User who authorized or scheduled the post |
| `created_at` | `TIMESTAMPTZ`| **NO** | `now()` | Timestamp of creation |
| `updated_at` | `TIMESTAMPTZ`| **NO** | `now()` | Timestamp of last modification |

---

# 5. Publication Lifecycle States

To avoid ambiguous statuses, `Publication` maintains a business-oriented lifecycle:

```text
DRAFT                   ──► Initial composition
SCHEDULED               ──► Locked in queue waiting for target timestamp
READY                   ──► Immediate dispatch requested
PROCESSING              ──► Claimed by worker, dispatch in progress
PUBLISHED               ──► Confirmed successful publication
FAILED                  ──► Permanent execution failure
UNKNOWN_EXTERNAL_STATE  ──► Remote dispatch uncertain; awaiting reconciliation
CANCELLED               ──► User or policy aborted the release
REQUIRES_APPROVAL       ──► Blocked by governance gate awaiting human approval
```

---

# 6. Decoupling: Publication vs PublishAttempt

```text
Publication
  = "WHAT, WHERE, and WHEN we intend to publish" (Business Record)

PublishAttempt
  = "A specific, technical execution attempt" (Operational Ledger)
```

### Scenario:
A single `Publication` may accumulate multiple `PublishAttempt` rows:
- **Attempt #1:** Socket Timeout → `FAILED_RETRYABLE`
- **Attempt #2:** HTTP 429 Rate Limited → `FAILED_RETRYABLE` (Backoff + Jitter)
- **Attempt #3:** HTTP 201 Created → `SUCCEEDED`

```text
Publication (id: pub_100)
    ├── PublishAttempt #1 (status: FAILED_RETRYABLE, error: TIMEOUT)
    ├── PublishAttempt #2 (status: FAILED_RETRYABLE, error: RATE_LIMIT)
    └── PublishAttempt #3 (status: SUCCEEDED, external_id: urn:li:share:123)
```

---

# 7. SocialAccount Entity Relationship

```text
Workspace
    │
    └──< SocialAccount
              │
              └──< Publication
```

`social_accounts` is strictly tenant-scoped (`workspace_id`).  
- **`scriora-core`:** Owns account identity, workspace association, and capability flags.
- **`scriora-social`:** Owns platform OAuth, API communication, and webhook handling.

---

# 8. PublishAttempt

## Table Name

```text
publish_attempts
```

## Owning Repository

```text
scriora-core
```

## Canonical Lifecycle States

```text
RESERVED
DISPATCHING
PLATFORM_PENDING
SUCCEEDED
UNKNOWN_EXTERNAL_STATE
FAILED_PERMANENT
```

## Physical Schema

| Field | SQL Type | Nullable | Default | Description / Invariants |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `UUID` | **NO** | `gen_random_uuid()` | Primary Key |
| `workspace_id` | `UUID` | **NO** | — | Foreign Key → `workspaces.id` (Tenant Boundary) |
| `publication_id` | `UUID` | **NO** | — | Foreign Key → `publications.id` |
| `attempt_number` | `INTEGER` | **NO** | `1` | Sequential attempt counter (1, 2, 3...) |
| `status` | `VARCHAR(50)` | **NO** | `'RESERVED'` | Operational execution status |
| `idempotency_key` | `VARCHAR(255)`| **NO** | — | Shared idempotency key for this publish operation |
| `fingerprint` | `CHAR(64)` | **NO** | — | Request hash matching `Publication.fingerprint` |
| `started_at` | `TIMESTAMPTZ`| YES | `NULL` | Dispatch start timestamp |
| `completed_at` | `TIMESTAMPTZ`| YES | `NULL` | Terminal completion timestamp |
| `external_id` | `VARCHAR(255)`| YES | `NULL` | Platform post ID returned by remote API |
| `external_url` | `TEXT` | YES | `NULL` | Platform post URL returned by remote API |
| `error_code` | `VARCHAR(100)`| YES | `NULL` | Standardized error code (`NETWORK_TIMEOUT`, etc.) |
| `error_category` | `VARCHAR(50)` | YES | `NULL` | Error categorization (`TRANSIENT`, `PERMANENT`) |
| `error_message` | `TEXT` | YES | `NULL` | Sanitized diagnostic error message |
| `retryable` | `BOOLEAN` | **NO** | `false` | Indicates whether worker should schedule a retry |
| `retry_after` | `TIMESTAMPTZ`| YES | `NULL` | Calculated backoff instant for next attempt |
| `response_metadata`| `JSONB` | YES | `'{}'` | Sanitized API headers, request IDs, rate-limits |
| `created_at` | `TIMESTAMPTZ`| **NO** | `now()` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ`| **NO** | `now()` | Record update timestamp |

---

# 9. Attempt Number Constraint

The compound tuple must be unique:

```sql
ALTER TABLE publish_attempts 
ADD CONSTRAINT uq_publication_attempt_number 
UNIQUE (publication_id, attempt_number);
```

Duplicate attempt numbers for the same publication are physically prohibited.

---

# 10. Idempotency Invariants

```text
Same Logical Publish Operation ──► Identical idempotency_key
Retried Operational Attempts    ──► Same idempotency_key, Incrementing attempt_number
```

The `idempotency_key` is generated at publication reservation time and reused across retries. This ensures that upstream social networks supporting idempotency headers (e.g. LinkedIn, X) recognize subsequent attempts as identical requests.

---

# 11. UNKNOWN_EXTERNAL_STATE Handling

`UNKNOWN_EXTERNAL_STATE` is an explicit architectural state:
- It is **NOT** a failure (`FAILED`).
- It is **NOT** a retryable condition (`RETRY`).

```text
POST platform API
      ↓
Timeout / Disconnection
      ↓
State = UNKNOWN_EXTERNAL_STATE
      ↓
Launch Asynchronous Reconciliation Job
```

**Rule:** Automatic retry dispatch is strictly blocked when an attempt is in `UNKNOWN_EXTERNAL_STATE`. Reconciliation must confirm post non-existence before any re-attempt can occur.

---

# 12. External Post Identity Types

External platforms return heterogeneous ID formats:
- LinkedIn: URN strings (`urn:li:share:7123456789`)
- X: 64-bit integer strings (`1748293849182391234`)
- Meta: Composite strings (`1029384756_5938271648`)

All external identifiers are stored as `VARCHAR(255)`:

```text
external_post_id: VARCHAR(255)
external_post_url: TEXT
```

Numeric integers and UUIDs are strictly disallowed for external ID fields.

---

# 13. Transactional Outbox

## Table Name

```text
outbox_commands
```

## Owning Repository

```text
scriora-core
```

## Outbox Lifecycle States

```text
PENDING     ──► Written inside domain transaction; awaiting pickup
PROCESSING  ──► Claimed by worker via FOR UPDATE SKIP LOCKED
PUBLISHED   ──► Successfully dispatched to durable workflow
FAILED      ──► Exhausted retries or poison message (Dead Letter)
```

---

# 14. Outbox Physical Schema

| Field | SQL Type | Nullable | Default | Description / Invariants |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `UUID` | **NO** | `gen_random_uuid()` | Primary Key |
| `workspace_id` | `UUID` | **NO** | — | Foreign Key → `workspaces.id` (Tenant Boundary) |
| `publication_id` | `UUID` | **NO** | — | Foreign Key → `publications.id` |
| `publish_attempt_id`| `UUID` | **NO** | — | Foreign Key → `publish_attempts.id` |
| `command_type` | `VARCHAR(100)`| **NO** | — | Command identifier (e.g. `DISPATCH_PUBLICATION`) |
| `payload` | `JSONB` | **NO** | — | Complete command payload |
| `status` | `VARCHAR(50)` | **NO** | `'PENDING'` | Outbox message status |
| `available_at` | `TIMESTAMPTZ`| **NO** | `now()` | Instant command becomes eligible for claiming |
| `claimed_at` | `TIMESTAMPTZ`| YES | `NULL` | Timestamp worker locked the command |
| `processed_at` | `TIMESTAMPTZ`| YES | `NULL` | Completion timestamp |
| `attempts` | `INTEGER` | **NO** | `0` | Number of pickup attempts |
| `last_error` | `JSONB` | YES | `'{}'` | Details of dispatch failure |
| `created_at` | `TIMESTAMPTZ`| **NO** | `now()` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ`| **NO** | `now()` | Record modification timestamp |

---

# 15. Separation of Outbox vs PublishAttempt

```text
PublishAttempt   ──► Domain Ledger (What happened on the social network)
OutboxCommand    ──► Reliable Delivery Trigger (How the worker is invoked)
```

```text
Publication
    │
    ├── PublishAttempt #1 (Domain record)
    │
    └── OutboxCommand (Transport trigger)
             │
             ▼
      Inngest / Worker
             │
             ▼
      Social Platform Adapter
```

---

# 16. Transaction Boundary Specification

Publishing execution begins with an atomic database transaction:

```sql
BEGIN TRANSACTION;

  -- 1. Validate domain invariants and verify active workspace membership
  -- 2. Lock relevant workspace schedule/business record
  -- 3. Calculate payload and content SHA-256 fingerprint
  -- 4. Insert or update Publication record (status = 'READY' or 'SCHEDULED')
  -- 5. Insert PublishAttempt record (status = 'RESERVED')
  -- 6. Insert OutboxCommand record (status = 'PENDING')

COMMIT;
```

### Critical Architectural Invariant
**External HTTP calls (e.g. LinkedIn API, X API) are strictly forbidden inside the database transaction.** All external network interactions occur asynchronously in the Worker layer after the transaction successfully commits.

---

# 17. Referential Integrity & Foreign Keys

```sql
ALTER TABLE contents
  ADD CONSTRAINT fk_contents_workspace
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;

ALTER TABLE content_variants
  ADD CONSTRAINT fk_variants_workspace
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_variants_content
  FOREIGN KEY (content_id) REFERENCES contents(id) ON DELETE CASCADE;

ALTER TABLE publications
  ADD CONSTRAINT fk_publications_workspace
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_publications_variant
  FOREIGN KEY (content_variant_id) REFERENCES content_variants(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_publications_account
  FOREIGN KEY (social_account_id) REFERENCES social_accounts(id) ON DELETE RESTRICT;

ALTER TABLE publish_attempts
  ADD CONSTRAINT fk_attempts_workspace
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_attempts_publication
  FOREIGN KEY (publication_id) REFERENCES publications(id) ON DELETE CASCADE;

ALTER TABLE outbox_commands
  ADD CONSTRAINT fk_outbox_workspace
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_outbox_publication
  FOREIGN KEY (publication_id) REFERENCES publications(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_outbox_attempt
  FOREIGN KEY (publish_attempt_id) REFERENCES publish_attempts(id) ON DELETE CASCADE;
```

---

# 18. Cross-Tenant Integrity Protection

A critical multi-tenant vulnerability occurs when:
```text
Workspace A Publication  ──►  References Workspace B SocialAccount
```

To physically prevent cross-tenant referencing at the database level, composite foreign keys with `workspace_id` are enforced:

```sql
-- Enforce compound unique constraint on target
ALTER TABLE social_accounts 
ADD CONSTRAINT uq_social_accounts_tenant 
UNIQUE (id, workspace_id);

-- Enforce compound foreign key on publication
ALTER TABLE publications
ADD CONSTRAINT fk_publications_tenant_social_account
FOREIGN KEY (social_account_id, workspace_id)
REFERENCES social_accounts(id, workspace_id)
ON DELETE RESTRICT;
```

Application-level code is never trusted as the sole guarantor of tenant isolation.

---

# 19. Deletion & Retention Policies

Unrestricted cascading deletes (`CASCADE`) across confirmed publications are prohibited:

```text
Workspace Deleted        ──► Soft delete workspace; freeze all credentials
Content Deleted          ──► Soft delete (`deleted_at = now()`)
Content Variant Deleted  ──► Soft delete; disallow if active publication exists
Confirmed Publication    ──► Permanent retention for compliance, analytics, and audit
Failed Publication       ──► Retain attempt log for 90 days
Outbox Command           ──► Archive processed entries after 30 days
```

---

# 20. Critical Unique Constraints

```sql
-- 1. Prevent duplicate external account binding per workspace
ALTER TABLE social_accounts
ADD CONSTRAINT uq_workspace_platform_account
UNIQUE (workspace_id, platform, external_account_id);

-- 2. Enforce sequential attempt counting per publication
ALTER TABLE publish_attempts
ADD CONSTRAINT uq_publication_attempt
UNIQUE (publication_id, attempt_number);
```

---

# 21. Query-Driven Index Strategy

Indexes are created strictly based on real query access patterns:

### Contents Table
```sql
CREATE INDEX idx_contents_workspace_created 
  ON contents(workspace_id, created_at DESC);

CREATE INDEX idx_contents_workspace_status 
  ON contents(workspace_id, status);
```

### Content Variants Table
```sql
CREATE INDEX idx_variants_content_id 
  ON content_variants(content_id);

CREATE INDEX idx_variants_workspace_created 
  ON content_variants(workspace_id, created_at DESC);
```

### Publications Table
```sql
CREATE INDEX idx_publications_workspace_scheduled 
  ON publications(workspace_id, scheduled_at) 
  WHERE status = 'SCHEDULED';

CREATE INDEX idx_publications_workspace_status 
  ON publications(workspace_id, status);

CREATE INDEX idx_publications_account_scheduled 
  ON publications(social_account_id, scheduled_at);
```

### Publish Attempts Table
```sql
CREATE INDEX idx_attempts_publication 
  ON publish_attempts(publication_id, attempt_number);

CREATE INDEX idx_attempts_workspace_created 
  ON publish_attempts(workspace_id, created_at DESC);

CREATE INDEX idx_attempts_status 
  ON publish_attempts(status);
```

### Outbox Commands Table
```sql
CREATE INDEX idx_outbox_pickup 
  ON outbox_commands(status, available_at) 
  WHERE status = 'PENDING';

CREATE INDEX idx_outbox_workspace_status 
  ON outbox_commands(workspace_id, status);
```

---

# 22. Scheduling Precision

```text
scheduled_at: TIMESTAMPTZ (UTC instant)
timezone:     VARCHAR(50) (e.g. 'Asia/Riyadh', 'America/New_York')
```

Scheduling is stored as an exact unambiguous UTC instant. The `timezone` string is preserved solely for human context, display in local calendars, and computing recurring cron patterns.

---

# 23. Worker Execution Boundary

`scriora-worker` contains zero business domain rules:

```text
scriora-worker
      ↓ Claim PENDING command (FOR UPDATE SKIP LOCKED)
      ↓ Fetch decrypted token via Core internal token service
      ↓ Invoke scriora-social platform adapter
      ↓ Remote Social API (HTTPS)
      ↓ Receive result / status
      ↓ Call scriora-core application contract
      ↓ Core updates PublishAttempt & Publication in database
```

---

# 24. Final Operational Chain Topology

```text
Workspace
   │
   └── Content
         │
         └── ContentVariant
                │
                └── Publication
                       │
                       ├── SocialAccount
                       │
                       └── PublishAttempt
                              │
                              └── OutboxCommand
```

---

# 25. Core Separation Invariant

```text
Content        = WHAT creative asset will we publish?
ContentVariant = IN WHAT specific format / platform adaptation?
Publication    = WHERE and WHEN do we intend to publish?
PublishAttempt = WHAT occurred during a concrete execution attempt?
OutboxCommand  = HOW do we reliably trigger worker execution?
```

This 5-layer separation prevents conflating creative assets, scheduling records, operational logs, and transport infrastructure into a monolithic post model.

---

# 26. Pre-Prisma Settlement Checklist

Before generating the final `schema.prisma` file, the following explicit values must be settled:
1. Final enum strings for `Content.status`.
2. Final enum strings for `ContentVariant.status`.
3. Final enum strings for `Publication.status`.
4. Exact scope of `idempotency_key` unique constraints across recurring vs one-time publications.
5. Exact JSON schemas for `content_variants.metadata` per platform.
6. Deletion cascade vs soft-delete retention automation jobs.
7. Exact foreign key mapping for multi-approver workflows (`Publication` ↔ `Approval`).


---

# ========================================================================
# PART II: Autonomous Mission & Growth Learning Loop
# ========================================================================

# 27. Purpose & Mission Scope

This section establishes the database contract for Scriora's autonomous growth intelligence engine:

```text
Mission
   ↓
Goal
   ↓
Strategy
   ↓
Hypothesis
   ↓
Experiment
   ↓
Evidence
   ↓
Insight
   ↓
Decision
   ↓
Memory
```

### Core Architecture Invariant: Business Domain vs Agent Execution
- **`scriora-core` (Business Domain Truth):** Owns `Mission`, `Goal`, `Strategy`, `Hypothesis`, `Experiment`, `EvidenceRecord`, `Insight`, `Decision`, and `BusinessMemory`.
- **`scriora-agent` (Execution Telemetry):** Owns `AgentTask`, `SkillExecution`, `ProviderRun`, and ephemeral working memory.

A `Mission` is a commercial growth loop beginning with a measurable business objective and ending with empirical learning. It is never treated as a mere agent execution log.

---

# 28. Mission Entity

## Table Name

```text
missions
```

## Owning Repository

```text
scriora-core
```

## Purpose

A `Mission` represents an autonomous business objective defined by measurable key performance indicators, an explicit timeframe, overarching strategy, testable hypotheses, and an empirical learning loop.

Example:
```text
Name:     "B2B SaaS Authority Launch"
Target:   +500 Qualified Signups
Duration: 30 Days
```

## Physical Schema

| Field | SQL Type | Nullable | Default | Description / Invariants |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `UUID` | **NO** | `gen_random_uuid()` | Primary Key |
| `workspace_id` | `UUID` | **NO** | — | Foreign Key → `workspaces.id` (Tenant Boundary) |
| `name` | `VARCHAR(255)` | **NO** | — | High-level commercial mission title |
| `description` | `TEXT` | YES | `NULL` | Business context and strategic rationale |
| `status` | `VARCHAR(50)` | **NO** | `'DRAFT'` | Lifecycle state (`DRAFT`, `ACTIVE`, `PAUSED`, `COMPLETED`, `CANCELLED`) |
| `starts_at` | `TIMESTAMPTZ`| YES | `NULL` | Scheduled initiation timestamp |
| `ends_at` | `TIMESTAMPTZ`| YES | `NULL` | Target completion deadline |
| `created_by_user_id`| `UUID` | YES | `NULL` | Human creator (Foreign Key → `users.id`) |
| `created_at` | `TIMESTAMPTZ`| **NO** | `now()` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ`| **NO** | `now()` | Record modification timestamp |

---

# 29. Mission Lifecycle States

```text
DRAFT      ──► Initial configuration & hypothesis drafting
ACTIVE     ──► Autonomous execution and experiment tracking in progress
PAUSED     ──► Temporarily halted by human operator or guardrail policy
COMPLETED  ──► Target achieved or deadline reached with final retrospective
CANCELLED  ──► Aborted by user
```

---

# 30. Strategy Decoupling

Scriora explicitly prohibits embedding strategies as raw JSON blobs inside the `missions` table:

```text
❌ Disallowed: missions.strategy JSONB
✔ Standardized: Mission ──< Strategy (Dedicated Relational Table)
```

**Rationale:** Strategies are first-class business entities that undergo evaluation, A/B variation, channel allocation, and versioned iterative refinement across missions.

---

# 31. Goal Entity

## Table Name

```text
goals
```

## Owning Repository

```text
scriora-core
```

## Purpose

`Goal` captures the quantitative business result that the mission is commissioned to achieve:
- `KPI` / Metric Key
- `Baseline Value`
- `Target Value`
- `Current Value`
- `Deadline`

## Physical Schema

| Field | SQL Type | Nullable | Default | Description / Invariants |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `UUID` | **NO** | `gen_random_uuid()` | Primary Key |
| `workspace_id` | `UUID` | **NO** | — | Foreign Key → `workspaces.id` (Tenant Boundary) |
| `mission_id` | `UUID` | **NO** | — | Foreign Key → `missions.id` |
| `name` | `VARCHAR(255)` | **NO** | — | Goal descriptor (e.g. "Primary Signup Milestone") |
| `metric_key` | `VARCHAR(100)` | **NO** | — | Canonical metric key (`SIGNUPS`, `ENGAGEMENT_RATE`, etc.) |
| `baseline_value` | `NUMERIC(14,4)`| **NO** | `0` | Starting baseline measurement |
| `target_value` | `NUMERIC(14,4)`| **NO** | — | Desired objective milestone |
| `current_value` | `NUMERIC(14,4)`| YES | `0` | Live aggregated metric value |
| `unit` | `VARCHAR(50)` | **NO** | `'COUNT'`| Metric unit (`COUNT`, `PERCENT`, `USD`, `SECONDS`) |
| `starts_at` | `TIMESTAMPTZ`| YES | `NULL` | Measurement commencement timestamp |
| `ends_at` | `TIMESTAMPTZ`| **NO** | — | Target deadline for achievement |
| `status` | `VARCHAR(50)` | **NO** | `'IN_PROGRESS'` | Status (`IN_PROGRESS`, `ACHIEVED`, `MISSED`, `ABANDONED`) |
| `created_at` | `TIMESTAMPTZ`| **NO** | `now()` | Timestamp of creation |
| `updated_at` | `TIMESTAMPTZ`| **NO** | `now()` | Timestamp of last modification |

---

# 32. Multi-Goal Support (Primary vs Supporting)

A single mission may target multiple complementary KPIs:
```text
Mission ("B2B Authority Launch")
  ├── Primary Goal:    500 Qualified Signups (Target: 500, Baseline: 45)
  ├── Secondary Goal:  35% Profile Visit Lift (Target: 35.0, Baseline: 12.5)
  └── Guardrail Goal:  Maintain > 4.5% Engagement Rate
```

`Goal` as an independent entity enables multi-objective optimization without altering the core mission record.

---

# 33. Metric Catalog Semantics

`metric_key` is strictly bound to the Canonical Metric Catalog, never arbitrary text:

```text
SIGNUPS
LINK_CLICKS
IMPRESSIONS
ENGAGEMENTS
ENGAGEMENT_RATE
FOLLOWERS_GROWTH
RETENTION_RATE
REPOSTS_COUNT
```

---

# 34. Strategy Entity

## Table Name

```text
strategies
```

## Owning Repository

```text
scriora-core
```

## Relationship

```text
Mission
   │
   └──< Strategy
```

## Physical Schema

| Field | SQL Type | Nullable | Default | Description / Invariants |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `UUID` | **NO** | `gen_random_uuid()` | Primary Key |
| `workspace_id` | `UUID` | **NO** | — | Foreign Key → `workspaces.id` (Tenant Boundary) |
| `mission_id` | `UUID` | **NO** | — | Foreign Key → `missions.id` |
| `name` | `VARCHAR(255)` | **NO** | — | Strategy title (e.g. "Founder-Led Deep-Dives") |
| `description` | `TEXT` | **NO** | — | Detailed strategic approach |
| `target_audience` | `JSONB` | YES | `'{}'` | ICP definitions, seniority, industries |
| `content_pillars` | `JSONB` | YES | `'[]'` | Thematic content tracks |
| `tone_profile` | `JSONB` | YES | `'{}'` | Brand voice, contrarian score, vocabulary |
| `status` | `VARCHAR(50)` | **NO** | `'ACTIVE'` | Status (`DRAFT`, `ACTIVE`, `DEPRECATED`, `SUPERSEDED`) |
| `version` | `INTEGER` | **NO** | `1` | Sequential strategy revision number |
| `created_by` | `VARCHAR(50)` | **NO** | `'HUMAN'` | Source indicator (`HUMAN` or `AGENT`) |
| `created_at` | `TIMESTAMPTZ`| **NO** | `now()` | Timestamp of creation |
| `updated_at` | `TIMESTAMPTZ`| **NO** | `now()` | Timestamp of last modification |

---

# 35. Strategy Versioning Invariants

Long-running missions adapt over time. When an empirical learning loop invalidates an approach, a new strategy version is generated:

```text
Strategy v1 (Founder-Led Text Posts)
        ↓  Empirical Results (Low Conversion)
Strategy v2 (PDF Technical Carousels + Teardowns)
```

The tuple `(mission_id, version)` is unique. Historic versions are preserved with status `'SUPERSEDED'` to maintain auditability.

---

# 36. Hypothesis Entity

## Table Name

```text
growth_hypotheses
```

## Owning Repository

```text
scriora-core
```

## Relationship

```text
Strategy
   │
   └──< GrowthHypothesis
```

## Physical Schema

| Field | SQL Type | Nullable | Default | Description / Invariants |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `UUID` | **NO** | `gen_random_uuid()` | Primary Key |
| `workspace_id` | `UUID` | **NO** | — | Foreign Key → `workspaces.id` (Tenant Boundary) |
| `mission_id` | `UUID` | **NO** | — | Foreign Key → `missions.id` |
| `strategy_id` | `UUID` | **NO** | — | Foreign Key → `strategies.id` |
| `key` | `VARCHAR(50)` | **NO** | — | Human-readable tag (e.g. `H-01`, `H-02`) |
| `statement` | `TEXT` | **NO** | — | Testable proposition |
| `rationale` | `TEXT` | YES | `NULL` | Supporting reasoning or domain precedent |
| `expected_outcome` | `TEXT` | YES | `NULL` | Specific predicted outcome |
| `success_metric_key`| `VARCHAR(100)` | YES | `NULL` | Key metric evaluated for this hypothesis |
| `expected_effect` | `NUMERIC(8,4)` | YES | `NULL` | Predicted percentage or quantitative lift |
| `status` | `VARCHAR(50)` | **NO** | `'PROPOSED'` | Hypothesis lifecycle status |
| `created_at` | `TIMESTAMPTZ`| **NO** | `now()` | Timestamp of creation |
| `updated_at` | `TIMESTAMPTZ`| **NO** | `now()` | Timestamp of last modification |

---

# 37. Hypothesis Lifecycle & Causality Principle

```text
DRAFT          ──► Formulated in reasoning workspace
PROPOSED       ──► Submitted for review or scheduled testing
ACTIVE         ──► Linked to live experiments
SUPPORTED      ──► Statistically validated correlation
REFUTED        ──► Empirically contradicted by experimental results
INCONCLUSIVE   ──► Insufficient sample size or confidence threshold missed
ARCHIVED       ──► Retired from active testing
```

### The Epistemological Invariant:
```text
SUPPORTED ≠ CAUSALITY PROVEN
```
A status of `SUPPORTED` confirms strong correlation and statistical confidence within observed bounds. The AI agent must never report a supported hypothesis as definitive causality without controlled multi-cohort experimentation.

---

# 38. Decoupling: Hypothesis vs Experiment

```text
Hypothesis  = "WHAT we believe will happen and WHY" (Theoretical Proposition)
Experiment  = "HOW we will scientifically test that belief" (Empirical Protocol)
```

A single hypothesis may generate multiple distinct experiments across platforms, formats, or cohorts:
```text
Hypothesis H-01 ("PDF Carousels increase qualified engagement")
  ├── Experiment #1 (LinkedIn / 4 Weeks / Text vs 8-slide PDF)
  └── Experiment #2 (X / 2 Weeks / Visual Cards vs Thread)
```

---

# 39. Experiment Entity

## Table Name

```text
experiments
```

## Owning Repository

```text
scriora-core
```

## Physical Schema

| Field | SQL Type | Nullable | Default | Description / Invariants |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `UUID` | **NO** | `gen_random_uuid()` | Primary Key |
| `workspace_id` | `UUID` | **NO** | — | Foreign Key → `workspaces.id` (Tenant Boundary) |
| `mission_id` | `UUID` | **NO** | — | Foreign Key → `missions.id` |
| `hypothesis_id` | `UUID` | **NO** | — | Foreign Key → `growth_hypotheses.id` |
| `name` | `VARCHAR(255)` | **NO** | — | Descriptive experiment title |
| `description` | `TEXT` | YES | `NULL` | Experimental design overview |
| `design` | `JSONB` | **NO** | `'{}'` | Validated experiment design protocol |
| `status` | `VARCHAR(50)` | **NO** | `'PLANNED'` | State (`PLANNED`, `RUNNING`, `CONCLUDED`, `ABORTED`) |
| `started_at` | `TIMESTAMPTZ`| YES | `NULL` | Commencement timestamp |
| `ended_at` | `TIMESTAMPTZ`| YES | `NULL` | Completion timestamp |
| `created_at` | `TIMESTAMPTZ`| **NO** | `now()` | Timestamp of creation |
| `updated_at` | `TIMESTAMPTZ`| **NO** | `now()` | Timestamp of last modification |

---

# 40. Experiment Design Contract

The `design JSONB` column is strictly governed by a versioned runtime schema:

```json
{
  "control": {
    "format": "SINGLE_IMAGE_POST",
    "sample_target": 10
  },
  "variants": [
    {
      "variant_id": "CAROUSEL_A",
      "format": "PDF_CAROUSEL",
      "sample_target": 10
    }
  ],
  "allocation": {
    "control_pct": 50,
    "variant_pct": 50
  },
  "evaluation": {
    "min_duration_days": 14,
    "confidence_threshold": 0.95,
    "primary_metric": "ENGAGEMENT_RATE",
    "secondary_metrics": ["LINK_CLICKS", "PROFILE_VISITS"]
  }
}
```

Arbitrary or unvalidated JSON structures are strictly rejected.

---

# 41. Experiment ↔ Content Association

Experiments do not create duplicated or isolated content copies. They bind to canonical content variants via a many-to-many join table:

## Table: `experiment_content_variants`

```sql
CREATE TABLE experiment_content_variants (
  experiment_id      UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  content_variant_id UUID NOT NULL REFERENCES content_variants(id) ON DELETE RESTRICT,
  workspace_id       UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  variant_role       VARCHAR(50) NOT NULL, -- 'CONTROL' or 'TREATMENT'
  cohort_tag         VARCHAR(50),
  assigned_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (experiment_id, content_variant_id)
);
```

---

# 42. Evidence Record Entity

`EvidenceRecord` captures raw, validated empirical measurements that substantiate an insight:

```text
Raw Observation (Social Platform)
       ↓
EvidenceRecord (Postgres: immutable empirical observation)
       ↓
Insight (AI interpretation supported by evidence)
```

## Table Name

```text
evidence_records
```

## Owning Repository

```text
scriora-core
```

## Physical Schema

| Field | SQL Type | Nullable | Default | Description / Invariants |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `UUID` | **NO** | `gen_random_uuid()` | Primary Key |
| `workspace_id` | `UUID` | **NO** | — | Foreign Key → `workspaces.id` (Tenant Boundary) |
| `mission_id` | `UUID` | YES | `NULL` | Associated Mission |
| `experiment_id` | `UUID` | YES | `NULL` | Associated Experiment |
| `publication_id` | `UUID` | YES | `NULL` | Associated Publication |
| `metric_snapshot_id`| `UUID` | YES | `NULL` | Source analytics snapshot |
| `evidence_type` | `VARCHAR(50)` | **NO** | — | Type (`METRIC_DELTA`, `AUDIENCE_RETENTION`, etc.) |
| `value` | `JSONB` | **NO** | — | Measured quantitative data |
| `captured_at` | `TIMESTAMPTZ`| **NO** | `now()` | Measurement timestamp |
| `source` | `VARCHAR(100)` | **NO** | — | Origin (`LINKEDIN_API`, `TIMESCALEDB_AGGREGATE`) |
| `confidence` | `NUMERIC(5,4)` | **NO** | `1.0` | Empirical confidence coefficient (0.0000 - 1.0000) |
| `created_at` | `TIMESTAMPTZ`| **NO** | `now()` | Record creation timestamp |

---

# 43. Insight Entity

## Table Name

```text
insights
```

## Owning Repository

```text
scriora-core
```

## Purpose

An `Insight` is an intelligent interpretation grounded in empirical evidence:
```text
Metric   = Objective measurement ("Impressions = 14,200")
Evidence = Verified comparison ("Variant A had 2.4x higher CTR over 14 days")
Insight  = Semantic deduction ("Technical diagrams in carousels drive higher qualified developer engagement")
```

## Physical Schema

| Field | SQL Type | Nullable | Default | Description / Invariants |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `UUID` | **NO** | `gen_random_uuid()` | Primary Key |
| `workspace_id` | `UUID` | **NO** | — | Foreign Key → `workspaces.id` (Tenant Boundary) |
| `mission_id` | `UUID` | YES | `NULL` | Foreign Key → `missions.id` |
| `experiment_id` | `UUID` | YES | `NULL` | Foreign Key → `experiments.id` |
| `title` | `VARCHAR(255)` | **NO** | — | Headline takeaway |
| `statement` | `TEXT` | **NO** | — | Full deductive deduction |
| `evidence_summary` | `TEXT` | **NO** | — | Summary of supporting empirical proof |
| `confidence` | `NUMERIC(5,4)` | **NO** | — | Statistical confidence score (e.g. `0.9420`) |
| `classification` | `VARCHAR(50)` | **NO** | `'CORRELATED'` | Classification (`CORRELATED` or `CAUSAL`) |
| `status` | `VARCHAR(50)` | **NO** | `'ACTIVE'` | Status (`ACTIVE`, `SUPERSEDED`, `INVALIDATED`) |
| `created_at` | `TIMESTAMPTZ`| **NO** | `now()` | Timestamp of creation |
| `updated_at` | `TIMESTAMPTZ`| **NO** | `now()` | Timestamp of last modification |

---

# 44. Decision Entity

## Table Name

```text
decisions
```

## Owning Repository

```text
scriora-core
```

## Purpose

A `Decision` captures what the growth engine decides to execute based on verified insights.

Example:
```text
Insight:   PDF carousels yield 2.4x engagement over text posts.
Decision:  Shift weekly editorial allocation to 40% PDF carousels.
```

## Physical Schema

| Field | SQL Type | Nullable | Default | Description / Invariants |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `UUID` | **NO** | `gen_random_uuid()` | Primary Key |
| `workspace_id` | `UUID` | **NO** | — | Foreign Key → `workspaces.id` (Tenant Boundary) |
| `mission_id` | `UUID` | YES | `NULL` | Foreign Key → `missions.id` |
| `insight_id` | `UUID` | YES | `NULL` | Foreign Key → `insights.id` |
| `decision_type` | `VARCHAR(100)` | **NO** | — | Type (`ALLOCATION_SHIFT`, `SCHEDULE_CHANGE`, etc.) |
| `decision` | `JSONB` | **NO** | — | Actionable parameters and state change directives |
| `rationale` | `TEXT` | **NO** | — | Justification referencing the insight |
| `confidence` | `NUMERIC(5,4)` | **NO** | — | Engine confidence score |
| `requires_approval`| `BOOLEAN` | **NO** | `false` | Human gating indicator |
| `approval_id` | `UUID` | YES | `NULL` | Foreign Key → `approvals.id` |
| `status` | `VARCHAR(50)` | **NO** | `'PENDING'` | Status (`PENDING`, `APPROVED`, `REJECTED`, `EXECUTED`) |
| `created_at` | `TIMESTAMPTZ`| **NO** | `now()` | Timestamp of creation |
| `executed_at` | `TIMESTAMPTZ`| YES | `NULL` | Timestamp of execution |

---

# 45. Decision vs AgentTask Decoupling

```text
Decision   = Business Decision (Owned by scriora-core)
AgentTask  = Execution Unit (Owned by scriora-agent)
```

A `Decision` is never conflated with an `AgentTask`:
```text
Decision (Core) ──► Triggers ──► AgentTask (Agent) ──► Invokes ──► Skill ──► Tool
```

---

# 46. Business Memory Entity

## Table Name

```text
memories
```

## Owning Repository

```text
scriora-core (Authoritative) / scriora-agent (Engine & Embeddings)
```

## Physical Schema

| Field | SQL Type | Nullable | Default | Description / Invariants |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `UUID` | **NO** | `gen_random_uuid()` | Primary Key |
| `workspace_id` | `UUID` | **NO** | — | Foreign Key → `workspaces.id` (Tenant Boundary) |
| `category` | `VARCHAR(50)` | **NO** | — | Memory tier category |
| `content` | `TEXT` | **NO** | — | Natural language or structured semantic knowledge |
| `source_type` | `VARCHAR(50)` | **NO** | — | Provenance (`INSIGHT`, `EXPERIMENT`, `USER_PREFERENCE`) |
| `source_id` | `UUID` | YES | `NULL` | ID of entity generating the memory |
| `confidence` | `NUMERIC(5,4)` | **NO** | `1.0` | Epistemic confidence score |
| `importance` | `NUMERIC(5,4)` | YES | `0.5` | Salience weight for context assembly |
| `valid_from` | `TIMESTAMPTZ`| YES | `now()` | Effective commencement timestamp |
| `valid_until` | `TIMESTAMPTZ`| YES | `NULL` | Expiration timestamp (e.g. 14 days for short-term) |
| `created_at` | `TIMESTAMPTZ`| **NO** | `now()` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ`| **NO** | `now()` | Modification timestamp |

*(Note: `embedding vector(1536)` is scheduled for Phase 2 Agent/Mission migration and is omitted from Classic GA DDL).*

---

# 47. Memory Provenance & Confidence

Every memory row must enforce traceable provenance:
```text
content + confidence + source_type + source_id
```

Anonymous or untraceable memories are forbidden. The AI agent must never treat an ungrounded inference as factual brand knowledge.

---

# 48. Referential Integrity & Foreign Keys

```sql
ALTER TABLE missions
  ADD CONSTRAINT fk_missions_workspace
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;

ALTER TABLE goals
  ADD CONSTRAINT fk_goals_workspace
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_goals_mission
  FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE;

ALTER TABLE strategies
  ADD CONSTRAINT fk_strategies_workspace
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_strategies_mission
  FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE;

ALTER TABLE growth_hypotheses
  ADD CONSTRAINT fk_hypotheses_workspace
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_hypotheses_mission
  FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_hypotheses_strategy
  FOREIGN KEY (strategy_id) REFERENCES strategies(id) ON DELETE CASCADE;

ALTER TABLE experiments
  ADD CONSTRAINT fk_experiments_workspace
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_experiments_mission
  FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_experiments_hypothesis
  FOREIGN KEY (hypothesis_id) REFERENCES growth_hypotheses(id) ON DELETE RESTRICT;

ALTER TABLE evidence_records
  ADD CONSTRAINT fk_evidence_workspace
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_evidence_mission
  FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_evidence_experiment
  FOREIGN KEY (experiment_id) REFERENCES experiments(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_evidence_publication
  FOREIGN KEY (publication_id) REFERENCES publications(id) ON DELETE SET NULL;

ALTER TABLE insights
  ADD CONSTRAINT fk_insights_workspace
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_insights_mission
  FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_insights_experiment
  FOREIGN KEY (experiment_id) REFERENCES experiments(id) ON DELETE SET NULL;

ALTER TABLE decisions
  ADD CONSTRAINT fk_decisions_workspace
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_decisions_mission
  FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_decisions_insight
  FOREIGN KEY (insight_id) REFERENCES insights(id) ON DELETE SET NULL;

ALTER TABLE memories
  ADD CONSTRAINT fk_memories_workspace
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
```

---

# 49. Mission Deletion Policy (No Cascade on Knowledge)

Deleting a `Mission` must **NOT** delete historical knowledge:
```text
Mission Deleted       ──► Soft delete / Archive
Experiment            ──► Retain historical record
EvidenceRecord        ──► Retain for longitudinal analytics
Insight               ──► Retain in workspace knowledge base
Decision              ──► Retain for compliance and audit
Business Memory       ──► Retain permanent brand knowledge
```

---

# 50. Query-Driven Index Strategy

### Missions Table
```sql
CREATE INDEX idx_missions_workspace_status ON missions(workspace_id, status);
CREATE INDEX idx_missions_workspace_ends ON missions(workspace_id, ends_at);
```

### Goals Table
```sql
CREATE INDEX idx_goals_mission ON goals(mission_id);
CREATE INDEX idx_goals_workspace_status ON goals(workspace_id, status);
```

### Strategies Table
```sql
CREATE INDEX idx_strategies_mission_version ON strategies(mission_id, version DESC);
CREATE INDEX idx_strategies_workspace_status ON strategies(workspace_id, status);
```

### Hypotheses Table
```sql
CREATE INDEX idx_hypotheses_mission_status ON growth_hypotheses(mission_id, status);
CREATE INDEX idx_hypotheses_strategy ON growth_hypotheses(strategy_id);
```

### Experiments Table
```sql
CREATE INDEX idx_experiments_mission_status ON experiments(mission_id, status);
CREATE INDEX idx_experiments_hypothesis ON experiments(hypothesis_id);
CREATE INDEX idx_experiments_started ON experiments(started_at DESC);
```

### Evidence Records Table
```sql
CREATE INDEX idx_evidence_workspace_captured ON evidence_records(workspace_id, captured_at DESC);
CREATE INDEX idx_evidence_experiment ON evidence_records(experiment_id, captured_at DESC);
CREATE INDEX idx_evidence_publication ON evidence_records(publication_id, captured_at DESC);
```

### Insights Table
```sql
CREATE INDEX idx_insights_workspace_created ON insights(workspace_id, created_at DESC);
CREATE INDEX idx_insights_mission ON insights(mission_id, created_at DESC);
```

### Decisions Table
```sql
CREATE INDEX idx_decisions_workspace_created ON decisions(workspace_id, created_at DESC);
CREATE INDEX idx_decisions_mission ON decisions(mission_id, created_at DESC);
CREATE INDEX idx_decisions_status ON decisions(status);
```

### Memories Table
```sql
CREATE INDEX idx_memories_workspace_category ON memories(workspace_id, category);
CREATE INDEX idx_memories_source ON memories(source_type, source_id);
CREATE INDEX idx_memories_validity ON memories(workspace_id, valid_until) WHERE valid_until IS NOT NULL;
```

---

# 51. Mission Unique Constraints

```sql
-- 1. Unique hypothesis tag within a mission (e.g. H-01, H-02)
ALTER TABLE growth_hypotheses
ADD CONSTRAINT uq_hypotheses_mission_key
UNIQUE (mission_id, key);

-- 2. Unique strategy version within a mission
ALTER TABLE strategies
ADD CONSTRAINT uq_strategies_mission_version
UNIQUE (mission_id, version);
```

---

# 52. Pre-Prisma Settlement Checklist (Mission & Growth)

Before running final Prisma code generation for the Mission Engine:
1. Confirm canonical list of `metric_key` strings in the Analytics Catalog.
2. Confirm Zod schemas for `experiments.design` and `decisions.decision`.
3. Confirm exact approval linkage when `requires_approval = true`.
4. Confirm multi-approver hierarchy and signed review tokens for mission decisions.


---

# ========================================================================
# PART III: Human Governance (Approval) & Empirical Analytics Intelligence
# ========================================================================

# 53. Human Governance & Approval Domain

## Purpose

An `Approval` represents a formal human decision gate required before executing an action governed by policy:

```text
Approval ≠ content.approved = true
```

Scriora rejects representing approval as a simple boolean flag. A production governance engine requires an audit trail answering:
- **WHO** decided? (User ID or external stakeholder via signed capability)
- **WHAT** specific resource was evaluated? (`resource_type`, `resource_id`)
- **WHICH VERSION** was approved? (`approved_version` snapshot)
- **WHEN** was the decision recorded? (`decided_at`)
- **WAS IT A REJECTION OR CHANGE REQUEST?** (`decision_note`)
- **DID THE CAPABILITY EXPIRE?** (`expires_at`, `used_at`)

---

# 54. Approval Entity Ownership

```text
scriora-core (Domain Owner)
├── Approval Entity & State Machine
├── Approval Rule Contracts
└── Approval Audit Trail

scriora-api (Transport Owner)
├── Internal REST Endpoints
└── Cryptographically Signed Capability Endpoints (/api/v1/approvals/signed/:token)

scriora-web (Presentation Owner)
└── Stakeholder Review Portal & Client Magic-Link UI
```

---

# 55. Approval Physical Schema

## Table Name

```text
approvals
```

## Owning Repository

```text
scriora-core
```

## Physical Schema

| Field | SQL Type | Nullable | Default | Description / Invariants |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `UUID` | **NO** | `gen_random_uuid()` | Primary Key |
| `workspace_id` | `UUID` | **NO** | — | Foreign Key → `workspaces.id` (Tenant Boundary) |
| `resource_type` | `VARCHAR(50)` | **NO** | — | Target entity type (`PUBLICATION`, `MISSION`, `CAMPAIGN`) |
| `resource_id` | `UUID` | **NO** | — | Target entity identifier |
| `resource_version` | `INTEGER` | **NO** | `1` | Specific version reviewed and locked |
| `requested_by_user_id`| `UUID` | YES | `NULL` | Requester (Foreign Key → `users.id`) |
| `requested_at` | `TIMESTAMPTZ`| **NO** | `now()` | Request submission timestamp |
| `status` | `VARCHAR(50)` | **NO** | `'PENDING'` | Approval lifecycle status |
| `decided_by_user_id` | `UUID` | YES | `NULL` | Reviewer (Foreign Key → `users.id`, NULL for signed links) |
| `decided_at` | `TIMESTAMPTZ`| YES | `NULL` | Decision timestamp |
| `decision_note` | `TEXT` | YES | `NULL` | Mandatory justification for rejection / change requests |
| `required_at` | `TIMESTAMPTZ`| YES | `NULL` | Operational deadline for decision |
| `created_at` | `TIMESTAMPTZ`| **NO** | `now()` | Timestamp of creation |
| `updated_at` | `TIMESTAMPTZ`| **NO** | `now()` | Timestamp of last modification |

---

# 56. Approval Polymorphic Resource Decoupling

Approvals are decoupled from specific publication records via:
```text
resource_type: VARCHAR(50)
resource_id:   UUID
```

Supported resource types:
- `PUBLICATION`: Review of social post content, media attachments, and scheduled time.
- `MISSION`: Review of autonomous strategy, budget allocation, and target milestones.
- `CAMPAIGN`: Multi-post thematic release approval.

---

# 57. Approval Lifecycle States

```text
PENDING            ──► Awaiting human reviewer action
APPROVED           ──► Explicitly accepted; unlocks execution pipeline
REJECTED           ──► Permanently rejected; terminal state
CHANGES_REQUESTED  ──► Feedback provided; author/agent must revise and resubmit
EXPIRED            ──► Deadline or review window passed without action
CANCELLED          ──► Withdrawn by requester or superseded
```

### Distinction: `CHANGES_REQUESTED` vs `REJECTED`
- `REJECTED` terminates the proposal permanently.
- `CHANGES_REQUESTED` preserves the proposal and feedback, prompting a revised draft.

---

# 58. Cryptographic Version Binding Invariant

```text
Publication (version = 7)  ──►  Approval (resource_version = 7, status = 'APPROVED')
```

If content is modified after approval:
```text
Publication updated ──► version advances to 8 ──► Approval for v7 is AUTOMATICALLY INVALIDATED
```

**Security Rationale:** Prevents the "bait-and-switch" vulnerability where benign content is reviewed, approved, and subsequently edited into unauthorized text prior to automated publication.

---

# 59. Signed Approval Links & Tokens

External stakeholders (e.g. agency clients) may review proposals without having full workspace accounts.

Security parameters:
- `workspace_id`
- `resource_type` & `resource_id`
- `expires_at` (Default: 7 days)
- `nonce` (Cryptographic single-use salt)
- Signature: `HMAC-SHA-256` or `Signed JWT`

---

# 60. Approval Token Storage Physical Schema

Raw security tokens are **NEVER** stored in the database. Only their SHA-256 hashes are persisted:

## Table Name

```text
approval_tokens
```

## Physical Schema

| Field | SQL Type | Nullable | Default | Description / Invariants |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `UUID` | **NO** | `gen_random_uuid()` | Primary Key |
| `workspace_id` | `UUID` | **NO** | — | Foreign Key → `workspaces.id` (Tenant Boundary) |
| `approval_id` | `UUID` | **NO** | — | Foreign Key → `approvals.id` ON DELETE CASCADE |
| `token_hash` | `CHAR(64)` | **NO** | — | SHA-256 hash of raw link token |
| `expires_at` | `TIMESTAMPTZ`| **NO** | — | Token expiration instant |
| `nonce` | `VARCHAR(64)` | **NO** | — | Unique cryptographic nonce |
| `used_at` | `TIMESTAMPTZ`| YES | `NULL` | Instant token was consumed |
| `created_at` | `TIMESTAMPTZ`| **NO** | `now()` | Record creation timestamp |

---

# 61. Replay & Atomic Consumption Protocol

1. **Viewing Content:** Viewing the review portal verifies the signature and expiration without consuming the token.
2. **Submitting Decision:** Submitting `APPROVED`, `REJECTED`, or `CHANGES_REQUESTED` atomically marks `used_at = now()` inside the decision transaction.

```sql
BEGIN TRANSACTION;
  -- 1. Lock approval and verify status is 'PENDING'
  SELECT * FROM approvals WHERE id = $approval_id FOR UPDATE;

  -- 2. Verify token is active, unexpired, and unused
  SELECT * FROM approval_tokens 
  WHERE approval_id = $approval_id AND token_hash = $hash AND used_at IS NULL AND expires_at > now()
  FOR UPDATE;

  -- 3. Verify target resource version matches approval.resource_version
  -- 4. Update approvals (status = $new_status, decided_at = now(), decision_note = $note)
  -- 5. Mark approval_tokens (used_at = now())
  -- 6. Insert AUDIT event and emit CONTENT_APPROVED / CONTENT_REJECTED domain event
COMMIT;
```

---

# 62. Two-Tier Analytics Architecture

Scriora divides analytics persistence into two decoupled relational layers:

```text
analytics_snapshots (Point-in-Time Observations)
         │
         └──< analytics_metrics (Individual Measured Metrics)
```

---

# 63. Analytics Snapshot Entity

## Table Name

```text
analytics_snapshots
```

## Owning Repository

```text
scriora-core
```

## Purpose

A snapshot records the complete observational state of a publication or social account at a distinct moment in time.

## Physical Schema

| Field | SQL Type | Nullable | Default | Description / Invariants |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `UUID` | **NO** | `gen_random_uuid()` | Primary Key |
| `workspace_id` | `UUID` | **NO** | — | Foreign Key → `workspaces.id` (Tenant Boundary) |
| `social_account_id` | `UUID` | YES | `NULL` | Account-level scope (FK → `social_accounts.id`) |
| `publication_id` | `UUID` | YES | `NULL` | Post-level scope (FK → `publications.id`) |
| `captured_at` | `TIMESTAMPTZ`| **NO** | `now()` | Measurement instant / TimescaleDB dimension |
| `observation_window`| `VARCHAR(50)` | YES | `NULL` | Observation window milestone |
| `source` | `VARCHAR(100)` | **NO** | — | Origin (`LINKEDIN_GRAPH_API`, `X_METRICS_V2`) |
| `status` | `VARCHAR(50)` | **NO** | `'COMPLETE'` | Snapshot health status |
| `created_at` | `TIMESTAMPTZ`| **NO** | `now()` | Record creation timestamp |

---

# 64. Standardized Observation Windows

For longitudinal post analysis, snapshots record standardized evaluation intervals:

```text
TWO_HOURS            ──► T+2h  (Early engagement spike)
SIX_HOURS            ──► T+6h  (Algorithmic distribution test)
TWELVE_HOURS         ──► T+12h (Cross-timezone wave)
TWENTY_FOUR_HOURS    ──► T+24h (Standard primary baseline)
FORTY_EIGHT_HOURS    ──► T+48h (Tail engagement velocity)
SEVEN_DAYS           ──► T+7d  (Cumulative lifecycle total)
```

`observation_window` is an analytical tag; `captured_at` remains the authoritative timestamp.

---

# 65. Analytics Metric Entity

## Table Name

```text
analytics_metrics
```

## Owning Repository

```text
scriora-core
```

## Physical Schema

| Field | SQL Type | Nullable | Default | Description / Invariants |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `UUID` | **NO** | `gen_random_uuid()` | Primary Key |
| `snapshot_id` | `UUID` | **NO** | — | Foreign Key → `analytics_snapshots.id` ON DELETE CASCADE |
| `metric_key` | `VARCHAR(100)` | **NO** | — | Canonical metric key (`IMPRESSIONS`, `CLICKS`) |
| `value_numeric` | `NUMERIC(18,4)`| YES | `NULL` | Measured value (NULL when permission denied) |
| `value_text` | `TEXT` | YES | `NULL` | Categorical / string measurement |
| `status` | `VARCHAR(50)` | **NO** | `'AVAILABLE'` | Metric availability status |
| `source_metric` | `VARCHAR(100)` | YES | `NULL` | Native platform metric name (`impressionCount`) |
| `created_at` | `TIMESTAMPTZ`| **NO** | `now()` | Creation timestamp |

---

# 66. Strict Metric Semantics & Truthfulness Invariant

```text
Metric Availability Statuses:
  - AVAILABLE
  - PERMISSION_DENIED
  - NOT_SUPPORTED
  - TEMPORARILY_UNAVAILABLE
  - ERROR
```

### The Truthfulness Law:
```text
PERMISSION_DENIED ──► value_numeric = NULL (Never 0)
```

**Reasoning:** `0` impressions indicates zero human engagement. `NULL` with `PERMISSION_DENIED` indicates platform authorization constraints (e.g. LinkedIn personal profile vs organization page). Storing `0` for unpermitted metrics corrupts downstream statistical models.

---

# 67. Snapshot Append-Only Immutability

Analytics snapshots are strictly append-only:

```text
T+24h Snapshot (impressions: 1,000)
       ↓
T+48h Snapshot (impressions: 1,450)  ──► Appended as a NEW Snapshot
```

Modifying or overwriting past snapshots is strictly prohibited. Experiment evaluation algorithms require historical state at precise timestamps to compute velocity and decay curves.

---

# 68. TimescaleDB Extension Architecture

The analytics schema is engineered to be **100% PostgreSQL-standard and TimescaleDB-compatible**:

```sql
-- Production Scale Activation (Phase 2 / High Volume)
SELECT create_hypertable('analytics_snapshots', 'captured_at', chunk_time_interval => INTERVAL '7 days');
```

The application layer interacts exclusively via standard SQL. No business logic or domain contract depends on TimescaleDB-specific functions.

---

# 69. Unified Foreign Keys & Referential Integrity

```sql
-- Approvals FKs
ALTER TABLE approvals
  ADD CONSTRAINT fk_approvals_workspace
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;

ALTER TABLE approval_tokens
  ADD CONSTRAINT fk_tokens_workspace
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_tokens_approval
  FOREIGN KEY (approval_id) REFERENCES approvals(id) ON DELETE CASCADE;

-- Analytics FKs
ALTER TABLE analytics_snapshots
  ADD CONSTRAINT fk_snapshots_workspace
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_snapshots_account
  FOREIGN KEY (social_account_id) REFERENCES social_accounts(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_snapshots_publication
  FOREIGN KEY (publication_id) REFERENCES publications(id) ON DELETE SET NULL;

ALTER TABLE analytics_metrics
  ADD CONSTRAINT fk_metrics_snapshot
  FOREIGN KEY (snapshot_id) REFERENCES analytics_snapshots(id) ON DELETE CASCADE;
```

---

# 70. Unified Indexes & Unique Constraints

```sql
-- Approval Indexes
CREATE INDEX idx_approvals_workspace_status ON approvals(workspace_id, status);
CREATE INDEX idx_approvals_resource ON approvals(resource_type, resource_id);
CREATE INDEX idx_approval_tokens_hash ON approval_tokens(token_hash);
CREATE INDEX idx_approval_tokens_expiry ON approval_tokens(expires_at) WHERE used_at IS NULL;

-- Analytics Unique Constraints
ALTER TABLE analytics_snapshots
  ADD CONSTRAINT uq_snapshots_publication_window
  UNIQUE (publication_id, observation_window);

ALTER TABLE analytics_metrics
  ADD CONSTRAINT uq_metrics_snapshot_key
  UNIQUE (snapshot_id, metric_key);

-- Analytics Indexes
CREATE INDEX idx_snapshots_workspace_captured ON analytics_snapshots(workspace_id, captured_at DESC);
CREATE INDEX idx_snapshots_publication ON analytics_snapshots(publication_id, captured_at DESC);
CREATE INDEX idx_snapshots_account ON analytics_snapshots(social_account_id, captured_at DESC);
```

---

# 71. The 7-Layer Semantic Separation Invariant

Scriora's data architecture is anchored on the non-conflation of 7 semantic layers:

```text
1. Approval          = Formal Human Decision Record
2. AnalyticsSnapshot = Temporal Point-in-Time Observation
3. AnalyticsMetric   = Individual Measured Quantitative Fact
4. EvidenceRecord    = Traceable Input for Machine Reasoning
5. Insight           = Semantic Interpretation Grounded in Evidence
6. Decision          = Commercial Action Directive
7. AgentTask         = Autonomous Execution Unit
```

No two layers may be merged or substituted for each other.
