# Scriora — Repository Contract Architecture

> **Status:** Canonical Architectural Specification (Contract Architecture 100% Complete)  
> **Core Principle:** Repository boundary is a contract boundary.  
> **Scope:** Defines the complete communication contracts, interface boundaries, and runtime protocols across all 11 repositories.

---

# 1. Purpose & Scope

This document formalizes the communication contracts governing all 11 repositories in the Scriora platform.

### Core Architectural Principle
> **Repository boundary is a contract boundary.**

Physical repository separation does not mandate running 11 independent microservices in every environment. In self-hosted and single-node deployments, multiple repositories may be co-located or packaged into a unified runtime, provided that **logical boundaries, interface contracts, and isolation invariants remain strictly intact**.

---

# 2. The 11 Repositories

```text
1.  scriora-core    (Domain Model + Business Rules + Application Contracts + PostgreSQL)
2.  scriora-social  (Social Platform Adapters + Capabilities + OAuth + Webhooks)
3.  scriora-api     (HTTP / REST / OpenAPI Gateway + Authentication Boundary)
4.  scriora-web     (Next.js Web Application + User Interface)
5.  scriora-worker  (Inngest Durable Workflows + Background Dispatching + Outbox Orchestrator)
6.  scriora-media   (FFmpeg Media Processing + Transcoding + Storage Infrastructure)
7.  scriora-agent   (Cognitive Runtime + Skills + Tools + Policies + Multi-Provider AI)
8.  scriora-mcp     (Model Context Protocol Gateway for External Agents)
9.  scriora-cli     (Terminal Automation & Developer CLI Client)
10. scriora-docs    (Public Documentation & Interactive API Guides)
11. scriora-cloud   (Commercial Multi-Tenant Orchestration & Managed Layer)
```

---

# 3. Contract Taxonomy

Inter-repository interactions are strictly classified into five distinct contract categories:

```text
1. Domain Contracts      ──► Canonical entities & business invariants (Owned by scriora-core)
2. Application Contracts ──► Use-case commands & query operations (Owned by scriora-core)
3. Platform Contracts    ──► Social network capabilities & protocols (Owned by scriora-social)
4. Transport Contracts   ──► Wire protocols & public APIs (REST, OpenAPI, MCP, Webhooks)
5. Execution Contracts   ──► Workflows (Worker) & Cognitive Tasks/Skills (Agent)
```

---

# 4. Application Contracts

Application Contracts define executable business operations:

```text
- CreateContent
- CreatePublication
- SchedulePublication
- ApproveResource
- CreateMission
- CreateExperiment
- RecordEvidence
- CreateInsight
- CreateDecision
```

**Owner:** `scriora-core`  
`scriora-core` enforces all business invariants and state transitions, while delegating external network execution to specialized downstream repositories.

---

# 5. Platform Contracts

Platform Contracts define capabilities and protocols for interacting with external social networks:

```text
- OAuth 2.0 PKCE Handshake & Token Refresh
- Account Discovery & Capability Introspection
- Publishing & Asynchronous Verification
- Longitudinal Analytics Ingestion
- Webhook Ingestion & Signature Verification
- Rate Limit Quotas & Backoff Policies
- Media Format & Transcoding Constraints
- Canonical Error Classification
```

**Owner:** `scriora-social`

---

# 6. Transport Contracts

Transport Contracts define serialization and network transport protocols:

```text
REST / OpenAPI 3.0  ──► scriora-api
Model Context Protocol (MCP) ──► scriora-mcp
CLI HTTP Interface  ──► scriora-api
Platform Webhooks   ──► scriora-api (Ingress) / scriora-social (Adapter)
```

---

# 7. Execution Contracts

Execution Contracts govern durable and cognitive task lifecycles:

```text
Durable Workflows & Sagas ──► scriora-worker
Cognitive Tasks & Skills  ──► scriora-agent
Provider AI Routing       ──► scriora-agent
External Reconciliation   ──► scriora-worker
```

---

# 8. Final Dependency Direction Graph

