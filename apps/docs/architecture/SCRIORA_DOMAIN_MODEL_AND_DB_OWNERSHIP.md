# Scriora — Database Schema & Domain Model v1

> **Status:** Canonical Data Architecture Specification  
> **Role:** Authoritative reference for Database Schema, Domain Boundaries, and Persistence Ownership across all 11 Repositories  
> **Core Principle:** Shared PostgreSQL infrastructure does not imply shared table ownership. Every table has exactly one authoritative owner repository, strict tenant boundaries, and explicit write authority.

---

# 1. Database Architecture

Scriora uses:

```text
PostgreSQL 16
├── Core Business State
├── Agent-owned Execution State
├── Analytics
└── RLS / Tenant Isolation
```

With analytics data growth:

```text
PostgreSQL
└── TimescaleDB Extension
    └── analytics_snapshots
```

TimescaleDB is not an independent database deployment. It is an in-engine relational extension on top of PostgreSQL. The current architecture freezes this decision.

---

# 2. Ownership Rule

The fundamental persistence rule:

```text
Table
  ↓
Single Owner Repository
  ↓
Single Migration Authority
```

Multiple repositories using the same PostgreSQL deployment does not mean they share table ownership. Each table has:
- One Authoritative Owner Repository
- Dedicated Schema / Table Namespace
- Strict Tenant Boundary (`workspace_id`)
- Explicit Write Authority
- Strictly Defined Read Contracts
- Single Migration Authority

---

# 3. Core-Owned Tables

The authoritative commercial and business domain tables are owned exclusively by `scriora-core`:

```text
users
workspaces
workspace_members

social_accounts
secret_envelopes

contents
content_variants

publications
publish_attempts

approvals

media_assets

goals
strategies
growth_hypotheses
experiments
insights
decisions
missions

outbox_commands

analytics_snapshots
analytics_metrics
```

Tables whose final schema columns are not yet validated in migration/DDL code are tracked as "Schema TBD" pending formal DDL review.

---

# 4. Users

## Table

```text
users
```

## Confirmed Fields

```text
id               UUID PRIMARY KEY DEFAULT gen_random_uuid()
email            TEXT NOT NULL UNIQUE
name             TEXT NOT NULL
avatar_url       TEXT
auth_provider    TEXT NOT NULL DEFAULT 'local'
created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
```

The specification establishes `'local'` as the default value for `auth_provider`.

## Owner

```text
scriora-core
```

## Relationships

```text
User
 │
 └──< WorkspaceMember
```

---

# 5. Workspaces

## Table

```text
workspaces
```

## Confirmed Fields

```text
id                       UUID PRIMARY KEY DEFAULT gen_random_uuid()
name                     TEXT NOT NULL
slug                     TEXT NOT NULL UNIQUE
purpose                  TEXT NOT NULL
default_operating_mode   TEXT NOT NULL DEFAULT 'MANUAL'
owner_user_id            UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT
country                  TEXT
timezone                 TEXT NOT NULL DEFAULT 'UTC'
created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
```

## Confirmed Purpose Values

```text
PERSONAL
WORK
CLIENT
AGENT
```

## Relationships

```text
User
 │
 └──< Workspace
```
Connected via `owner_user_id`.

---

# 6. Workspace Members

## Table

```text
workspace_members
```

## Confirmed Fields

```text
workspace_id     UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE
user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
workspace_role   TEXT NOT NULL
joined_at        TIMESTAMPTZ NOT NULL DEFAULT now()
PRIMARY KEY (workspace_id, user_id)
```

## Confirmed Roles

```text
OWNER
ADMIN
EDITOR
VIEWER
```

## Relationship

```text
User
  │
  └──< WorkspaceMember >── Workspace
```

This establishes the canonical many-to-many relationship:

```text
User N:M Workspace
```

---

# 7. Tenant Boundary

The fundamental tenant boundary in Scriora is:

```text
Workspace
```

The specification freezes the use of session variables:

```sql
app.current_workspace_id
```

With the helper function:

```sql
current_workspace_id()
```

And Row-Level Security policies:

```sql
workspace_id = current_workspace_id()
```

Enforced with `FORCE ROW LEVEL SECURITY` on all tenant-scoped tables.

---

# 8. RLS Architecture

Every request must follow this strict verification pipeline:

```text
Authenticated User
        ↓
Workspace Membership Verification
        ↓
Authorized Workspace Context
        ↓
SET LOCAL app.current_workspace_id = '...'
        ↓
PostgreSQL Engine
        ↓
Row Level Security (RLS) Policy Execution
```

**Security Warning:** Never rely on headers like `X-Workspace-ID` or request params `workspaceId` alone as proof of authorization. Production systems strictly mandate membership validation and cryptographically signed session verification before setting `app.current_workspace_id`.

---

# 9. Social Accounts

## Table

```text
social_accounts
```

## Owner

```text
scriora-core
```

## Platform Implementation

```text
scriora-social
```

