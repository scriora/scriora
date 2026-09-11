# Scriora — Use Case Catalog v1

> **Status:** Canonical Functional Specification  
> **Purpose:** Defines the end-to-end functional use cases, repository distribution, data flows, security boundaries, and verification mapping across Scriora.  
> **Core Principle:** Features may span multiple repositories, but each repository owns a distinct, un-duplicated layer of responsibility.

---

# 1. Purpose & Guiding Principles

This document formalizes the canonical Use Cases of the Scriora platform and the exact responsibilities of each repository in fulfilling them.

The architectural rule:
> A single feature may span multiple repositories, but each repository owns a clearly defined portion. No single repository "owns" an entire end-to-end feature if the responsibility is inherently distributed.

---

# 2. How to Read This Catalog

For every Use Case, the following parameters are specified:
- **Actor:** The initiating entity (User, Agent, Worker, External Platform, API Client).
- **Trigger:** The event or action initiating the use case.
- **Main Flow:** The cross-repository directional call path.
- **Core Ownership:** What `scriora-core` owns and persists.
- **Supporting Repositories:** Roles of `social`, `media`, `worker`, `api`, `web`, `agent`, `mcp`.
- **External Systems:** Third-party APIs, OAuth providers, object storage.
- **Security:** Authentication, RBAC, tenant isolation, encryption.
- **Async Work:** Inngest durable workflows, outbox events, background processing.
- **Required Tests:** Test levels required to verify the invariant.

---

# 3. Authentication & Workspace

## UC-AUTH-01 — Register

**Actor:** User

```text
Web
 ↓
API
 ↓
Core
 ↓
PostgreSQL
```

### Ownership

| Layer | Repository | Responsibility |
| :--- | :--- | :--- |
| UI | `scriora-web` | Registration form, validation feedback, localized copy |
| HTTP | `scriora-api` | Request schema validation, rate limiting, error formatting |
| Domain | `scriora-core` | User entity creation, password hashing, workspace initialization |
| Database | `scriora-core` | Users, workspaces, and workspace_members tables |

### Security
- Password hashing using Argon2id
- Email verification token generation
- Cross-tenant isolation boundaries established
- Session cookie creation with `HttpOnly; Secure; SameSite=Lax`

### Tests
```text
Core: Unit + Integration + Security
API: Contract + Integration + Security
Web: E2E Playwright registration flow
```

---

## UC-AUTH-02 — Login

**Actor:** User

```text
Web
 ↓
API
 ↓
Authentication
 ↓
Core
```

Includes:
- Credentials verification / Social OAuth login
- Session and refresh token issuance
- Active workspace resolution
- Security context and RBAC permissions resolution

---

## UC-WORKSPACE-01 — Create Workspace

**Actor:** User

```text
Web
 ↓
API
 ↓
Core
 ↓
PostgreSQL
```

Supports workspace types defined in product specs:
- `PERSONAL`: Solopreneurs and individual creators.
- `WORK`: Standard corporate teams and SMBs.
- `CLIENT`: Marketing agencies managing dedicated client accounts.
- `AGENT`: Autonomous sandbox workspaces managed by AI Agents.

Maintains:
- `workspace_id`
- `owner_id`
- `members`
- `roles`
- `timezone`
- `brand_kit` references

---

## UC-WORKSPACE-02 — Manage Members

**Actor:** Workspace Admin / Owner

Includes:
- Inviting members via email
- Role assignment and transitions
- Member removal and revocation
- RBAC permission enforcement

Supported Roles:
- `OWNER`: Full billing, deletion, and administrative authority.
- `ADMIN`: Member management, social account connection, settings.
- `EDITOR`: Content creation, editing, and publishing (or approval submission).
- `VIEWER`: Read-only access to calendar, analytics, and content drafts.

`scriora-core` exclusively owns the authorization and role definitions.

---

# 4. Social Accounts & OAuth

## UC-SOCIAL-01 — Connect Social Account

**Actor:** Workspace Admin

```text
Web
 ↓
API
 ↓
Social
 ↓
Official Platform
```