```text
                         ┌─────────────────┐
                         │ scriora-cloud   │
                         └────────┬────────┘
                                  │
                                  ▼
┌────────────┐             ┌───────────────┐
│ scriora-web│────────────►│ scriora-api   │
└────────────┘             └───────┬───────┘
                                   │
                    ┌──────────────┼──────────────┐
                    ▼              ▼              ▼
             ┌───────────┐ ┌────────────┐ ┌────────────┐
             │   core    │ │   social   │ │   media    │
             └───────────┘ └────────────┘ └────────────┘
                    ▲              ▲              ▲
                    │              │              │
             ┌──────┴──────┐       │              │
             │   worker    │───────┘              │
             └─────────────┘                      │
                    ▲                             │
                    │                             │
             ┌──────┴──────┐                      │
             │    agent    │──────────────────────┘
             └──────┬──────┘
                    ▲
                    │
             ┌──────┴──────┐
             │     mcp     │
             └─────────────┘

             cli ───────────────► api
             docs ──────────────► public contracts
```

---

# 9. Forbidden Dependencies (Architectural Taboos)

The following architectural directions are strictly prohibited. Violating these rules triggers immediate CI build failure:

```text
core   ──► web             FORBIDDEN (Core has zero knowledge of presentation)
core   ──► api             FORBIDDEN (Core has zero knowledge of HTTP transport)
core   ──► social          FORBIDDEN (Core must never import social platform SDKs)
core   ──► agent           FORBIDDEN (Core must never import AI runtime logic)
core   ──► cloud           FORBIDDEN (Core is commercial-layer agnostic)

social ──► core            FORBIDDEN (Social framework depends only on contracts)
social ──► web             FORBIDDEN (Social framework has no UI dependencies)
social ──► agent           FORBIDDEN (Social framework contains no AI logic)

media  ──► agent           FORBIDDEN (Media pipeline contains no AI logic)
media  ──► web             FORBIDDEN (Media infrastructure has no UI dependencies)

agent  ──► social SDK      FORBIDDEN (Agent calls social actions exclusively via tools)
agent  ──► direct DB       FORBIDDEN (Agent accesses state via Core application contracts)
agent  ──► API transport   FORBIDDEN (Agent is framework-agnostic)

mcp    ──► social SDK      FORBIDDEN (MCP translates to Application Contracts only)
mcp    ──► database        FORBIDDEN (MCP has zero direct database connections)

web    ──► database        FORBIDDEN (Web communicates exclusively via API layer)
web    ──► social SDK      FORBIDDEN (Web never communicates directly with platforms)

docs   ──► runtime         FORBIDDEN (Docs consume public specs, never runtime state)
```

---

# 10. `scriora-core` Contract

## Responsibilities Owned
- Domain Entities & Business Rules
- Authoritative PostgreSQL Database Schema & Migrations
- Row-Level Security (RLS) & Multi-Tenant Isolation
- Transactional Outbox & Publishing Ledger
- Human Governance & Approval State
- Autonomous Mission & Growth Domain
- Longitudinal Analytics Persistence
- Empirical Evidence, Insights, and Decisions
- Business Knowledge Memory

## Exposed Interfaces
- Typed Domain Contracts & Entities
- Command & Query Application Contracts
- Domain Events Catalog
- Canonical Business Exceptions & Errors

## Explicitly Hidden (Zero Leakage)
- Internal SQL Queries & DDL Details
- Decrypted Tokens & API Secrets
- Social Platform SDK Objects
- AI Vendor SDK Instances
- Agent Internal Telemetry & Reasoning Chains

---

# 11. Core ↔ Social Boundary Separation

`scriora-core` has zero direct runtime dependencies on `scriora-social`.

```text
Core Database Transaction
  ├── Create Publication
  ├── Create PublishAttempt(RESERVED)
  └── Insert OutboxCommand(PENDING)
         ↓
Worker processes OutboxCommand
         ↓
Worker invokes scriora-social Platform Adapter
```

`scriora-core` remains completely agnostic to LinkedIn, Meta, X, TikTok, or YouTube SDKs.

---

# 12. `scriora-social` Contract