This establishes a critical architectural separation:
- **`scriora-core`**: Owns the local `SocialAccount` business entity, metadata, and workspace association.
- **`scriora-social`**: Owns platform-specific behavior, API adapters, and protocol integration.

---

# 10. Social Account Relationship

```text
Workspace
    │
    └──< SocialAccount
```

Every social account must strictly belong to a Workspace.  
The Social framework never decides workspace authorization.  
- **Core decides:** *"Is this user/session authorized to use this social account in this workspace?"*
- **Social decides:** *"How do we talk to LinkedIn / Instagram / X / TikTok APIs?"*

---

# 11. Secret Envelopes

## Table

```text
secret_envelopes
```

## Owner

```text
scriora-core
```

## Purpose

Secure storage for:
- Encrypted Credentials
- OAuth Access Tokens
- Refresh Tokens
- Platform Provider Secrets

All envelopes are isolated via RLS and encrypted using authenticated envelope encryption (`AES-256-GCM`).

---

# 12. Token Security

The secure execution pipeline:

```text
Encrypted Secret Envelope
           ↓
Controlled In-Memory Decryption (Token Service)
           ↓
Social Adapter (scriora-social)
           ↓
Official Platform API
```

### Strict Security Invariants
Secrets must **NEVER** travel to:
- `Agent Runtime`
- `LLM Context / Prompts`
- `Logs / Traces`
- `Events / Message Queues`
- `Analytics Snapshots`
- `Client-Facing API Responses`

---

# 13. Content

## Table

```text
contents
```

## Owner

```text
scriora-core
```

## Relationship

```text
Workspace
    │
    └──< Content
```

`Content` is the root business object from which all authoring, adaptation, scheduling, and publication flows originate.

## Confirmed Physical Schema

```text
id                  UUID PRIMARY KEY DEFAULT gen_random_uuid()
workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE
title               VARCHAR(255)
body                TEXT
status              VARCHAR(50) NOT NULL DEFAULT 'DRAFT'
created_by_user_id  UUID REFERENCES users(id) ON DELETE SET NULL
created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
deleted_at          TIMESTAMPTZ
```

---

# 14. Content Variant

The domain model distinguishes base content from channel-adapted variants:

```text
Content
   │
   └──< ContentVariant
```

A variant represents channel-specific adjustments:
- `Base`
- `LinkedIn`
- `Instagram`
- `X`
- `TikTok`
- `YouTube`

## Confirmed Physical Schema

```text
id                  UUID PRIMARY KEY DEFAULT gen_random_uuid()
workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE
content_id          UUID NOT NULL REFERENCES contents(id) ON DELETE CASCADE
platform            VARCHAR(50)
social_account_id   UUID REFERENCES social_accounts(id) ON DELETE RESTRICT
body                TEXT
metadata            JSONB DEFAULT '{}'
status              VARCHAR(50) NOT NULL DEFAULT 'DRAFT'
created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
```

### Architectural Decision: Extensible JSONB Metadata
Specific platform parameters (e.g. threads, carousel cards, reels audio) are encapsulated in `metadata JSONB` rather than modifying table DDL per platform.

---

# 15. Publication

`Publication` represents the persistent business record of a scheduled or executed release.

```text
Content
   │
   └──< Publication
             │
             └── SocialAccount
```

`Publication` contains business state and references. It contains zero social platform SDK code or network behavior.

## Confirmed Physical Schema

```text
id                  UUID PRIMARY KEY DEFAULT gen_random_uuid()
workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE
content_variant_id  UUID NOT NULL REFERENCES content_variants(id) ON DELETE RESTRICT
social_account_id   UUID NOT NULL REFERENCES social_accounts(id) ON DELETE RESTRICT
status              VARCHAR(50) NOT NULL DEFAULT 'DRAFT'
scheduled_at        TIMESTAMPTZ
timezone            VARCHAR(50) DEFAULT 'UTC'
published_at        TIMESTAMPTZ
external_post_id    VARCHAR(255)
external_post_url   TEXT
idempotency_key     VARCHAR(255) NOT NULL
fingerprint         CHAR(64) NOT NULL
created_by_user_id  UUID REFERENCES users(id) ON DELETE SET NULL
created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
```

---

# 16. Publish Attempts

## Table

```text
publish_attempts
```

## Owner

```text
scriora-core
```

## Confirmed States

```text
RESERVED
DISPATCHING
PLATFORM_PENDING
SUCCEEDED
UNKNOWN_EXTERNAL_STATE
FAILED_PERMANENT
```

## Confirmed Physical Schema

```text
id                  UUID PRIMARY KEY DEFAULT gen_random_uuid()
workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE
publication_id      UUID NOT NULL REFERENCES publications(id) ON DELETE CASCADE
attempt_number      INTEGER NOT NULL DEFAULT 1
status              VARCHAR(50) NOT NULL DEFAULT 'RESERVED'
idempotency_key     VARCHAR(255) NOT NULL
fingerprint         CHAR(64) NOT NULL
started_at          TIMESTAMPTZ
completed_at        TIMESTAMPTZ
external_id         VARCHAR(255)
external_url        TEXT
error_code          VARCHAR(100)
error_category      VARCHAR(50)
error_message       TEXT
retryable           BOOLEAN NOT NULL DEFAULT false
retry_after         TIMESTAMPTZ
response_metadata   JSONB DEFAULT '{}'
created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
UNIQUE (publication_id, attempt_number)
```

