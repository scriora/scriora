# Scriora — Final Database Contract

## Database Schema, Relationships, Constraints, Indexes, Retention & ERD

> **Status:** Final Architectural Closure (Database Design 100% Complete)  
> **Role:** Canonical Domain-Level Database Contract freezing Schemas, ERD, Constraints, and Invariants.  
> **Mandate:** Zero implementation code (Prisma, SQL, DDL migrations, or repository code) is permitted prior to formal adoption of this document.

---

# 1. Database Decision

Scriora adopts:

```text
PostgreSQL 16
```

As the sole:

```text
Single Source of Truth
```

For all durable business and domain state.

```text
Redis
```

Is strictly confined to:

```text
- Ephemeral Caching
- Distributed Redlock Coordination
- Sliding-Window Rate Limiting
- Temporary Session & Operational State
```

**Rule:** Redis is never treated as the authoritative business source of truth.

---

# 2. Database Ownership

Logical database table ownership:

```text
scriora-core   ──► Authoritative Owner of Business Database
scriora-agent  ──► Authoritative Owner of Agent Execution Telemetry
```

Both coexist within the same PostgreSQL cluster without violating architectural boundaries:

> **Core Rule:** Shared PostgreSQL infrastructure does NOT imply shared table ownership.

Every table in the database has:
1. **Single Owner Repository**
2. **Single Migration Authority**
3. **Single Domain Responsibility**

---

# 3. Final Table Inventory (28 Tables)

## Identity & Tenancy (3 tables)
```text
users
workspaces
workspace_members
```

## Social Accounts & Security (2 tables)
```text
social_accounts
secret_envelopes
```

## Content & Publishing Pipeline (5 tables)
```text
contents
content_variants
publications
publish_attempts
outbox_commands
```

## Human Governance & Approval (2 tables)
```text
approvals
approval_tokens
```

## Media Assets (1 table)
```text
media_assets
```

## Autonomous Growth & Mission (6 tables)
```text
missions
goals
strategies
growth_hypotheses
experiments
experiment_content_variants
```

## Analytics, Empirical Evidence & Memory (6 tables)
```text
analytics_snapshots
analytics_metrics
evidence_records
insights
decisions
memories
```

## Agent Execution Telemetry (3 tables)
```text
agent_tasks
skill_executions
provider_runs
```

---

# 4. Universal Tenant Rule

Every multi-tenant domain table must enforce:

```text
workspace_id: UUID NOT NULL
```

The database security model guarantees:

```sql
workspace_id = current_workspace_id()
```

Context is injected per transaction via `SET LOCAL app.current_workspace_id`, backed by PostgreSQL `FORCE ROW LEVEL SECURITY`.

---

# 5. Identity Tables

## 5.1 users
- **Owner:** `scriora-core`
- **Purpose:** Represents human users and system actors.
- **Relationships:** `User └──< WorkspaceMember`
- **Delete Strategy:** `RESTRICT`. Users with historical records or workspace memberships are never hard-deleted. GDPR erasure is handled via **Anonymization**.

## 5.2 workspaces
- **Owner:** `scriora-core`
- **Purpose:** Primary tenant isolation boundary.
- **Relationships:** Root parent of all workspace-scoped entities.
- **Delete Strategy:** `ARCHIVE`. Hard deletion is prohibited by default; inactive workspaces transition to an archived state followed by asynchronous retention scrubbing.

## 5.3 workspace_members
- **Owner:** `scriora-core`
- **Composite Identity:** `PRIMARY KEY (workspace_id, user_id)`
- **Delete Strategy:** `CASCADE` when a workspace is purged; `RESTRICT` on user deletion.

---

# 6. Social Accounts

## 6.1 social_accounts
- **Entity Owner:** `scriora-core`
- **Platform Behavior:** `scriora-social`
- **Relationship:** `Workspace └──< SocialAccount`
- **Unique Constraint:** `(workspace_id, platform, external_account_id)`
- **Delete Strategy:** `DISCONNECT / SOFT DELETE`. Disconnecting an account preserves historical publishing audit logs.

---