## Provided Capabilities
- `PlatformRegistry` & `CapabilityRegistry`
- OAuth 2.0 PKCE Handshake & Automated Token Refresh
- Remote Account Discovery & Metadata Synchronization
- Content Publishing & Native Post ID Extraction
- Asynchronous Post Verification & Live URL Resolution
- Performance Metrics Ingestion & Normalization
- Webhook Ingress & Cryptographic Signature Validation
- Rate-Limit Tracking & Exponential Backoff Recommendation
- Media Transcoding Constraints (Aspect ratio, bitrates, containers)
- Normalized Platform Error Translation

## Standardized Neutral Contract
- **Input:** Platform-neutral `PublishRequest` (account ID, normalized text, media descriptors, idempotency token).
- **Output:** Standardized `PublishResult` (external post ID, canonical URL, verification timestamp, normalized error).

---

# 13. Social Capability Introspection Contract

Platforms differ widely in supported formats. Every adapter must declare its capabilities via dynamic flags:

```typescript
interface PlatformCapabilities {
  supports_text: boolean;
  supports_image: boolean;
  supports_video: boolean;
  supports_carousel: boolean;
  supports_threads: boolean;
  supports_scheduling: boolean;
  supports_comments: boolean;
  supports_metrics: boolean;
  supports_webhooks: boolean;
}
```

Pre-flight validation queries capabilities before dispatch. Unsupported features fail deterministically without network requests.

---

# 14. Normalized Social Error Contract

External SDK and HTTP errors are translated into canonical Scriora categories:

```text
- VALIDATION                (Payload violates platform constraints)
- AUTHENTICATION            (Token expired or revoked)
- AUTHORIZATION             (Account lacks permission for action)
- RATE_LIMITED              (HTTP 429 - Backoff advised)
- EXTERNAL                  (Remote platform internal failure)
- TIMEOUT                   (Network socket or gateway timeout)
- UNAVAILABLE               (Platform scheduled maintenance)
- UNKNOWN_EXTERNAL_STATE    (Unverified dispatch status)
```

Each normalized error provides: `retryable: boolean`, `retry_after: Date | null`, `platform_code: string`, `operation_id: string`, and `request_id: string`.

---

# 15. Social Platform 6-Stage Certification Lifecycle

No social network adapter enters production without completing the 6-stage certification lifecycle:

```text
UNKNOWN
   ↓
MOCKED                  ──► Unit tests against synthetic responses
   ↓
CONTRACT_VERIFIED       ──► Validated against canonical schema contracts
   ↓
INTEGRATION_VERIFIED    ──► End-to-end sandbox execution with mock servers
   ↓
REAL_API_VERIFIED       ──► Live execution against developer test applications
   ↓
CERTIFIED               ──► Certified for production multi-tenant deployment
```

---

# 16. `scriora-api` Contract

## Responsibilities Owned
- HTTP Transport, REST Routing, and OpenAPI 3.0 Generation
- Authentication Gateway (JWT, Session cookies, API keys)
- Workspace Authorization & RBAC Enforcement
- Request Payload Validation (Zod Schemas)
- Pagination, Sorting, and Filter Handling
- Rate Limiting & Abuse Prevention
- HTTP Error Mapping
- Public Webhook Endpoints
- API Versioning Strategy

## Explicitly Excluded
- Business Domain Logic
- Direct Database Queries or DDL Management
- Social Platform SDKs
- Agent Cognitive Runtime
- Media Transcoding

---

# 17. API ↔ Core Communication Protocol

Every API endpoint delegates immediately to a Core Application Contract:

```text
Client HTTP Request
       ↓
API Validation (Zod)
       ↓
API Authentication & Workspace Verification
       ↓
Invoke Core Application Contract (e.g. CreatePublicationCommand)
       ↓
Core Domain Processing & Database Transaction
       ↓
Core Application Result
       ↓
API Maps to HTTP 200/201/400/403/422/500 JSON Response
```

---

# 18. Canonical API Error Mapping