### `scriora-social` owns
- OAuth 2.0 PKCE state generation and validation
- State tampering prevention and nonce checks
- Platform authorization URL generation
- Account discovery and capability detection

### `scriora-core` owns
- `SocialAccount` entity persistence
- Workspace multi-tenant association
- Account status lifecycle (`HEALTHY`, `TOKEN_EXPIRED`, `REVOKED`)
- Authorization checks ensuring the actor may connect accounts

### `scriora-worker`
Executes background recurring jobs:
- Token refresh orchestration
- Proactive account health checking
- Account status reconciliation

---

## UC-SOCIAL-02 — Discover Accounts

After successful OAuth callback:

```text
Social Adapter
 ↓
Account Discovery
 ↓
Normalized Account Entity
 ↓
Core Application Contract
```

`scriora-core` never interacts with vendor-specific account endpoints or formats.

---

## UC-SOCIAL-03 — Refresh Token

**Actor:** Worker Cron Job

```text
Worker
 ↓
Social
 ↓
Platform OAuth Endpoint
```

Then:
```text
Social Adapter
 ↓
Core Persistence Contract
```

No Agent involvement occurs in token refresh cycles.

---

## UC-SOCIAL-04 — Disconnect Account

**Actor:** Workspace Admin

```text
Web
 ↓
API
 ↓
Core
 ↓
Social Revoke / Disconnect
```

External revocation failure must be handled gracefully without blocking the local workspace decoupling and audit recording.

---

# 5. Content

## UC-CONTENT-01 — Create Draft

**Actor:** User or Agent

```text
Web / Agent Tool
 ↓
API
 ↓
Core
 ↓
PostgreSQL
```

Includes:
- Raw content body
- Media asset references
- Target social accounts
- Platform-specific options
- Status: `DRAFT`

---

## UC-CONTENT-02 — Edit Draft

**Actor:** User or Agent

```text
Web / Agent Tool
 ↓
API
 ↓
Core
```

No external social API calls are permitted during draft edits.

---

## UC-CONTENT-03 — Create Platform Variant

**Actor:** User or Agent

```text
Base Content
   ↓
├── LinkedIn Variant
├── Instagram Variant
├── X (Twitter) Variant
└── TikTok Variant
```

State is persisted in `scriora-core` under `content_variants`.

- If AI-assisted adaptation is selected:
  ```text
  Core Application Contract → Agent → Adaptation Skill → LLM Provider
  ```
- If deterministic adaptation is selected:
  ```text
  Core Application Contract → Deterministic Adaptation Skill
  ```

---

# 6. Media

## UC-MEDIA-01 — Upload Media

**Actor:** User

```text
Web
 ↓
API
 ↓
Media
 ↓
Object Storage (S3 / GCS / MinIO)
```

`scriora-core` retains the business reference to the media asset (`MediaAsset` entity).  
`scriora-media` owns:
- File ingestion and magic-byte MIME validation
- Dimension, bitrate, and duration metadata extraction
- Storage upload, presigned URL generation, and lifecycle cleanup

---

## UC-MEDIA-02 — Transform Media

**Actor:** Agent, API, or Worker

```text
Agent or API
 ↓
Media Contract
 ↓
Media Infrastructure
```

Supports mandatory golden aspect ratios:
- `1:1` (Square - Instagram/Facebook feeds)
- `4:5` (Portrait - Instagram post)
- `16:9` (Landscape - YouTube, LinkedIn, X)
- `9:16` (Vertical - TikTok, Reels, Shorts)

Operations include:
- Resize and smart crop
- WebP / AVIF compression
- Video transcoding via FFmpeg (H.264 / AAC)
- Animated thumbnail extraction

---

## UC-MEDIA-03 — Generate Image

**Actor:** Agent

```text
Agent
 ↓
ImageGenerationProvider
 ↓
Generated Raw Image
 ↓
Media Pipeline
 ↓
Validation / Transformation / Storage
```