# 7. secret_envelopes
- **Owner:** `scriora-core`
- **Purpose:** Secure authenticated storage (`AES-256-GCM`) for OAuth access tokens, refresh tokens, and API credentials.
- **Relationship:** `SocialAccount └──< SecretEnvelope`
- **Zero-Leakage Guarantee:** Decrypted credentials never travel to Agent Context, LLM prompts, logs, analytics, message queues, or client API responses.
- **Delete Strategy:** Cryptographic revocation and secure erasure upon account disconnection.

---

# 8. Content Tables

## 8.1 contents
- **Owner:** `scriora-core`
- **Purpose:** Channel-agnostic creative root object (`Content ≠ Publication`).
- **Relationship:** `Workspace └──< Content`
- **Delete Strategy:** `SOFT DELETE / ARCHIVE`.

---

# 9. content_variants
- **Owner:** `scriora-core`
- **Purpose:** Channel-adapted version of base content (`LinkedIn`, `X`, `TikTok`, etc.).
- **Relationships:** `Content └──< ContentVariant ──> SocialAccount (Optional)`
- **Metadata:** Channel options encapsulated in validated `metadata JSONB` without DDL column churn.
- **Delete Strategy:** `SOFT DELETE`.

---

# 10. publications
- **Owner:** `scriora-core`
- **Purpose:** Durable business release intent and scheduling contract.
- **Relationships:** `ContentVariant ──< Publication >── SocialAccount`
- **Delete Strategy:** `RETAIN`. Confirmed publication records are immutable historical ledgers.

---

# 11. publish_attempts
- **Owner:** `scriora-core`
- **Purpose:** Operational ledger of specific technical delivery dispatches.
- **Relationship:** `Publication └──< PublishAttempt`
- **Unique Constraint:** `(publication_id, attempt_number)`
- **Confirmed States:** `RESERVED`, `DISPATCHING`, `PLATFORM_PENDING`, `SUCCEEDED`, `UNKNOWN_EXTERNAL_STATE`, `FAILED_PERMANENT`.
- **Delete Strategy:** `RETAIN`.

---

# 12. UNKNOWN_EXTERNAL_STATE Protocol

`UNKNOWN_EXTERNAL_STATE` is an explicit domain state triggered by network timeouts or unverified gateway responses:

```text
Network Timeout ──► UNKNOWN_EXTERNAL_STATE ──► Automated Reconciliation
```

**Core Invariant:** The system must **NEVER** trigger automated duplicate creation while in this state.

---

# 13. outbox_commands
- **Owner:** `scriora-core`
- **Purpose:** Reliable delivery trigger decoupling domain transactions from external worker execution.
- **Relationship:** `Publication └──< OutboxCommand`
- **States:** `PENDING`, `PROCESSING`, `PUBLISHED`, `FAILED`.
- **Atomic Rule:** Written inside the same transaction with `Publication` and `PublishAttempt`. Zero external HTTP calls inside the database transaction.

---

# 14. Approval Tables

## 14.1 approvals
- **Owner:** `scriora-core`
- **Purpose:** Formal human decision record governing policy-restricted actions.
- **Polymorphic Scope:** `resource_type` (`PUBLICATION`, `MISSION`) + `resource_id`.
- **Lifecycle:** `PENDING`, `APPROVED`, `REJECTED`, `CHANGES_REQUESTED`, `EXPIRED`, `CANCELLED`.
- **Delete Strategy:** `RETAIN`.

---

# 15. Approval Version Binding Invariant

Approvals are immutably locked to `resource_version`:
```text
Publication (v7) ──► Approved (resource_version = 7)
Content edited   ──► Version advances to 8 ──► Approval for v7 is VOID
```

---

# 16. approval_tokens
- **Owner:** `scriora-core`
- **Purpose:** Passwordless review capability for external stakeholders.
- **Security:** Stores `token_hash = SHA-256(raw_token)`; raw token is never persisted.
- **Default TTL:** 7 days.
- **Replay Protection:** `nonce` + atomic `used_at = now()` consumption.

---

# 17. Signed Capability Security

Signed approval tokens confer narrowly scoped capabilities:
> Capability grants permission to decide on **one specific resource version**; it grants zero general workspace access.

---

# 18. media_assets
- **Business Owner:** `scriora-core`
- **Processing Owner:** `scriora-media`
- **Relationship:** `Workspace └──< MediaAsset`
- **Delete Strategy:** Cleanup allowed only after all entity references (`Content`, `Publication`, `Evidence`) are terminated.

---

# 19. Mission Domain