---

# 17. Publication State Machine

```text
RESERVED
   │
   ▼
DISPATCHING
   │
   ├──────────────► SUCCEEDED
   │
   ├──────────────► PLATFORM_PENDING
   │                     │
   │                     ▼
   │                  SUCCEEDED
   │
   ├──────────────► UNKNOWN_EXTERNAL_STATE
   │
   └──────────────► FAILED_PERMANENT
```

---

# 18. UNKNOWN_EXTERNAL_STATE

`UNKNOWN_EXTERNAL_STATE` is a core domain state, not an unhandled runtime exception.

Example trigger:
```text
POST platform API
      ↓
Network Timeout (Socket / Gateway)
      ↓
Did external platform create the post?
      ↓
UNKNOWN_EXTERNAL_STATE
```

Protocol:
```text
UNKNOWN_EXTERNAL_STATE
        ↓
Automated Reconciliation Workflow
```

**Strict Prohibition:** The system must **NEVER** blindly retry a `POST` operation when in `UNKNOWN_EXTERNAL_STATE`. Blind retry risks publishing duplicate content to live user channels.

---

# 19. Idempotency

Every publication attempt must have a deterministic:

```text
idempotency_key
```

Combined with a SHA-256 payload and content fingerprint.

Objective:
```text
Same Operation ──► Same Idempotency Key ──► Zero Duplicate Publications
```

---

# 20. Transactional Outbox

## Table

```text
outbox_commands
```

## Owner

```text
scriora-core
```

## Transaction Boundary

```text
BEGIN TRANSACTION;
  Create/Update Business State;
  Create Publication;
  Create PublishAttempt;
  Insert OutboxCommand;
COMMIT;
```

Then and only then:
```text
Outbox Poller / CDC
         ↓
Inngest Durable Workflow
         ↓
Worker Execution
```

**Rule:** External social network calls are strictly prohibited inside the database transaction.

## Confirmed Physical Schema (`outbox_commands`)

```text
id                  UUID PRIMARY KEY DEFAULT gen_random_uuid()
workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE
publication_id      UUID NOT NULL REFERENCES publications(id) ON DELETE CASCADE
publish_attempt_id  UUID NOT NULL REFERENCES publish_attempts(id) ON DELETE CASCADE
command_type        VARCHAR(100) NOT NULL
payload             JSONB NOT NULL
status              VARCHAR(50) NOT NULL DEFAULT 'PENDING'
available_at        TIMESTAMPTZ NOT NULL DEFAULT now()
claimed_at          TIMESTAMPTZ
processed_at        TIMESTAMPTZ
attempts            INTEGER NOT NULL DEFAULT 0
last_error          JSONB DEFAULT '{}'
created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
```

---

# 21. Outbox States

Confirmed lifecycle states for `outbox_commands`:

```text
PENDING
PROCESSING
PUBLISHED
FAILED
```

This tracks outbox message delivery, completely distinct from `publish_attempts` business status.

---

# 22. Why Two State Machines?

We separate:
1. **Business Attempt State (`publish_attempts`):** Represents the real-world business outcome on the social network.
2. **Delivery / Outbox State (`outbox_commands`):** Represents the internal message delivery progress.

### Scenario Example:
- `PublishAttempt` = `UNKNOWN_EXTERNAL_STATE`
- `OutboxCommand` = `FAILED` or `DEAD_LETTER`

This does not mean publication failed in reality. It means:
> Internal command dispatch has completed its delivery cycle; no new `CREATE` command may be emitted from this outbox entry until external reconciliation completes.

---

# 23. Media Assets

## Table

```text
media_assets
```

## Business Owner

```text
scriora-core
```

## Processing Owner

```text
scriora-media
```

`media_assets` is a tenant-scoped table tracking asset identity, URL, metadata, and lifecycle.

---

# 24. Media Boundary

```text
scriora-core
  ├── Asset Identity & UUID
  ├── Workspace Ownership
  ├── Business Relationships (Post attachments)
  └── Lifecycle State

scriora-media
  ├── Direct Upload Handlers
  ├── Format Validation & Sanitization
  ├── Transformations & Cropping
  ├── FFmpeg Transcoding & Compression
  ├── Thumbnail Generation
  ├── Object Storage Interaction (S3/R2)
  └── Orphaned Asset Cleanup
```

---

# 25. Image & Video Generation

Asset generation logic is strictly excluded from `scriora-core`.

Image pipeline:
```text
Agent Runtime
      ↓
ImageGenerationProvider (DALL-E / Midjourney / Flux / SD)
      ↓
Generated Asset Buffer
      ↓
scriora-media
      ↓
Validation & Storage Pipeline
```