- **`scriora-agent` owns:** Prompting, model selection, and provider API orchestration.
- **`scriora-media` owns:** Asset ingestion, format conversion, compression, and persistent storage.

---

## UC-MEDIA-04 — Generate Video

**Actor:** Agent

```text
Agent
 ↓
VideoGenerationProvider
 ↓
Generated Raw Video
 ↓
Media Pipeline
 ↓
Transcoding / Thumbnail / Storage
```

Video generation provider adapters remain strictly separated from media processing infrastructure.

---

# 7. Publishing

## UC-PUBLISH-01 — Publish Immediately

**Actor:** User, Agent, or Worker

```text
Web / API
 ↓
Core Transaction
   ├── Publication (PENDING)
   ├── PublishAttempt (RESERVED)
   └── OutboxEvent (PUBLICATION_DISPATCH)
 ↓
COMMIT
 ↓
Inngest Trigger
 ↓
Worker
 ↓
Social Adapter
 ↓
Official Platform API
```

This represents the primary business execution flow of the system.

---

## UC-PUBLISH-02 — Verify Publication

**Actor:** Worker

```text
Social Adapter
 ↓
Verification Check (Feed Probe)
 ↓
Worker
 ↓
Core State Update (SUCCEEDED)
```

If a platform API does not support post verification:
```text
verified = UNAVAILABLE / PERMISSION_LIMITED
```
A successful HTTP 200 return from a platform must never be treated as verified proof of publication without independent confirmation.

---

## UC-PUBLISH-03 — Handle Unknown External State

**Actor:** Worker

```text
Platform Request Dispatched
 ↓
Network Timeout / 504 Gateway Timeout
 ↓
State: UNKNOWN_EXTERNAL_STATE
```

**Automated blind republishing is strictly forbidden.**  
Resolution sequence:
```text
UNKNOWN_EXTERNAL_STATE
        ↓
Reconciliation Job
        ↓
Found on Platform Feed → SUCCEEDED
Not Provably Found → remain UNKNOWN → Escalate to Human Governance Gate
```

---

## UC-PUBLISH-04 — Retry Temporary Failure

**Actor:** Worker

Applies to transient errors:
- `429 Too Many Requests`
- Temporary `5xx` Server Errors
- Transient socket/network timeouts
- Temporary provider maintenance

Execution path:
```text
Failure Occurs
 ↓
Retry Policy Check (Max 5 attempts)
 ↓
Exponential Backoff + Jitter
 ↓
Worker Retries Execution
```

If retries are exhausted:
```text
FAILED_PERMANENT → Dead Letter Queue (DLQ) → Admin Notification
```

---

# 8. Scheduling

## UC-SCHEDULE-01 — Schedule Post

**Actor:** User or Agent

```text
Web / API
 ↓
Core Transaction
 ↓
Publication (SCHEDULED) + Outbox
 ↓
Inngest Workflow
 ↓
step.sleepUntil(scheduledAt)
```

Uses durable timer primitives (`step.sleepUntil()`).

---

## UC-SCHEDULE-02 — Calendar

**Actor:** User

```text
Web
 ↓
API
 ↓
Core Application
 ↓
Publications & Queues
```

Supports:
- Month, week, day, and list views
- Filtering by account, status, campaign, and tag
- Drag-and-drop rescheduling previews

---

## UC-SCHEDULE-03 — Reschedule

**Actor:** User or Agent

```text
Web / API
 ↓
Core
 ↓
Update Publication Entity
 ↓
Workflow Rescheduling Event
```

Enforces optimistic concurrency checks to eliminate race conditions between user edits and active worker execution.

---

## UC-SCHEDULE-04 — Bulk Scheduling

**Actor:** User or Agent

Supports:
- Multi-asset batch upload and ingestion
- Distribution across posting queues and time slots
- Evergreen queue rotation and repeating schedules

---

# 9. Approval

## UC-APPROVAL-01 — Request Approval

**Actor:** Contributor or Autonomous Agent

```text
Core
 ↓
Approval Entity Created (REQUIRES_APPROVAL)
 ↓
Notification Emitted to Approvers
```