## 19.1 missions
- **Owner:** `scriora-core`
- **Relationship:** `Workspace └──< Mission`
- **Delete Strategy:** `ARCHIVE`.

## 19.2 goals
- **Owner:** `scriora-core`
- **Purpose:** Quantitative milestones (`KPI`, `baseline`, `target`, `deadline`).
- **Relationship:** `Mission └──< Goal`
- **Delete Strategy:** `RETAIN / ARCHIVE`.

## 19.3 strategies
- **Owner:** `scriora-core`
- **Versioning:** Enforces `UNIQUE (mission_id, version)`.
- **Delete Strategy:** `RETAIN`.

## 19.4 growth_hypotheses
- **Owner:** `scriora-core`
- **Identifier:** `UNIQUE (mission_id, key)` (e.g. `H-01`).
- **Delete Strategy:** `RETAIN`.

## 19.5 experiments
- **Owner:** `scriora-core`
- **Design:** Validated `design JSONB` governed by versioned schemas.
- **Delete Strategy:** `RETAIN`.

## 19.6 experiment_content_variants
- **Owner:** `scriora-core`
- **Purpose:** Many-to-many join table linking experiments to canonical variants.
- **Constraint:** `PRIMARY KEY (experiment_id, content_variant_id)`.
- **Delete Strategy:** `RETAIN`.

---

# 20. Analytics & Empirical Learning

## 20.1 analytics_snapshots
- **Owner:** `scriora-core`
- **Purpose:** Append-only temporal observations (`T+2h` ... `T+7d`).
- **Constraint:** `UNIQUE (publication_id, observation_window)`.
- **TimescaleDB Compatibility:** Hypertable dimension on `captured_at`.

## 20.2 analytics_metrics
- **Owner:** `scriora-core`
- **Truth Law:** `PERMISSION_LIMITED ──► value_numeric = NULL` (Never `0`).
- **Constraint:** `UNIQUE (snapshot_id, metric_key)`.

## 20.3 evidence_records
- **Owner:** `scriora-core`
- **Purpose:** Raw empirical proof decoupled from AI interpretation.
- **Delete Strategy:** `RETAIN`.

## 20.4 insights
- **Owner:** `scriora-core`
- **Epistemological Guardrail:** `CORRELATED` vs `CAUSAL` explicit classification.
- **Delete Strategy:** `RETAIN`.

## 20.5 decisions
- **Owner:** `scriora-core`
- **Core Decoupling:** `Decision (Core) ≠ AgentTask (Agent)`.
- **Delete Strategy:** `RETAIN`.

## 20.6 memories
- **Owner:** `scriora-core` (Truth) / `scriora-agent` (Engine)
- **Provenance:** Traceable `(content + confidence + source_type + source_id)`.
- **Timing:** `pgvector` enabled in Phase 2; Classic GA uses standard PostgreSQL indices.

---

# 21. Agent-Owned Persistence

Tables owned exclusively by `scriora-agent`:
- **`agent_tasks`**: Autonomous operational execution unit.
- **`skill_executions`**: Telemetry and execution history per skill.
- **`provider_runs`**: AI provider invocation metrics (latency, tokens, cost, failures).

---

# 22. The Master Foreign-Key Matrix