Video pipeline:
```text
Agent Runtime
      ↓
VideoGenerationProvider (Runway / Sora / Pika)
      ↓
scriora-media (FFmpeg validation & transcoding)
      ↓
Object Storage
```

---

# 26. Goals

## Concept

`Goal` represents a high-level business objective for the workspace.

## Owner

```text
scriora-core
```

Confirmed core parameters:
- `KPI`
- `Baseline`
- `Target`
- `Deadline`

Relationship:
```text
Workspace
   │
   └──< Goal
```

## Confirmed Physical Schema (`goals`)

```text
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE
mission_id      UUID NOT NULL REFERENCES missions(id) ON DELETE CASCADE
name            VARCHAR(255) NOT NULL
metric_key      VARCHAR(100) NOT NULL
baseline_value  NUMERIC(14,4) NOT NULL DEFAULT 0
target_value    NUMERIC(14,4) NOT NULL
current_value   NUMERIC(14,4) DEFAULT 0
unit            VARCHAR(50) NOT NULL DEFAULT 'COUNT'
starts_at       TIMESTAMPTZ
ends_at         TIMESTAMPTZ NOT NULL
status          VARCHAR(50) NOT NULL DEFAULT 'IN_PROGRESS'
created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
```

---

# 27. Strategy

```text
Goal
  │
  └──< Strategy
```

Owner:
```text
scriora-core
```

A strategy can be:
- `Human-created`
- `Agent-generated`

Once generated, it becomes durable business state stored in `scriora-core`.

## Confirmed Physical Schema (`strategies`)

```text
id               UUID PRIMARY KEY DEFAULT gen_random_uuid()
workspace_id     UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE
mission_id       UUID NOT NULL REFERENCES missions(id) ON DELETE CASCADE
name             VARCHAR(255) NOT NULL
description      TEXT NOT NULL
target_audience  JSONB DEFAULT '{}'
content_pillars  JSONB DEFAULT '[]'
tone_profile     JSONB DEFAULT '{}'
status           VARCHAR(50) NOT NULL DEFAULT 'ACTIVE'
version          INTEGER NOT NULL DEFAULT 1
created_by       VARCHAR(50) NOT NULL DEFAULT 'HUMAN'
created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
UNIQUE (mission_id, version)
```

---

# 28. Hypothesis

```text
Strategy
   │
   └──< GrowthHypothesis
```

Owner:
```text
scriora-core
```

Examples from specification:
- `H-01: PDF Carousels increase engagement by 2.4x on technical topics`
- `H-02: Contrarian Hooks increase 3-second retention on LinkedIn`

## Confirmed Physical Schema (`growth_hypotheses`)

```text
id                  UUID PRIMARY KEY DEFAULT gen_random_uuid()
workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE
mission_id          UUID NOT NULL REFERENCES missions(id) ON DELETE CASCADE
strategy_id         UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE
key                 VARCHAR(50) NOT NULL
statement           TEXT NOT NULL
rationale           TEXT
expected_outcome    TEXT
success_metric_key  VARCHAR(100)
expected_effect     NUMERIC(8,4)
status              VARCHAR(50) NOT NULL DEFAULT 'PROPOSED'
created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
UNIQUE (mission_id, key)
```

**Epistemological Rule:** `SUPPORTED` indicates statistical correlation; it does NOT prove definitive causality.

---

# 29. Experiment

```text
GrowthHypothesis
       ↓
   Experiment
       ↓
Content Variants
       ↓
  Publications
       ↓
    Metrics
```

Owner:
```text
scriora-core
```

The agent may propose experiments; `scriora-core` owns the durable experiment state and outcome verification.

## Confirmed Physical Schema (`experiments`)

```text
id             UUID PRIMARY KEY DEFAULT gen_random_uuid()
workspace_id   UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE
mission_id     UUID NOT NULL REFERENCES missions(id) ON DELETE CASCADE
hypothesis_id  UUID NOT NULL REFERENCES growth_hypotheses(id) ON DELETE RESTRICT
name           VARCHAR(255) NOT NULL
description    TEXT
design         JSONB NOT NULL DEFAULT '{}'
status         VARCHAR(50) NOT NULL DEFAULT 'PLANNED'
started_at     TIMESTAMPTZ
ended_at       TIMESTAMPTZ
created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
```

---

# 30. Analytics

Confirmed tables:
```text
analytics_snapshots
analytics_metrics
```

The specification leverages TimescaleDB hypertables on `analytics_snapshots`:
- Primary partition keys: `workspace_id`, `captured_at`
- Primary index: `(workspace_id, captured_at DESC)`

## Confirmed Physical Schema (`analytics_snapshots`)