- Core `VALIDATION` ──► HTTP `422 Unprocessable Entity`
- Core `AUTHENTICATION` ──► HTTP `401 Unauthorized`
- Core `AUTHORIZATION` ──► HTTP `403 Forbidden`
- Core `RESOURCE_NOT_FOUND` ──► HTTP `404 Not Found`
- Core `RATE_LIMITED` ──► HTTP `429 Too Many Requests` (includes `Retry-After` header)
- Core `BUSINESS_CONFLICT` ──► HTTP `409 Conflict`
- Remote errors never collapse into a generic `500 Internal Server Error`.

---

# 19. REST API Versioning Policy

Public API paths follow `/api/v1/...`.  
- Backward-compatible additions occur within `v1`.
- Breaking changes strictly mandate a new version (`/api/v2/...`) or an explicit compatibility translation layer.

---

# 20. `scriora-web` Contract

`scriora-web` communicates exclusively with `scriora-api`:

```text
Web Application (Next.js) ──► REST / OpenAPI ──► scriora-api
```

Direct database connections, direct Core imports, or direct social API calls from `scriora-web` are strictly prohibited.

---

# 21. Web Data & Authorization Boundary

The web frontend requests operations; it never decides authorization:
> The web client cannot assert: *"User is allowed to publish"*. It submits `POST /api/v1/publications`, and the API + Core + RLS pipeline enforces authorization.

---

# 22. `scriora-worker` Contract

`scriora-worker` is the durable execution coordinator:
- Outbox Queue Polling (`FOR UPDATE SKIP LOCKED`)
- Inngest Durable Workflow Step Execution
- Non-blocking delays (`step.sleepUntil()`)
- Retry Management with Exponential Backoff & Jitter
- Asynchronous Verification & External State Reconciliation

`scriora-worker` owns zero domain state; it mutates database records exclusively via Core contracts.

---

# 23. End-to-End Publishing Pipeline

```text
Web / API / MCP / Agent
          ↓
CreatePublicationCommand
          ↓
scriora-core (Transaction: Publication + PublishAttempt + OutboxCommand)
          ↓
COMMIT TRANSACTION
          ↓
scriora-worker (Claims OutboxCommand)
          ↓
Invokes scriora-social Platform Adapter
          ↓
External Social Platform API
          ↓
Verification Callback / Poller
          ↓
scriora-core (Updates PublishAttempt & Publication status)
```

---

# 24. Worker Retry & Backoff Contract

Retries are authorized strictly for transient, retryable failures:
- HTTP 429 (Rate Limited)
- Temporary 5xx Gateway / Server Failures
- Network Connection Resets / DNS Failures

Retries require **Exponential Backoff with Full Jitter** and a mandatory `idempotency_key`.  
**Zero Automated Retries:** Failures yielding `UNKNOWN_EXTERNAL_STATE` must never be automatically retried without prior reconciliation.

---

# 25. `scriora-media` Contract

## Provided Capabilities
- File Ingestion & Antivirus Scanning
- MIME Type Validation & Magic Byte Inspection
- Image Resizing, Cropping, and Optimization
- FFmpeg Video Transcoding & Compression
- Poster Frame & Thumbnail Extraction
- Cloud Storage Abstraction (S3 / Cloudflare R2 / Local FS)
- Orphaned Media Scrubbing & Cleanup

## Explicitly Excluded
- Image / Video Generation AI Logic
- Social Network Publishing
- Business Content Management

---

# 26. Agent ↔ Media Boundary Separation

```text
Image / Video Generation ──► Owned by scriora-agent (Provider Contracts)
Media Transcoding & Storage ──► Owned by scriora-media (FFmpeg & S3)
```

The agent invokes generation providers directly, then passes the resulting media buffer to `scriora-media` for validation, optimization, and persistent storage.

---

# 27. `scriora-agent` Contract

`scriora-agent` is an independent cognitive architecture framework:
- Cognitive Runtime & Autonomous Orchestration
- Strategic Planning & Goal Decomposition
- Skill Implementations (Deterministic & AI)
- Tool Declarations & Schema Validation
- Governance Policies & Safety Guardrails
- Semantic Memory Retrieval & Context Assembly
- Mission Execution & Evaluation
- Multi-Provider AI Routing (OpenAI, Anthropic, Gemini, Groq, Ollama)
- Execution State Persistence (`agent_tasks`, `skill_executions`, `provider_runs`)