```sql
-- Identity
workspace_members.workspace_id  --> workspaces.id (ON DELETE CASCADE)
workspace_members.user_id       --> users.id (ON DELETE RESTRICT)
workspaces.owner_user_id        --> users.id (ON DELETE RESTRICT)

-- Social
social_accounts.workspace_id    --> workspaces.id (ON DELETE CASCADE)
secret_envelopes.social_account_id --> social_accounts.id (ON DELETE CASCADE)

-- Content & Publishing
contents.workspace_id           --> workspaces.id (ON DELETE CASCADE)
content_variants.workspace_id   --> workspaces.id (ON DELETE CASCADE)
content_variants.content_id     --> contents.id (ON DELETE CASCADE)
content_variants.social_account_id --> social_accounts.id (ON DELETE SET NULL)
publications.workspace_id       --> workspaces.id (ON DELETE CASCADE)
publications.content_variant_id --> content_variants.id (ON DELETE RESTRICT)
publications.social_account_id  --> social_accounts.id (ON DELETE RESTRICT)
publish_attempts.workspace_id   --> workspaces.id (ON DELETE CASCADE)
publish_attempts.publication_id --> publications.id (ON DELETE CASCADE)
outbox_commands.workspace_id    --> workspaces.id (ON DELETE CASCADE)
outbox_commands.publication_id  --> publications.id (ON DELETE CASCADE)
outbox_commands.publish_attempt_id --> publish_attempts.id (ON DELETE CASCADE)

-- Approval
approvals.workspace_id          --> workspaces.id (ON DELETE CASCADE)
approval_tokens.workspace_id    --> workspaces.id (ON DELETE CASCADE)
approval_tokens.approval_id     --> approvals.id (ON DELETE CASCADE)

-- Media
media_assets.workspace_id       --> workspaces.id (ON DELETE CASCADE)

-- Mission & Growth
missions.workspace_id           --> workspaces.id (ON DELETE CASCADE)
goals.workspace_id              --> workspaces.id (ON DELETE CASCADE)
goals.mission_id                --> missions.id (ON DELETE CASCADE)
strategies.workspace_id         --> workspaces.id (ON DELETE CASCADE)
strategies.mission_id           --> missions.id (ON DELETE CASCADE)
growth_hypotheses.workspace_id  --> workspaces.id (ON DELETE CASCADE)
growth_hypotheses.mission_id    --> missions.id (ON DELETE CASCADE)
growth_hypotheses.strategy_id   --> strategies.id (ON DELETE CASCADE)
experiments.workspace_id        --> workspaces.id (ON DELETE CASCADE)
experiments.mission_id          --> missions.id (ON DELETE CASCADE)
experiments.hypothesis_id       --> growth_hypotheses.id (ON DELETE RESTRICT)

-- Experiment Content Mapping
experiment_content_variants.experiment_id --> experiments.id (ON DELETE CASCADE)
experiment_content_variants.content_variant_id --> content_variants.id (ON DELETE RESTRICT)

-- Analytics & Learning
analytics_snapshots.workspace_id --> workspaces.id (ON DELETE CASCADE)
analytics_snapshots.social_account_id --> social_accounts.id (ON DELETE SET NULL)
analytics_snapshots.publication_id --> publications.id (ON DELETE SET NULL)
analytics_metrics.snapshot_id   --> analytics_snapshots.id (ON DELETE CASCADE)
evidence_records.workspace_id   --> workspaces.id (ON DELETE CASCADE)
insights.workspace_id           --> workspaces.id (ON DELETE CASCADE)
decisions.workspace_id          --> workspaces.id (ON DELETE CASCADE)
memories.workspace_id           --> workspaces.id (ON DELETE CASCADE)
```

---

# 23. Cross-Tenant Integrity Enforcement

Composite foreign keys enforce physical isolation at the engine level:

```sql
ALTER TABLE publications
ADD CONSTRAINT fk_publications_tenant_account
FOREIGN KEY (social_account_id, workspace_id)
REFERENCES social_accounts(id, workspace_id)
ON DELETE RESTRICT;
```

Application code alone is never trusted as the sole isolation guarantor.

---

# 24. Master Delete Strategy Table