```text
id                  UUID PRIMARY KEY DEFAULT gen_random_uuid()
workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE
social_account_id   UUID REFERENCES social_accounts(id) ON DELETE SET NULL
publication_id      UUID REFERENCES publications(id) ON DELETE SET NULL
captured_at         TIMESTAMPTZ NOT NULL DEFAULT now()
observation_window  VARCHAR(50)  -- TWO_HOURS, SIX_HOURS, TWELVE_HOURS, TWENTY_FOUR_HOURS, FORTY_EIGHT_HOURS, SEVEN_DAYS
source              VARCHAR(100) NOT NULL
status              VARCHAR(50) NOT NULL DEFAULT 'COMPLETE'
created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
UNIQUE (publication_id, observation_window)
```

## Confirmed Physical Schema (`analytics_metrics`)

```text
id             UUID PRIMARY KEY DEFAULT gen_random_uuid()
snapshot_id    UUID NOT NULL REFERENCES analytics_snapshots(id) ON DELETE CASCADE
metric_key     VARCHAR(100) NOT NULL  -- Canonical metric key (e.g. IMPRESSIONS, CLICKS)
value_numeric  NUMERIC(18,4)          -- NULL when PERMISSION_DENIED (never 0)
value_text     TEXT
status         VARCHAR(50) NOT NULL DEFAULT 'AVAILABLE'  -- AVAILABLE, PERMISSION_DENIED, NOT_SUPPORTED, TEMPORARILY_UNAVAILABLE, ERROR
source_metric  VARCHAR(100)           -- Platform-native metric name (e.g. impressionCount)
created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
UNIQUE (snapshot_id, metric_key)
```

---

# 31. Analytics Ownership

Analytics data pipeline:
```text
Social Platform API
        ↓
Platform Metrics Extraction (scriora-social)
        ↓
Worker Pipeline (scriora-worker)
        ↓
Core Analytics Persistence (scriora-core)
        ↓
API Transport (scriora-api)
        ↓
Web UI (scriora-web)
```

Agent cognitive path:
```text
Core Analytics Persistence
        ↓
Agent Analytics Skill (scriora-agent)
        ↓
Statistical Analysis
        ↓
Evidence Generation
        ↓
Actionable Insight
```

---

# 32. Metric Semantics & Truthfulness

When an external platform metric cannot be fetched due to scope or permission limits:

```text
metric_value = NULL
metric_status = 'PERMISSION_LIMITED'
```

**Never store `0`:** Storing `0` for an unpermitted or missing metric constitutes data falsification and corrupts AI reasoning loops.

---

# 33. Memories

## Table

```text
memories
```

Confirmed fields:
- `workspace_id`
- `category` / `type`
- `content`
- `confidence`
- `source`
- `vector(1536)` (with HNSW index for cosine similarity search)

---

# 34. Memory Layers

Scriora divides cognitive memory into 6 explicit tiers:

```text
Working Context      ──► Redis / RAM (Ephemeral conversation state)
Short-term Context   ──► PostgreSQL (~14-day retention)
Brand Knowledge      ──► PostgreSQL + pgvector (Permanent)
Evidence Context     ──► PostgreSQL (Time-decaying relevance)
Preferences          ──► PostgreSQL (Permanent user / brand overrides)
Operational State    ──► Redis (Rebuildable operational cache)
```

`pgvector` is scheduled for Agent/Mission phases, not required for Classic GA.

---

# 35. Memory Ownership Decision

Architectural separation:
- **Business Memory:** Core-referenced, verifiable facts owned by `scriora-core`.
- **Agent Memory Engine:** Semantic embeddings, retrieval pipelines, and working state owned by `scriora-agent`.

The agent may maintain internal execution tables such as `agent_memory_items`. Duplicate representations of the same business fact are strictly forbidden.

---

# 36. Mission

`Mission` is an autonomous business objective.

Owner:
```text
scriora-core
```

Structure:
```text
Mission
 ├── Goal
 ├── Strategy
 ├── Hypotheses
 ├── Human Gating Rules
 └── Learning Loop Outcomes
```

## Confirmed Physical Schema (`missions`)

```text
id                  UUID PRIMARY KEY DEFAULT gen_random_uuid()
workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE
name                VARCHAR(255) NOT NULL
description         TEXT
status              VARCHAR(50) NOT NULL DEFAULT 'DRAFT'
starts_at           TIMESTAMPTZ
ends_at             TIMESTAMPTZ
created_by_user_id  UUID REFERENCES users(id) ON DELETE SET NULL
created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
```

---

# 37. AgentTask

`AgentTask` represents an execution unit, distinctly separated from a `Mission`:

```text
Mission    = High-level Business Objective (scriora-core)
AgentTask  = Concrete Operational Task (scriora-agent)
```

Hierarchy:
```text
Mission
   ↓
AgentTask
   ↓
SkillExecution
```

---

# 38. Skill Execution

Table:
```text
skill_executions
```

Owner:
```text
scriora-agent
```

Fields tracked:
- `skill_name`
- `version`
- `status` (`PENDING`, `RUNNING`, `SUCCEEDED`, `FAILED`)
- `started_at`
- `completed_at`
- `input_ref`
- `output_ref`
- `error_details`

---

# 39. Provider Runs

Table:
```text
provider_runs
```

Owner:
```text
scriora-agent
```