If an Agent generates content under Policy L2 or L3:
```text
Agent Runtime → Tool: request_approval → Core State Locked
```

---

## UC-APPROVAL-02 — Approve

**Actor:** Workspace Approver / Admin

```text
User
 ↓
Web / Secure Approval Link
 ↓
API
 ↓
Core
 ↓
Publication Status → SCHEDULED or DISPATCHING
```

The worker proceeds with execution once approval is granted.

---

## UC-APPROVAL-03 — Reject / Request Changes

**Actor:** Workspace Approver / Admin

```text
User
 ↓
API
 ↓
Core
 ↓
Publication Status → REVISION_REQUIRED
```

Execution is blocked and feedback comments are recorded in the audit trail.

---

# 10. Analytics

## UC-ANALYTICS-01 — Collect Metrics

**Actor:** Worker Cron

```text
Worker Cron Trigger
 ↓
Social Adapter
 ↓
Platform Insights API
 ↓
Normalized Metrics Contract
 ↓
Core Persistence (TimescaleDB / Postgres)
```

---

## UC-ANALYTICS-02 — View Analytics

**Actor:** User

```text
Web
 ↓
API
 ↓
Core Analytics Service
 ↓
Aggregated Analytics Views
```

---

## UC-ANALYTICS-03 — Compare Performance

**Actor:** User or Agent

Supports cross-dimensional comparisons:
- Post vs. Post
- Platform vs. Platform
- Period vs. Period
- Variant vs. Variant
- Experiment vs. Control Cohort

---

# 11. Inbox & Webhooks

## UC-INBOX-01 — Receive Webhook

**Actor:** External Social Platform

```text
Platform Webhook Dispatch
 ↓
API Gateway (Signature Verification)
 ↓
Outbox Event
 ↓
Worker Processing
 ↓
Social Adapter Normalization
 ↓
Core Inbox Persistence
```

---

## UC-INBOX-02 — Display Inbox

**Actor:** User

```text
Web
 ↓
API
 ↓
Core Inbox Service
```

Presents unified conversations, comments, mentions, and direct messages across all connected channels.

---

## UC-INBOX-03 — Process Webhook Failure

**Actor:** Worker

Handles:
- Webhook signature validation failures (`401 Unauthorized`)
- Malformed payloads (`422 Unprocessable`)
- Duplicate webhook events (Idempotency deduplication)

All operations are idempotent, observable, and retryable where appropriate.

---

# 12. Goals

## UC-GOAL-01 — Create Measurable Goal

**Actor:** User or Agent

Defines a quantitative growth objective with:
- Key Performance Indicator (KPI, e.g. Link Clicks, Impressions, Followers)
- Baseline Metric
- Target Metric
- Deadline Timeframe

Example:
```text
KPI: Link Clicks
Baseline: 100 / month
Target: 500 / month
Deadline: 30 days
```

`scriora-core` owns the Goal domain entity.

---

# 13. Strategy

## UC-STRATEGY-01 — Define Strategy

**Actor:** User or Agent

```text
Goal Entity
 ↓
Formulate Strategy
```

Defines:
- Target Audience Persona
- Core Content Pillars
- Brand Voice and Tone Guidelines
- Channel Allocation
- Cadence and Distribution Rules

---

# 14. Experiments

## UC-EXPERIMENT-01 — Create Hypothesis

**Actor:** User or Agent

```text
Goal → Strategy → Formulate Hypothesis
```

Example:
```text
H-01: Contrarian technical opening hooks increase LinkedIn reposts by 25%.
```

---

## UC-EXPERIMENT-02 — Run Experiment

**Actor:** Agent and Worker

```text
Hypothesis
 ↓
Content Variants (A/B Test)
 ↓
Human Approval Gate
 ↓
Publishing Execution
 ↓
Collect Metric Snapshots
 ↓
Analyze Variance
```

---

## UC-EXPERIMENT-03 — Evaluate Experiment

**Actor:** Agent Analytics Skill