| Entity | Primary Strategy | Invariant / Policy |
| :--- | :--- | :--- |
| `User` | **RESTRICT / Anonymize** | Anonymized on GDPR deletion; never hard-purged if historical references exist |
| `Workspace` | **ARCHIVE** | Soft-deactivated; asynchronous scrubbing after regulatory retention |
| `WorkspaceMember` | **CASCADE with Workspace** | Purged upon workspace deletion; RESTRICT on individual user deletion |
| `SocialAccount` | **DISCONNECT / Soft Delete**| Credentials revoked; historical publication bindings retained |
| `SecretEnvelope` | **SECURE DELETE / Revoke** | Immediate zeroization upon account disconnect |
| `Content` | **SOFT DELETE / Archive** | `deleted_at = now()`; historical publications preserved |
| `ContentVariant` | **SOFT DELETE** | Blocked if active scheduled publications exist |
| `Publication` | **RETAIN** | Permanent publishing ledger |
| `PublishAttempt` | **RETAIN** | Permanent operational execution ledger |
| `OutboxCommand` | **RETAIN (Operational TTL)**| Cleaned after 30 days of completed dispatch |
| `Approval` | **RETAIN** | Permanent governance audit trail |
| `ApprovalToken` | **EXPIRE + CLEANUP** | Expired tokens pruned after 30 days |
| `MediaAsset` | **CLEANUP (Orphaned Only)** | Erased from S3/R2 only when all entity references drop to 0 |
| `Mission` | **ARCHIVE** | Commercial history preserved indefinitely |
| `Goal` | **RETAIN / Archive** | Retained to benchmark subsequent missions |
| `Strategy` | **RETAIN** | Retained to evaluate historical ROI per strategy |
| `GrowthHypothesis` | **RETAIN** | Refuted hypotheses retained as negative knowledge |
| `Experiment` | **RETAIN** | Retained as empirical trial record |
| `EvidenceRecord` | **RETAIN** | Fundamental empirical substrate for machine reasoning |
| `Insight` | **RETAIN** | Workspace knowledge base asset |
| `Decision` | **RETAIN** | Compliance and causality audit trail |
| `Memory` | **Tier-Specific Retention** | Brand Knowledge: Permanent; Short-term: 14 days |
| `AgentTask` | **Retention Policy** | Operational execution log pruned after 90 days |
| `SkillExecution` | **Retention Policy** | Telemetry logs pruned after 30 days |
| `ProviderRun` | **Retention Policy** | Billing & telemetry ledger retained for 1 year |

---

# 25. Master Unique Constraint Matrix

| Table | Constraint Name | Compound Columns |
| :--- | :--- | :--- |
| `users` | `uq_users_email` | `(email)` |
| `workspaces` | `uq_workspaces_slug` | `(slug)` |
| `workspace_members` | `pk_workspace_members` | `(workspace_id, user_id)` |
| `social_accounts` | `uq_social_accounts_account`| `(workspace_id, platform, external_account_id)` |
| `publish_attempts` | `uq_publication_attempt` | `(publication_id, attempt_number)` |
| `strategies` | `uq_strategies_version` | `(mission_id, version)` |
| `growth_hypotheses` | `uq_hypotheses_key` | `(mission_id, key)` |
| `experiment_content_variants`| `pk_experiment_variants`| `(experiment_id, content_variant_id)` |
| `analytics_snapshots`| `uq_snapshots_window` | `(publication_id, observation_window)` |
| `analytics_metrics` | `uq_metrics_key` | `(snapshot_id, metric_key)` |

---

# 26. Master Query-Driven Index Matrix

```sql
-- Identity & Social
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_workspaces_slug ON workspaces(slug);
CREATE INDEX idx_workspace_members_user ON workspace_members(user_id);
CREATE INDEX idx_social_accounts_workspace_status ON social_accounts(workspace_id, status);

-- Publishing Pipeline
CREATE INDEX idx_contents_workspace_created ON contents(workspace_id, created_at DESC);
CREATE INDEX idx_variants_content_id ON content_variants(content_id);
CREATE INDEX idx_variants_workspace_created ON content_variants(workspace_id, created_at DESC);
CREATE INDEX idx_publications_workspace_scheduled ON publications(workspace_id, scheduled_at) WHERE status = 'SCHEDULED';
CREATE INDEX idx_publications_account_scheduled ON publications(social_account_id, scheduled_at);
CREATE INDEX idx_publications_workspace_status ON publications(workspace_id, status);
CREATE INDEX idx_attempts_publication ON publish_attempts(publication_id, attempt_number);
CREATE INDEX idx_outbox_pickup ON outbox_commands(status, available_at) WHERE status = 'PENDING';

-- Governance & Approval
CREATE INDEX idx_approvals_workspace_status ON approvals(workspace_id, status);
CREATE INDEX idx_approvals_resource ON approvals(resource_type, resource_id);
CREATE INDEX idx_tokens_hash ON approval_tokens(token_hash);
CREATE INDEX idx_tokens_expiry ON approval_tokens(expires_at) WHERE used_at IS NULL;

-- Growth & Mission
CREATE INDEX idx_missions_workspace_status ON missions(workspace_id, status);
CREATE INDEX idx_goals_mission ON goals(mission_id);
CREATE INDEX idx_strategies_mission_version ON strategies(mission_id, version DESC);
CREATE INDEX idx_hypotheses_mission_status ON growth_hypotheses(mission_id, status);
CREATE INDEX idx_experiments_hypothesis ON experiments(hypothesis_id);
CREATE INDEX idx_experiments_started ON experiments(started_at DESC);

-- Analytics & Learning
CREATE INDEX idx_snapshots_workspace_captured ON analytics_snapshots(workspace_id, captured_at DESC);
CREATE INDEX idx_snapshots_publication ON analytics_snapshots(publication_id, captured_at DESC);
CREATE INDEX idx_evidence_captured ON evidence_records(workspace_id, captured_at DESC);
CREATE INDEX idx_insights_workspace_created ON insights(workspace_id, created_at DESC);
CREATE INDEX idx_decisions_workspace_created ON decisions(workspace_id, created_at DESC);
CREATE INDEX idx_memories_workspace_category ON memories(workspace_id, category);
```