Tracks all AI calls across:
- `LLM` (OpenAI, Anthropic, Gemini, Groq, Ollama)
- `Image`
- `Video`
- `Multimodal`

Tracks: token usage, latency, provider model, cost, failures, and routing fallbacks.

---

# 40. Approval

Table:
```text
approvals
```

Owner:
```text
scriora-core
```

Human gating flow:
```text
Generated Content
        ↓
Approval Required Gate
        ↓
Human Reviewer
 ├── Approve
 ├── Reject
 └── Request Changes
```

The AI agent cannot bypass or override a required human approval state.

## Confirmed Physical Schema (`approvals`)

```text
id                    UUID PRIMARY KEY DEFAULT gen_random_uuid()
workspace_id          UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE
resource_type         VARCHAR(50) NOT NULL  -- PUBLICATION, MISSION, CAMPAIGN
resource_id           UUID NOT NULL
resource_version      INTEGER NOT NULL DEFAULT 1
requested_by_user_id  UUID REFERENCES users(id) ON DELETE SET NULL
requested_at          TIMESTAMPTZ NOT NULL DEFAULT now()
status                VARCHAR(50) NOT NULL DEFAULT 'PENDING' -- PENDING, APPROVED, REJECTED, CHANGES_REQUESTED, EXPIRED, CANCELLED
decided_by_user_id    UUID REFERENCES users(id) ON DELETE SET NULL
decided_at            TIMESTAMPTZ
decision_note         TEXT
required_at           TIMESTAMPTZ
created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
```

### Version Binding Security Invariant
Approvals are immutably bound to `resource_version`. If a resource is edited after approval (e.g. version advances from 7 to 8), the prior approval is automatically invalidated.

---

# 41. Signed Approval Links

Approval requests support external client review via signed links:
- Parameters: `workspace_id`, `post_id` / `mission_id`, `expires_at`, `nonce`
- Cryptographic Signature: HMAC SHA-256 or signed JWT

**Capability Scoping:** A signed approval link grants restricted capability to approve or reject the specific targeted object only. It grants zero general workspace access.

## Confirmed Physical Schema (`approval_tokens`)

```text
id           UUID PRIMARY KEY DEFAULT gen_random_uuid()
workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE
approval_id  UUID NOT NULL REFERENCES approvals(id) ON DELETE CASCADE
token_hash   CHAR(64) NOT NULL  -- SHA-256 hash of raw security token (raw token is never stored)
expires_at   TIMESTAMPTZ NOT NULL
nonce        VARCHAR(64) NOT NULL
used_at      TIMESTAMPTZ
created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
```

---

# 42. Audit Logging

Every security-sensitive or business-critical action must be audit-logged:
- OAuth flow initiation & token refresh
- Token revocation & deletion
- Content publication & cancellation
- Human approval decisions
- Agent autonomous actions & tool calls
- Policy decisions & safety blocks
- API key generation & rotation
- Workspace membership modifications
- Billing tier changes

`scriora-core` owns Business Audit logs. `scriora-agent` owns Execution Traces.

---

# 43. Foreign-Key Philosophy

Foreign keys are strictly enforced in PostgreSQL for all business-critical relationships:

```sql
workspace_members.workspace_id  -->  workspaces.id (ON DELETE CASCADE)
workspace_members.user_id       -->  users.id (ON DELETE CASCADE)
social_accounts.workspace_id    -->  workspaces.id (ON DELETE RESTRICT)
contents.workspace_id           -->  workspaces.id (ON DELETE RESTRICT)
media_assets.workspace_id       -->  workspaces.id (ON DELETE RESTRICT)
publications.content_id         -->  contents.id (ON DELETE RESTRICT)
publications.social_account_id  -->  social_accounts.id (ON DELETE RESTRICT)
publish_attempts.publication_id -->  publications.id (ON DELETE CASCADE)
```

Never rely on application code alone to maintain referential integrity.

---

# 44. Tenant-Scoped Index Philosophy

Every high-cardinality tenant-scoped table must support fast workspace-filtered queries:

```sql
-- Pattern 1: Workspace chronology
CREATE INDEX idx_contents_workspace_created ON contents(workspace_id, created_at DESC);

-- Pattern 2: Workspace status filtering
CREATE INDEX idx_publications_workspace_status ON publications(workspace_id, status);

-- Pattern 3: Scheduled calendar queue
CREATE INDEX idx_publications_workspace_scheduled ON publications(workspace_id, scheduled_at);
```

Indexes are created strictly based on real query patterns, not arbitrarily on every column.

---

# 45. Unique Constraints

Unique constraints protect core domain invariants:

```sql
-- Prevent duplicate user registrations
ALTER TABLE users ADD CONSTRAINT uq_users_email UNIQUE (email);

-- Prevent duplicate workspace URL slugs
ALTER TABLE workspaces ADD CONSTRAINT uq_workspaces_slug UNIQUE (slug);

-- Prevent binding the same external social account twice within the same workspace
ALTER TABLE social_accounts ADD CONSTRAINT uq_workspace_platform_account 
UNIQUE (workspace_id, platform, external_account_id);
```