```text
Metrics Snapshots
 ↓
Evidence Aggregation
 ↓
Result Verification
 ↓
Synthesize Insight
```

Distinguishes correlation from causation; never claims causal attribution without statistically valid evidence.

---

# 15. Mission Mode

Autonomous execution loop connecting product goals to measurable growth:

```text
Mission
 ↓
Goal
 ↓
Strategy
 ↓
Hypothesis
 ↓
AI Generation
 ↓
Human Gate
 ↓
Publish
 ↓
Evidence
 ↓
Learning
```

---

## UC-MISSION-01 — Create Mission

**Actor:** User

```text
Web → API → Core
```

Specifies:
- Objective Goal
- Strategic Pillars
- Bound Hypotheses
- Autonomy Policy (L0 to L4)
- Channel Scope and Budget

---

## UC-MISSION-02 — Agent Generates Strategy

**Actor:** Agent

```text
Mission
 ↓
Agent Runtime
 ↓
Strategy Skill
 ↓
LLM Provider
 ↓
Structured Strategy Output
 ↓
Core Persistence
```

---

## UC-MISSION-03 — Agent Generates Content

**Actor:** Agent

```text
Mission
 ↓
Agent
 ↓
Content Generation Skill
 ↓
LLM Provider
 ↓
Structured Post Proposals
 ↓
Governance Policy Check
 ↓
Approval Queue
```

---

## UC-MISSION-04 — Agent Adapts Content

**Actor:** Agent

```text
Base Content Draft
 ↓
Adaptation Skill
 ↓
Platform Constraints Matrix
 ↓
Platform Variants Generated
```

Can be executed deterministically or via AI reasoning.

---

## UC-MISSION-05 — Agent Analyzes Results

**Actor:** Agent

```text
Metrics Ingestion
 ↓
Analytics Tool Call
 ↓
Analysis Skill
 ↓
Evidence Synthesis
 ↓
Insight Entity
```

---

## UC-MISSION-06 — Learning Loop

**Actor:** Agent

```text
Evidence
 ↓
Insight
 ↓
Workspace Memory
 ↓
Strategic Decision
 ↓
Next Best Action
```

---

## UC-MISSION-07 — Next Best Action (NBA)

**Actor:** Agent

Calculates next action score via canonical formula:

$$\text{NBA Score} = (\text{Impact} \times \text{Confidence}) - \text{Cost} - \text{Risk}$$

The resulting recommendation passes through:
```text
Policy Check → RBAC Validation → Human Approval Gate (if required)
```

---

# 16. Agent Commands / Tools

The Agent never calls Social Platform SDKs directly:

```text
Agent Runtime
 ↓
Tool: social.publish
 ↓
Core Application Contract
 ↓
Worker / Social Framework
```

Standard Tools:
- `social.publish`
- `social.schedule`
- `social.verify`
- `social.get_metrics`
- `content.create_draft`
- `content.adapt`
- `analytics.query`
- `analytics.compare`
- `media.generate`
- `media.transform`
- `workspace.get_context`
- `approval.request`

Every Tool declares:
- Input Schema
- Output Schema
- Required Permissions
- Side Effects
- Idempotency Guarantee
- Approval Requirement
- Error Model

---

# 17. Agent Memory

## UC-MEMORY-01 — Store Evidence

```text
Agent Execution → Synthesize Evidence → Store in Memory
```

Memory Types:
- `Working`: Ephemeral context during active task reasoning.
- `Brand`: Brand voice, guidelines, messaging pillars, anti-patterns.
- `Evidence`: Performance facts, CTR/conversion benchmarks, test outcomes.
- `Preferences`: User feedback, approval notes, manual override history.
- `Operational`: Task histories, run states, quota usages.

---

## UC-MEMORY-02 — Retrieve Context

```text
Mission / Task Trigger → Dynamic Context Assembly → Memory Retrieval → Sanitized Context → LLM Provider
```

OAuth tokens, client secrets, and sensitive credentials are mathematically isolated and strictly forbidden from entering LLM context.

---

# 18. Provider System

## UC-PROVIDER-01 — Select LLM Provider