---

# 28. Agent ↔ Core Interaction Boundary

The agent interacts with the business domain exclusively through Application Contracts:

```text
Agent ──► Application Contracts / Read Models / Commands ──► Core
```

Direct SQL queries or database table mutations by `scriora-agent` are strictly forbidden.

---

# 29. Agent ↔ Social Boundary Separation

The agent never interacts with social networks directly:

```text
❌ Disallowed: Agent ──► LinkedIn SDK / API
✔ Standard:   Agent ──► Tool ──► Social Contract ──► Worker ──► Platform Adapter
```

This prevents autonomous agents from bypassing workspace permissions, governance gates, approval policies, or audit logging.

---

# 30. Canonical Agent Tool Contract

Every tool exposed to the cognitive engine must provide a strict declarative manifest:

```typescript
interface CanonicalToolContract<TInput, TOutput> {
  name: string;
  description: string;
  input_schema: ZodSchema<TInput>;
  output_schema: ZodSchema<TOutput>;
  required_permissions: string[];
  has_side_effects: boolean;
  is_idempotent: boolean;
  requires_human_approval: boolean;
  error_behavior: 'FAIL_IMMEDIATELY' | 'RETRYABLE' | 'DEGRADE_GRACEFULLY';
}
```

---

# 31. Canonical Agent Skill Contract

A Skill is an operational workflow combining domain heuristics, deterministic validations, and AI prompts:

```typescript
interface CanonicalSkillManifest {
  name: string;
  version: string;
  category: 'DETERMINISTIC' | 'AI_REASONING';
  input_schema: ZodSchema;
  output_schema: ZodSchema;
  governance_policy: string;
  estimated_cost_usd: number;
  max_execution_seconds: number;
}
```

All AI skills enforce structured output parsing with deterministic fallback handling.

---

# 32. Multi-Provider AI Contract

AI vendors are encapsulated behind unified abstract provider interfaces:

```typescript
interface LLMProvider {
  chatComplete(request: ChatCompletionRequest): Promise<ChatCompletionResponse>;
}

interface ImageGenerationProvider {
  generateImage(request: ImageGenRequest): Promise<ImageGenResponse>;
}

interface VideoGenerationProvider {
  generateVideo(request: VideoGenRequest): Promise<VideoGenResponse>;
}
```

---

# 33. Intelligent Provider Routing Policy

The provider router dynamically selects model backends based on:
- Capability Match (Context window, tool calling support, vision)
- Quality & Reasoning Requirements
- Latency Constraints (Real-time chat vs batch drafting)
- Cost Budgets per Workspace
- High-Availability Fallbacks (e.g. Claude 3.5 Sonnet ──► GPT-4o ──► Gemini 1.5 Pro)

---

# 34. Structured Agent Execution Loop

Autonomous missions progress through disciplined cognitive stages:

```text
Mission ──► Task ──► Plan ──► Skill ──► Tool ──► Policy Gate ──► Approval ──► Execution ──► Evidence ──► Learning
```

The agent is never permitted to execute ungrounded, iterative tool calls without policy oversight.

---

# 35. `scriora-mcp` Contract

Model Context Protocol (MCP) serves as an external integration gateway:
- Exposes Scriora capabilities to external agent frameworks (Claude Desktop, Cursor, Custom Agents).
- Translates MCP tool requests into internal Scriora Application Contracts.
- Enforces strict workspace scoping and user token authentication.
- Does not contain independent domain logic or database connections.

---

# 36. Canonical MCP Tools

Standardized tools exposed via MCP:
- `create_post`: Drafts content across platforms.
- `tailor_content`: Adapts base copy to channel constraints.
- `split_panorama`: Slices panoramas into carousel slides via `scriora-media`.
- `get_schedule`: Reads calendar queues.
- `list_channels`: Lists connected accounts.
- `approve_draft`: Submits human approval for pending items.