---

# 46. Delete Strategy

Unrestricted `CASCADE` is strictly prohibited. Before deleting an entity, an explicit strategy must be applied:

```text
Hard Delete        ──► Ephemeral caches, temporary tokens
Soft Delete        ──► Workspaces, Users, Social Accounts, Content
Archive            ──► Historic campaigns, inactive experiments
Retain for Audit   ──► Audit logs, Transactions, Approvals, Publish Attempts
Anonymize          ──► GDPR user erasure requests
Block Delete       ──► Accounts with active scheduled publications
```

---

# 47. Retention Policies

Data retention is customized by data sensitivity and durability:

```text
Short-term Agent Context  ──► ~14 days (Automatic pruning)
Brand Knowledge           ──► Permanent (Workspace lifetime)
User Preferences          ──► Permanent
Empirical Evidence        ──► Time-decaying confidence weight
Operational Cache         ──► Rebuildable on demand
Audit Logs                ──► 7 years compliance archive
```

---

# 48. Database Extensions Timeline

```text
Phase 1 (Classic GA):
  - pgcrypto (Required for UUID generation and encryption functions)

Phase 2 (Agent & Mission Engine):
  - pgvector (Vector embeddings for brand memory and RAG)
  - TimescaleDB (Relational hypertables for analytics snapshots)
```

---

# 49. Redis Boundary

Redis is reserved for:
- Ephemeral caching
- Distributed locks (Redlock)
- Rate-limit sliding window counters
- Operational coordination state

**Rule:** Redis is never the business source of truth. Even decrypted token caches must not replace the PostgreSQL `secret_envelopes` table as the primary source of credentials.

---

# 50. Inngest Boundary

Inngest is responsible for:
- Durable workflow orchestration
- Non-blocking delays (`step.sleepUntil()`)
- Step-level automatic retries
- Long-running multi-stage sagas

**Rule:** PostgreSQL remains the sole source of truth for business entity state. The worker reads pending commands using `FOR UPDATE SKIP LOCKED` to prevent concurrency collisions.

---

# 51. Final Entity-Relationship & Mission Graphs

## Core Entity-Relationship Graph

```text
User
 │
 └──< WorkspaceMember >── Workspace
                            │
        ┌───────────────────┼─────────────────────┐
        │                   │                     │
        ▼                   ▼                     ▼
  SocialAccount          Content                Goal
        │                   │                     │
        │                   ▼                     ▼
        │             ContentVariant          Strategy
        │                   │                     │
        │                   ▼                     ▼
        │              Publication            GrowthHypothesis
        │                   │                     │
        │                   ▼                     ▼
        │             PublishAttempt          Experiment
        │
        │
        └─────────────────────────────┐
                                      ▼
                                   Metrics
                                      │
                                      ▼
                                   Evidence
                                      │
                                      ▼
                                   Insight
                                      │
                                      ▼
                                   Decision
```

## Autonomous Mission Loop Graph

```text
Workspace
   │
   └──< Mission
          │
          ├── Goal
          ├── Strategy
          └── GrowthHypothesis
                  │
                  ▼
              AgentTask
                  │
                  ▼
            SkillExecution
                  │
                  ▼
             ProviderRun
                  │
                  ▼
               Evidence
                  │
                  ▼
               Insight
                  │
                  ▼
              Decision
```

---

# 52. Final Repository Ownership

```text
scriora-core
├── Business Entities & Invariants
├── Authoritative Database Schema & Migrations
├── Row Level Security (RLS) Policies
├── Database Transactions
├── Transactional Outbox
├── Business State Machines
└── Business Audit Logging

scriora-social
├── Platform Adapters (LinkedIn, X, Meta, TikTok, YouTube)
├── OAuth Handshake & Token Refresh
├── Publication Dispatch & Remote Verification
├── Remote Metrics Extraction
└── Webhook Ingestion & Signature Verification

scriora-worker
├── Durable Workflow Step Handlers
├── Queue Execution & Outbox Dispatching
├── Retry Strategies & Exponential Backoff
├── External State Reconciliation
└── Background Maintenance Tasks

scriora-media
├── Media File Upload Validation
├── Image Processing & Cropping
├── FFmpeg Video Transcoding & Compression
└── Object Storage Infrastructure Integration

scriora-agent
├── Agent Cognitive Runtime
├── Skill Implementations (Deterministic & AI)
├── Canonical Tool Handlers
├── Memory Engine (Retrieval & Embeddings)
├── Governance Policies & Safety Guardrails
├── Multi-Provider AI Routing (LLM, Image, Video)
└── Agent Execution State Persistence (Tasks, Skills, Runs)
```

---

# 53. What We Will NOT Do (The 9 Forbidden Antipatterns)