```text
Agent Task → Provider Router → Routing Policy → Abstracted LLM Adapter
```

Evaluation criteria:
- Model capabilities (reasoning, structured JSON, tool use)
- Quality benchmarks
- Latency requirements
- Cost and quota availability
- Safety filters
- Workspace organizational policy

The router is observable and policy-constrained.

---

## UC-PROVIDER-02 — Generate Image

```text
Agent → Image Provider Contract → Provider Adapter → Raw Image Asset → Media Pipeline
```

---

## UC-PROVIDER-03 — Generate Video

```text
Agent → Video Provider Contract → Provider Adapter → Raw Video Asset → Media Pipeline
```

---

# 19. Model Context Protocol (MCP)

## UC-MCP-01 — External Agent Reads Data

```text
External Agent (Cursor, Claude, Windsurf)
 ↓
scriora-mcp
 ↓
MCP Tool: get_publications
 ↓
Application Service Contract
 ↓
scriora-core
```

---

## UC-MCP-02 — External Agent Publishes

```text
External Agent
 ↓
scriora-mcp
 ↓
MCP Tool: publish_post
 ↓
Permission Verification
 ↓
Human Approval Gate (if policy requires)
 ↓
Core Outbox
 ↓
Worker → Social
```

MCP server contains zero duplicated domain logic.

---

# 20. Developer API

## UC-API-01 — API Key Management

```text
Workspace Admin → API Key Management → Generate Key → Core Persistence
```

API Keys are:
- Cryptographically hashed (SHA-256) at rest
- Scoped to specific permissions
- Workspace and tenant isolated
- Instantly revocable
- Fully audited on every invocation

---

## UC-API-02 — Hosted Connect

Enables external software developers to onboard social accounts via a white-labeled hosted flow:

```text
Third-Party Developer Application
 ↓
Generates Hosted Connect Session URL
 ↓
End User Opens Hosted Connect
 ↓
Social OAuth Handshake (scriora-social)
 ↓
Encrypted Credentials Stored (scriora-core)
 ↓
Callback / Webhook Dispatched to Developer
```

---

# 21. Developer CLI

## UC-CLI-01 — Authenticate

```text
CLI (scriora login) → API → Authenticated Token Stored in Local Keychain
```

---

## UC-CLI-02 — Manage Content

```text
CLI (scriora post create) → REST API → Core Application Contract
```

---

## UC-CLI-03 — Publish / Schedule

CLI communicates solely with `scriora-api` public endpoints, preventing duplication of core business logic.

---

# 22. Managed Cloud

## UC-CLOUD-01 — Provision Tenant

```text
Cloud Control Plane → Public Tenant Contract → Database Schema & Infrastructure Provisioning
```

---

## UC-CLOUD-02 — Billing

```text
Cloud → Billing Provider (Stripe) → Webhook → Cloud Subscription State
```

Billing concerns exist strictly outside the open-source Core domain.

---

# 23. Backup & Disaster Recovery

Cloud manages:
- Automated point-in-time PostgreSQL backups
- Cross-region snapshotting
- Disaster recovery failover

---

# 24. Feature → Repository Matrix