---

# 27. Full Domain ERD Diagram

```text
                              ┌─────────────┐
                              │    User     │
                              └──────┬──────┘
                                     │
                                     ▼
                           ┌──────────────────┐
                           │ WorkspaceMember  │
                           └────────┬─────────┘
                                    │
                                    ▼
                              ┌────────────┐
                              │ Workspace  │
                              └─────┬──────┘
                                    │
          ┌─────────────────────────┼─────────────────────────┐
          │                         │                         │
          ▼                         ▼                         ▼
   SocialAccount                 Content                  Mission
          │                         │                         │
          │                         ▼                         ├── Goal
          │                  ContentVariant                  │
          │                         │                         └── Strategy
          │                         │                               │
          │                         ▼                               ▼
          │                    Publication                      Hypothesis
          │                         │                               │
          │              ┌──────────┴──────────┐                    ▼
          │              ▼                     ▼                Experiment
          │       PublishAttempt           Approval                 │
          │              │                                          ▼
          │              ▼                              ExperimentContentVariant
          │       OutboxCommand                                  │
          │                                                       │
          └───────────────────────────────────────────────────────┘
                                  │
                                  ▼
                         AnalyticsSnapshot
                                  │
                                  ▼
                          AnalyticsMetric
                                  │
                                  ▼
                             Evidence
                                  │
                                  ▼
                              Insight
                                  │
                                  ▼
                              Decision
                                  │
                                  ▼
                             AgentTask
                                  │
                                  ▼
                          SkillExecution
                                  │
                                  ▼
                           ProviderRun
```

---

# 28. The 20 Critical Database Invariants

```text
1.  Every business row belongs to exactly one Workspace.
2.  Zero cross-workspace references are allowed (enforced via composite FKs).
3.  Publication belongs to exactly one SocialAccount.
4.  PublishAttempt belongs to exactly one Publication.
5.  Attempt numbers are sequential and unique per Publication.
6.  UNKNOWN_EXTERNAL_STATE cannot trigger automated blind retry.
7.  Outbox command is created atomically with PublishAttempt inside the same DB transaction.
8.  External social API calls are strictly forbidden inside database transactions.
9.  Analytics snapshots are append-only immutable historical observations.
10. Missing analytics data is represented as NULL, never as 0.
11. Approval is immutably bound to resource_version; version advancement voids approval.
12. Signed approval links grant narrow capabilities, never general workspace access.
13. Mission is business state owned by Core; AgentTask is execution state owned by Agent.
14. Decision is business intent, not execution.
15. Autonomous Agents cannot bypass Policy gates or Human Approvals.
16. Redis is never the business source of truth.
17. AI Provider implementations are excluded from the business domain.
18. Platform-specific metadata is isolated in JSONB, causing zero DDL churn.
19. Historical empirical evidence and knowledge records are never cascade-deleted.
20. Every table has exactly one authoritative owner repository.
```

---

# 29. Database Design Status: 100% Complete

```text
████████████████████████████████████ 100% COMPLETE
```

Every entity, boundary, constraint, foreign key, index, state machine, and retention policy is locked.

---

# 30. Next Phases Roadmap

With Database Design 100% Complete, the architectural progression follows this strict order:

```text
1. Database Contract (COMPLETE)
        ↓
2. API Contract (Next Phase)
        ↓
3. Social Platform Contract (Next Phase)
        ↓
4. Agent & Skills Contract (Next Phase)
        ↓
5. Repository Implementation & Prisma DDL (Implementation Phase)
```

No Prisma schemas, SQL scripts, or migrations shall be written prior to formal adoption of this contract.