```text
❌ scriora-core   ──► Must NOT import Social SDKs or make direct social HTTP calls
❌ scriora-core   ──► Must NOT host Agent Runtime or LLM orchestration logic
❌ scriora-core   ──► Must NOT execute FFmpeg transcoding or heavy media processing
❌ scriora-agent  ──► Must NOT import Social SDKs or publish directly to networks
❌ scriora-agent  ──► Must NOT bypass Human Gating on required approval states
❌ scriora-web    ──► Must NOT connect directly to PostgreSQL or bypass API layer
❌ scriora-mcp    ──► Must NOT bypass Core business contracts or access database directly
❌ Redis          ──► Must NOT be used as the authoritative business source of truth
❌ AgentTask      ──► Must NOT replace or subsume the business Mission entity
```

---

# 54. Schema Readiness & Pre-Migration Checklist

We have established:
- [x] Entity ownership across 11 repositories
- [x] Strict tenant isolation boundary (`Workspace`)
- [x] Complete RLS architecture & security verification flow
- [x] Core relational topology
- [x] Publication lifecycle state machine
- [x] Transactional Outbox pattern & lifecycle
- [x] `UNKNOWN_EXTERNAL_STATE` reconciliation protocol
- [x] Analytics pipeline & TimescaleDB hypertable strategy
- [x] Agent execution persistence boundary
- [x] Media processing separation boundary
- [x] Social platform adapter boundary
- [x] 6-tier memory architecture & storage engines

Before finalizing `schema.prisma` and running migrations, confirm the following 15 items:
1. Exact column definitions and types for `Publication` and `ContentVariant`.
2. Exact enum values for `WorkspaceMemberRole` and `SocialPlatformType`.
3. Secret envelope encryption algorithm (`AES-256-GCM`) key rotation mechanism.
4. Exact `Approval` schema supporting multi-approver hierarchy.
5. Exact `Goal` KPI schema and target thresholds.
6. Exact `Strategy` schema and channel mix matrix.
7. Exact `GrowthHypothesis` schema and confidence scoring formulas.
8. Exact `Experiment` schema and A/B variant cohorts.
9. Exact `Insight` schema and statistical confidence scores.
10. Exact `Decision` schema and actionable links.
11. Exact `Mission` lifecycle states and timeframes.
12. Exact TimescaleDB relational hypertable partitioning parameters.
13. GDPR deletion and data retention automation scripts.
14. Unique constraints and composite index performance benchmarks.
15. Outbox polling index strategy (`FOR UPDATE SKIP LOCKED`).

---

# 55. Architectural Decision

> **Final Architectural Freeze:**  
> PostgreSQL is the sole authoritative source of business domain truth. `scriora-core` owns the business schema, RLS policies, and database transactions. `scriora-agent` owns execution telemetry persistence within PostgreSQL without owning business entities. `scriora-social` owns the platform framework, `scriora-media` owns media processing, and `scriora-worker` owns durable workflow execution.

---

# Appendix: 24-Entity Domain Ownership Matrix

| Domain Entity | Physical Table | Owning Repository | Schema Status |
| :--- | :--- | :--- | :--- |
| User | `users` | `scriora-core` | Defined in Spec |
| Workspace | `workspaces` | `scriora-core` | Defined in Spec |
| Workspace Member | `workspace_members` | `scriora-core` | Defined in Spec |
| Social Account | `social_accounts` | `scriora-core` | Defined in Spec |
| Secret Envelope | `secret_envelopes` | `scriora-core` | Defined in Spec |
| Content | `contents` | `scriora-core` | Defined in Spec |
| Content Variant | `content_variants` | `scriora-core` | Defined in Domain Model Spec |
| Publication | `publications` | `scriora-core` | Defined in Domain Model Spec |
| Publish Attempt | `publish_attempts` | `scriora-core` | Defined in Spec |
| Outbox Command | `outbox_commands` | `scriora-core` | Defined in Spec |
| Approval | `approvals` | `scriora-core` | Defined in Domain Model Spec |
| Media Asset | `media_assets` | `scriora-core` | Defined in Spec |
| Analytics Snapshot | `analytics_snapshots` | `scriora-core` | Defined in Spec |
| Analytics Metric | `analytics_metrics` | `scriora-core` | Defined in Spec |
| Goal | `goals` | `scriora-core` | Defined in Domain Model Spec |
| Strategy | `strategies` | `scriora-core` | Defined in Domain Model Spec |
| Growth Hypothesis | `growth_hypotheses` | `scriora-core` | Defined in Domain Model Spec |
| Experiment | `experiments` | `scriora-core` | Defined in Domain Model Spec |
| Insight | `insights` | `scriora-core` | Defined in Domain Model Spec |
| Decision | `decisions` | `scriora-core` | Defined in Domain Model Spec |
| Mission | `missions` | `scriora-core` | Defined in Domain Model Spec |
| Memory | `memories` | `scriora-agent` / `scriora-core` | Defined in Spec |
| Agent Task | `agent_tasks` | `scriora-agent` | Defined in Domain Model Spec |
| Skill Execution | `skill_executions` | `scriora-agent` | Defined in Domain Model Spec |
| Provider Run | `provider_runs` | `scriora-agent` | Defined in Domain Model Spec |