| Feature | Core | Social | API | Web | Worker | Media | Agent | MCP | CLI | Cloud |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| Authentication | ✓ | | ✓ | ✓ | | | | | ✓ | |
| Workspace Management | ✓ | | ✓ | ✓ | | | | | ✓ | |
| Social Accounts | ✓ | ✓ | ✓ | ✓ | ✓ | | | | ✓ | |
| OAuth Handshake | | ✓ | ✓ | ✓ | ✓ | | | | | |
| Content Management | ✓ | | ✓ | ✓ | | ✓ | ✓ | ✓ | ✓ | |
| Platform Variants | ✓ | ✓ | ✓ | ✓ | | | ✓ | ✓ | | |
| Publishing | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | |
| Scheduling | ✓ | | ✓ | ✓ | ✓ | | ✓ | ✓ | ✓ | |
| Visual Calendar | ✓ | | ✓ | ✓ | | | | | | |
| Approvals | ✓ | | ✓ | ✓ | ✓ | | ✓ | ✓ | | |
| Media Processing | ✓ refs | | ✓ | ✓ | ✓ | ✓ | ✓ | | | |
| Image Generation | | | | | | ✓ processing | ✓ provider | ✓ | | |
| Video Generation | | | | | | ✓ processing | ✓ provider | ✓ | | |
| Analytics & Insights | ✓ | ✓ | ✓ | ✓ | ✓ | | ✓ | ✓ | ✓ | |
| Unified Inbox | ✓ | ✓ | ✓ | ✓ | ✓ | | ✓ | ✓ | | |
| Growth Goals | ✓ | | ✓ | ✓ | | | ✓ | ✓ | | |
| Strategy Formulation | ✓ | | ✓ | ✓ | | | ✓ | ✓ | | |
| Experimentation (A/B) | ✓ | | ✓ | ✓ | ✓ | | ✓ | ✓ | | |
| Autonomous Missions | ✓ | | ✓ | ✓ | ✓ | | ✓ | ✓ | ✓ | |
| Agent Memory | ✓ refs | | | | | | ✓ | | | |
| Agent Runtime | | | | | ✓* | | ✓ | | | |
| MCP Server | | contracts | ✓* | | | | contracts | ✓ | | |
| API Keys | ✓ | | ✓ | ✓ | | | | ✓ | ✓ | |
| Hosted Connect | ✓ | ✓ | ✓ | ✓ | ✓ | | | | | |
| Commercial Billing | | | | | | | | | | ✓ |
| Cloud Hosting | | | | | | | | | | ✓ |

*\* Integration or invocation contract, not logical ownership.*

---

# 25. Critical Invariants

- **INV-01:** No content may be published without verified tenant authorization and workspace context.
- **INV-02:** Autonomous Agents cannot bypass human approval policies or escalate privileges.
- **INV-03:** Web frontend applications are strictly prohibited from directly querying the database.
- **INV-04:** Autonomous Agents are strictly prohibited from invoking Social Platform SDKs directly.
- **INV-05:** HTTP 200 responses from external platforms must never be treated as verified publication success.
- **INV-06:** Operations resulting in `UNKNOWN_EXTERNAL_STATE` must never be automatically republished without reconciliation.
- **INV-07:** Social OAuth tokens and API secrets must never enter LLM prompts or context windows.
- **INV-08:** Every external side effect must enforce idempotency keys to prevent duplicate executions.
- **INV-09:** Social Platform capabilities must be certified via automated contract tests before being marked supported.
- **INV-10:** Every repository owns its boundaries and must never duplicate domain logic from another repository.

---

# 26. Test Mapping

Every critical business flow must map its verification across the appropriate architectural boundaries:

| Layer | Repository | Verification Responsibility |
| :--- | :--- | :--- |
| Domain / State | `scriora-core` | State transitions, outbox atomicity, RLS isolation, invariants |
| Adapters | `scriora-social` | Platform contracts, mock provider compliance, error mapping |
| Workflows | `scriora-worker` | Durability, backoff retry, timeout handling, DLQ recovery |
| HTTP Transport | `scriora-api` | OpenAPI validation, Zod request schemas, auth boundaries |
| Frontend UX | `scriora-web` | Component state, a11y, RTL layout, Playwright E2E |
| Complete Journey | End-to-End | Full lifecycle from UI/API through worker to platform verification |

---

# 27. Final Product Loop

Scriora unifies Classic Social Management and Autonomous Mission Mode into a singular cohesive feedback loop:

```text
Business Goal
      ↓
Strategy Formulation
      ↓
Content Plan
      ↓
Content Draft
      ↓
Platform Adaptation
      ↓
Governance Approval
      ↓
Publication & Verification
      ↓
Metrics Ingestion
      ↓
Evidence Aggregation
      ↓
Insight Synthesis
      ↓
Learning Memory
      ↓
Next Best Action (NBA)
      ↓
Refined Strategy & Content
```