---

# 37. MCP Security & Scoping

- Raw OAuth tokens and database credentials are never exposed via MCP.
- Every MCP call requires workspace authentication and is bounded by caller permissions.
- All actions undergo policy evaluation, human approval checks, and full audit logging.

---

# 38. `scriora-cli` Contract

`scriora-cli` is a terminal developer and CI automation client:
- Interacts exclusively with `scriora-api` over HTTPS.
- Consumes public OpenAPI contracts.
- Stores local configuration in secure OS keyrings.
- Contains zero direct database or Core library dependencies.

---

# 39. CLI Compatibility & Stability

The CLI relies solely on versioned REST endpoints (`/api/v1/...`). Internal refactoring of `scriora-core` does not break CLI functionality as long as public API contracts remain stable.

---

# 40. `scriora-docs` Contract

`scriora-docs` hosts public documentation, guides, and OpenAPI references:
- Automatically validated against OpenAPI schemas during CI.
- Validates all code samples, markdown syntax, and cross-references.
- Has zero runtime dependencies on any other repository.

---

# 41. `scriora-cloud` Contract

`scriora-cloud` manages commercial multi-tenant operations:
- Tenant Provisioning & Billing (Stripe)
- Managed Infrastructure, Backups, and Disaster Recovery
- Cloud IAM & Single Sign-On (SSO)
- Fleet Health Monitoring & Telemetry
- **Core Independence:** `scriora-core` contains zero cloud-specific or billing code.

---

# 42. Self-Hosted Independence Guarantee

Scriora is 100% functional in self-hosted and on-premise environments without `scriora-cloud`. The commercial cloud layer is an external management extension.

---

# 43. Contract Semantic Versioning

Public contracts adhere to Semantic Versioning (`MAJOR.MINOR.PATCH`):
- **PATCH:** Bug fixes, non-breaking performance optimizations.
- **MINOR:** Backward-compatible additions (new optional fields, new endpoints).
- **MAJOR:** Breaking changes (renamed fields, altered behavior, removed endpoints).

---

# 44. Formal Breaking Change Process

A breaking contract change must complete the formal 7-step governance lifecycle:

```text
Architectural Decision Record (ADR)
                 ↓
      Impact & Dependency Analysis
                 ↓
     Compatibility & Migration Plan
                 ↓
       Automated Contract Tests
                 ↓
       Database & API Migration
                 ↓
       Documentation Updates
                 ↓
          Versioned Release
```

---

# 45. Multi-Tier Contract Testing

Automated contract testing is enforced at every inter-repository boundary:

```text
Web     <─── Contract Tests ───> API
API     <─── Contract Tests ───> Core
Worker  <─── Contract Tests ───> Social
Worker  <─── Contract Tests ───> Media
Agent   <─── Contract Tests ───> Core
Agent   <─── Contract Tests ───> Social Tools
Agent   <─── Contract Tests ───> Media Tools
MCP     <─── Contract Tests ───> Public API
CLI     <─── Contract Tests ───> Public API
```

---

# 46. Provider / Consumer Ownership Invariant

> **The Provider repository owns the formal contract definition; the Consumer repository maintains compatibility validation tests.**

---

# 47. Mock & Simulation Strategy

Every inter-repository boundary maintains high-fidelity deterministic mocks:
- `Social Platform Mock`: Simulates successful publishing, rate limits, and network dropouts.
- `Media Processing Mock`: Simulates image resizing and FFmpeg transcoding.
- `AI Provider Mock`: Returns deterministic JSON responses for automated testing without LLM billing.

---

# 48. Canonical Idempotency Contract

Every mutating operation with external side-effects must specify:
- `idempotency_key: string`
- `fingerprint: char(64)` (SHA-256 payload hash)
- Execution scope (Workspace + Resource)
- Replay & Conflict Resolution Policy

Operations: Publishing, Scheduling, Approvals, Asset Generation, Webhook Ingestion.

---

# 49. Canonical Operation Result Contract

HTTP `200 OK` does not indicate business success. Operations return a standardized result envelope:

```typescript
interface OperationResult<T> {
  operation_id: string;
  status: CanonicalOperationStatus;
  result?: T;
  error?: NormalizedError;
  timestamp: string;
}
```

Status lifecycle: `ACCEPTED`, `PENDING`, `PROCESSING`, `SUCCEEDED`, `FAILED_RETRYABLE`, `FAILED_PERMANENT`, `UNKNOWN_EXTERNAL_STATE`, `CANCELLED`, `REQUIRES_APPROVAL`.

---

# 50. Asynchronous Task Contract

Long-running operations (video transcoding, scheduled publication, mission execution) follow the asynchronous handshake:
1. Operation accepted immediately with HTTP `202 Accepted` + `operation_id`.
2. Asynchronous processing managed by `scriora-worker`.
3. Status queries and webhook notifications reference `operation_id`.

---

# 51. Domain Event Contract

Domain events emitted by `scriora-core` enforce strict structure:

```typescript
interface DomainEvent<TPayload> {
  event_id: string;
  event_name: string; // e.g. "publication.succeeded"
  workspace_id: string;
  timestamp: string;
  payload: TPayload;
  correlation_id: string;
}
```

Events are immutable, versioned, and idempotently consumable.

---

# 52. Webhook Ingestion & Normalization Contract

Platform webhooks enter through an isolated ingestion pipeline:

```text
External Platform (LinkedIn, X, Meta)
                 ↓
scriora-api Public Webhook Receiver (Raw Buffer)
                 ↓
scriora-social Adapter (HMAC Signature Verification & Payload Normalization)
                 ↓
Application Contract (Core Ingestion)
                 ↓
PostgreSQL Event Log / Outbox
```

---

# 53. Webhook Deduplication Invariant

All webhooks are deduplicated via composite tuple:

```text
(source_platform, external_event_id)
```

Duplicate webhook deliveries are acknowledged with HTTP `200` and discarded.

---

# 54. Zero-Trust Security & Secrets Boundary

- **Decrypted Tokens Shield:** Social OAuth tokens and API secrets are never transmitted to Web clients, Agent context, LLM prompts, MCP responses, logs, or message queues.
- Decryption occurs in memory strictly within `scriora-core`'s internal token service, immediately prior to dispatch by `scriora-social`.

---

# 55. Observability & Distributed Tracing Contract

Every inter-repository operation carries distributed tracing headers:
- `x-request-id`: Client HTTP request identifier.
- `x-operation-id`: Business operation identifier.
- `x-workspace-id`: Tenant context.
- `x-correlation-id`: Trace context propagated across queues, workers, and events.

Sensitive payloads and authentication tokens are automatically redacted from logs.

---

# 56. Master Inter-Repository Contract Matrix

| Consumer Repository | Provider Repository | Formal Contract Name | Transport Protocol |
| :--- | :--- | :--- | :--- |
| `scriora-web` | `scriora-api` | Public REST Contract | HTTPS / OpenAPI 3.0 |
| `scriora-api` | `scriora-core` | Core Application Contract | Internal Library / IPC |
| `scriora-api` | `scriora-social` | Social Capability Contract | Internal Library / IPC |
| `scriora-api` | `scriora-media` | Media Ingest Contract | Internal Library / IPC |
| `scriora-worker` | `scriora-core` | Outbox & Command Contract | Inngest / PostgreSQL |
| `scriora-worker` | `scriora-social` | Publishing & Verification Contract | Internal Library / HTTPS |
| `scriora-worker` | `scriora-media` | Media Transcoding Contract | Internal Library / CLI |
| `scriora-agent` | `scriora-core` | Application & Domain Read Contract | Internal Library / IPC |
| `scriora-agent` | `scriora-social` | Social Tool Action Contract | Canonical Tool Interface |
| `scriora-agent` | `scriora-media` | Media Processing Tool Contract | Canonical Tool Interface |
| `scriora-agent` | AI Providers | Multi-Provider AI Contract | HTTPS / Vendor SDK |
| `scriora-mcp` | `scriora-core` | Public Application Contract | stdio / SSE |
| `scriora-cli` | `scriora-api` | Public REST Contract | HTTPS / JSON |
| `scriora-docs` | `scriora-api` | Public Documentation Contract | OpenAPI 3.0 / Markdown |
| `scriora-cloud` | `scriora-core` | Tenant Provisioning Contract | Internal Library / gRPC |

---

# 57. Repository Responsibility Matrix (Owns vs Must Not Own)

| Repository | Strictly Owns | Must NOT Own |
| :--- | :--- | :--- |
| `scriora-core` | Business Domain, Database, RLS, Outbox | Social Platform SDKs, AI Runtime, Web UI |
| `scriora-social` | Platform Adapters, OAuth, Capabilities, Errors | Business Domain, Database Schemas, AI Logic |
| `scriora-api` | HTTP Gateway, Auth Boundary, OpenAPI | Business Rules, Database Migrations, Agent Runtime |
| `scriora-web` | User Interface, Frontend Presentation | Database Connections, Business Domain Invariants |
| `scriora-worker` | Durable Workflows, Outbox Execution, Sagas | Independent Domain Schemas, Direct UI |
| `scriora-media` | FFmpeg Processing, Transcoding, Storage | Asset Generation Intelligence, Social Publishing |
| `scriora-agent` | Agent Runtime, Skills, Tools, Multi-Provider AI | Social Platform SDKs, Direct SQL/Database Access |
| `scriora-mcp` | Model Context Protocol Adapter | Independent Business Engine, Direct Database Access |
| `scriora-cli` | Terminal Client, Automation CLI | Core Business Runtime, Direct Database Access |
| `scriora-docs` | Public Guides, API Reference Documentation | Runtime Logic, State Management |
| `scriora-cloud` | Commercial Layer, Managed Provisioning, Billing | Core Business Domain, Open Source Core Logic |

---

# 58. The 12-Question Pre-Feature Readiness Checklist

Before coding any new feature, these 12 architectural questions must be answered:
1. **Who owns the domain state?** (Which repository has write authority?)
2. **Who owns the contract definition?** (Where is the interface schema declared?)
3. **Who is the consumer?** (Which subsystem calls the operation?)
4. **Who is the provider?** (Which subsystem executes the operation?)
5. **Is the operation synchronous or asynchronous?** (HTTP 200 vs HTTP 202 + Job?)
6. **What is the idempotency key and scope?** (How are duplicate requests rejected?)
7. **Does the operation have external side effects?** (Social post, email, payment?)
8. **Does the operation require human approval?** (Is human gating policy triggered?)
9. **What is the normalized failure model?** (What are the retryable vs permanent errors?)
10. **How is the boundary contract tested?** (Are automated contract tests in place?)
11. **What is the semantic versioning impact?** (Is it patch, minor, or major breaking?)
12. **What is the security and tenant scope?** (How is `workspace_id` verified?)

> **Rule:** If any question cannot be answered unambiguously, **the feature is not ready for implementation**.

---

# 59. Contract Architecture Status: 100% Complete

```text
████████████████████████████████████ 100% COMPLETE
```

All 11 repository boundaries, 5 contract types, 17 inter-repository relationships, 14 forbidden dependencies, and communication protocols are formally frozen.

---

# 60. Final Architectural Decision

Scriora is not an ad-hoc collection of repositories exchanging arbitrary calls. It is organized around a clean, layered architectural model:

```text
                    INTERFACES
             ┌─────────┼─────────┐
             │         │         │
            WEB       CLI       MCP
             │         │         │
             └─────────┼─────────┘
                       API
                        │
                        ▼
                 APPLICATION
                   CONTRACTS
                        │
              ┌─────────┼─────────┐
              ▼         ▼         ▼
            CORE      SOCIAL     MEDIA
              ▲         ▲         ▲
              │         │         │
              └──── WORKER ──────┘
                        ▲
                        │
                      AGENT
                        │
                   PROVIDERS
```

### The Supreme Architectural Mandate:
> **Every repository is strictly isolated in its physical ownership, but the entire platform is unified by formal, immutable, typed contracts.**
