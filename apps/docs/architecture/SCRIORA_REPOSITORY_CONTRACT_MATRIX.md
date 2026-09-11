# Scriora — Repository Contract Matrix v1

> **Status:** Canonical Engineering Specification  
> **Purpose:** Formal architectural authority defining ownership, interfaces, dependency boundaries, and governance across all 11 repositories in Scriora.  
> **Core Principle:** Repository boundaries define ownership and contracts. They do not automatically dictate microservice runtime separation.

---

# 1. Repositories

| Repository | Visibility | Primary Responsibility | Runtime | DB Ownership | Release |
| :--- | :--- | :--- | :--- | :--- | :--- |
| scriora-core | Public | Business Domain + Application Layer + Persistence | Library | **نعم (Authoritative)** | npm package |
| scriora-social | Public | Social Platform Framework + Adapters | Library | **لا** | npm package |
| scriora-api | Public | REST API + OpenAPI Gateway | Container + pkg | لا | Container + package |
| scriora-web | Public | Web Application (Next.js) | Container | لا | Container |
| scriora-worker | Public | Durable Workflows + Background Execution | Container | لا* | Container |
| scriora-media | Public | Media Processing Infrastructure | Library initially | لا | npm package |
| scriora-agent | Public | Agent Framework + Skills + Providers | Library / Service | لا (State metadata only) | npm package / Container |
| scriora-mcp | Public | Model Context Protocol Interface | Optional | لا | npm package / container |
| scriora-cli | Public | Developer & Automation CLI | No | لا | npm package |
| scriora-docs | Public | Documentation & Interactive Guides | Static / site | لا | Static site |
| scriora-cloud | Private | Managed Cloud / Commercial Layer | Cloud Service | Cloud-owned | Private |

*\* scriora-worker reads and writes exclusively through Core application contracts and owns no independent domain schema.*

---

# 2. Ownership Matrix

| Responsibility | Core | Social | API | Web | Worker | Media | Agent | MCP | CLI | Docs | Cloud |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| Business Domain | ✓ | | | | | | | | | | |
| Database Business Schema | ✓ | | | | | | | | | | |
| RLS / Tenant Isolation | ✓ | | | | | | | | | | ✓* |
| Application Use Cases | ✓ | | | | | | | | | | |
| Social Platform Contracts | | ✓ | | | | | ✓* | | | | |
| OAuth Adapters | | ✓ | | | ✓ orchestration | | | | | | |
| Publishing Adapters | | ✓ | | | ✓ orchestration | | | | | | |
| Metrics Adapters | | ✓ | | | ✓ orchestration | | | | | | |
| Webhooks from Platforms | | ✓ | ✓ boundary | | ✓ processing | | | | | | |
| REST API | | | ✓ | | | | | | | | |
| Web UI | | | | ✓ | | | | | | | |
| Durable Workflows | | | | | ✓ | | | | | | |
| Media Processing | | | | | | ✓ | | | | | |
| Image Generation Providers | | | | | | | ✓ | | | | |
| Video Generation Providers | | | | | | | ✓ | | | | |
| LLM Providers | | | | | | | ✓ | | | | |
| Agent Runtime | | | | | | | ✓ | | | | |
| Skills | | | | | | | ✓ | | | | |
| Agent Memory | | | | | | | ✓ | | | | |
| Agent Policies | | | | | | | ✓ | | | | |
| MCP Protocol | | | | | | | | ✓ | | | |
| CLI | | | | | | | | | ✓ | | |
| Documentation | | | | | | | | | | ✓ | |
| Billing | | | | | | | | | | | ✓ |
| Cloud Provisioning | | | | | | | | | | | ✓ |

*\* Applying/consuming canonical contracts, not redefining domain logic.*

---

# 3. scriora-core

## Owns
- Domain Entities & Business Rules
- Application Use Cases & Services
- Authorization & Tenant Isolation Boundaries
- Row Level Security (RLS) policies
- PostgreSQL Business Database Schema & Migrations
- Outbox Queue & Atomicity
- Idempotency State & Deduplication
- State Machines (Publication, Approval, Operations)
- Structured Immutable Audit Events
- Canonical Business Contracts

## Does NOT own
- Next.js / Frontend Frameworks
- REST HTTP Routing / Fastify
- Social Platform SDKs & Adapters
- FFmpeg & Audio/Video Processing
- LLM Providers & Vendor SDKs
- Agent Runtime & Cognitive Orchestration
- Model Context Protocol (MCP) Transport
- Developer CLI Commands
- Cloud Billing & Provisioning

---

# 4. scriora-social

## Owns
- Social Platform Framework & Registry
- Unified Capability Model (capabilities(platform))
- OAuth 2.0 PKCE Handshakes & Token State
- Account Discovery & Health Probing
- Platform Publishing Adapters (Text, Image, Video, Carousel, Reels)
- Platform Verification & Feed Probing
- Analytics Normalization Adapters
- Webhook Ingestion & Signature Verification
- Rate Limit Normalization (RateLimitResult)
- Platform Error Normalization (SocialError)
- Platform Media Constraints & Limits
- Platform Certification Protocol

## Does NOT own
- Workspace Business Rules & Permissions
- Business Goals & Strategy
- Agent Reasoning & Prompting
- LLM / Multimodal Orchestration
- Product Billing
- User Interface / Dashboard
- Authoritative Database Ownership

## Platform Adapter Contract

Every adapter implements the canonical interface for its supported capabilities:

`	ypescript
interface SocialPlatformAdapter {
  platform(): PlatformId;
  capabilities(): PlatformCapabilities;
  oauth(): OAuthAdapter;
  accounts(): AccountAdapter;
  publishing(): PublishingAdapter;
  verification(): VerificationAdapter;
  analytics(): AnalyticsAdapter;
  webhooks(): WebhookAdapter;
}
`

---

# 5. scriora-api

## Owns
- Public REST API Routing & Controllers
- OpenAPI 3.0 Canonical Specifications
- HTTP Input Validation via Zod Schemas
- Authentication Boundary (Session, JWT, API Key)
- Authorization Gatekeeper (RBAC & Workspace context)
- Pagination, Filtering, and Sorting contracts
- API Versioning Strategy (/v1/...)
- Standardized HTTP Error Serialization
- API Gateway Rate Limiting
- Public Webhook Endpoints for Platforms

## Does NOT own
- Domain Business Invariants
- Direct PostgreSQL Database Schema Access
- Social Platform SDK Implementations
- Agent Internal Runtime Loops
- Media Transcoding Pipelines

---

# 6. scriora-web

## Owns
- Next.js Application (App Router, Server & Client Components)
- Dashboard UI, Layouts, and Navigation
- Classic Mode Management Suite
- Mission Mode Autonomous Interface
- Content Studio & Omni-Platform Composer
- Visual Interactive Calendar & Queues
- Approval Center & Revision Review Flow
- Analytics Dashboard & Trend Visualizers
- Unified Omni-Channel Inbox
- Media Asset Library UI
- Organization Settings & Team RBAC UI
- Full RTL/LTR Bi-directional Support & Typography (Cairo font)
- WCAG AAA Accessibility Standards

## Does NOT own
- Direct PostgreSQL Database Queries
- Business Domain Logic Duplication
- Direct Social Platform SDK Calls
- Agent Runtime Orchestration
- OAuth Provider Secret Handling

---

# 7. scriora-worker

## Owns
- Inngest Durable Workflow Functions
- Background Asynchronous Execution
- Scheduled Publications & Recurring Crons
- Outbox Table Polling (FOR UPDATE SKIP LOCKED)
- Publication Attempt Orchestration
- Token Auto-Refresh Jobs
- Metrics Synchronization Pipelines
- Asynchronous Webhook Background Processing
- UNKNOWN_EXTERNAL_STATE Reconciliation Loops
- Exponential Backoff, Jitter, and Retry Policies
- DLQ & Recoverable Failure Routing

## Does NOT own
- Authoritative Domain State Generation
- Direct Platform SDK Implementations
- Web User Interface
- Agent Cognitive Reasoning

---

# 8. scriora-media

## Owns
- Media Ingestion, MIME Validation, and Magic-byte Verification
- Metadata Extraction (EXIF, Dimensions, Duration, Bitrates)
- Image Processing (Resize, Smart Crop, WebP/AVIF Compression)
- Video Processing (FFmpeg Transcoding, H.264/AAC Standardization)
- Thumbnail Extraction (Golden aspect ratios: 1:1, 4:5, 16:9, 9:16)
- Object Storage Abstraction (S3 / Cloud Storage / MinIO)
- Disk Space Cleanup & Ephemeral Temp File Pruning
- CPU, Memory, and Process Timeout Safety Limits

## Does NOT own
- LLM / Generative AI Provider SDKs
- Image Generation Models (Midjourney, DALL-E, Flux, Imagen)
- Video Generation Models (Runway, Sora, Kling, Luma)
- Agent Planning
- Social Platform API Constraints Negotiation

---

# 9. scriora-agent

## Owns
- Agent Runtime & Execution Loop
- Planning, Task Decomposition, and Reasoning Engine
- Dynamic Context Assembly & Working Memory
- Skill Engine (Deterministic Skills + AI Skills)
- Tool Call Boundary & Invariant Checking
- Long-Term & Short-Term Memory Integration
- Autonomy Policies (L0 to L4) & Security Guardrails
- Autonomous Growth Missions & Experimentation Loops
- Semantic Evaluation & Hallucination Checks
- Abstracted Provider Contracts:
  - LLMProvider
  - ImageGenerationProvider
  - VideoGenerationProvider
  - MultimodalProvider
- Agent Execution Persistence (gent_tasks, skill_executions, provider_runs)

## Does NOT own
- Direct Social Platform SDKs
- Direct Social OAuth Token Storage
- Authoritative Business Database Entities
- Tenant RBAC Authorization Overrides
- Approval Bypass Capabilities

---

# 10. scriora-mcp

## Owns
- Model Context Protocol (MCP) Transport Layer (stdio / SSE)
- JSON-RPC 2.0 Protocol Compatibility
- Semantic Tool Definitions for External Agents
- MCP Resource and Prompt Exposure
- Strict Tool Input/Output Schema Validation
- MCP Authentication & Scoped Permission Gates

## Does NOT own
- Duplicated Business Domain Logic
- Direct Social Platform SDKs
- Agent Cognitive Runtime
- Direct Database Access

---

# 11. scriora-cli

## Owns
- CLI Terminal Commands & Argument Parsing
- Terminal UX, Colored Outputs, and Progress Bars
- Local Authentication Session Token Storage
- Developer API Client
- Exit Code Snapshots & Standardized CLI Errors
- Multi-Platform Packaging (Linux x64/ARM64, macOS, Windows)

## Does NOT own
- Business Domain Entities
- Direct Database Connections
- Social Platform SDKs
- Agent Execution Runtime

---

# 12. scriora-docs

## Owns
- Architecture Blueprints & ADR Documentation
- OpenAPI 3.0 API Documentation & Live Try-it Consoles
- Self-Hosting Guides (Docker Compose, Kubernetes, Bare-metal)
- Platform Capability & Certification Matrices
- Agent Framework & Skill Authoring Guides
- MCP & CLI Reference Manuals
- Security & Contribution Documentation
- Continuous Link, Lint, and Schema Validation

---

# 13. scriora-cloud

## Owns
- Managed Multi-Tenant Cloud Infrastructure
- Commercial Billing & Subscription Engines (Stripe / Paddle)
- Cloud IAM & Production Secret Management
- Automated Tenant Provisioning & Isolated DB Schemas
- Deployment Automation & Rolling Canary Upgrades
- Automated Backups, Snapshotting, and Disaster Recovery
- Production Telemetry, Observability, and Audit Vaults

## Does NOT own
- Core Open-Source Domain Invariants
- Public Application REST Specifications
- Social Platform Framework Integrations

---

# 14. Dependency Matrix

| Consumer | Core | Social | API | Media | Agent | MCP | Cloud |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| Core | — | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Social | Contracts only | — | ✗ | ✗ | ✗ | ✗ | ✗ |
| API | ✓ | Contracts | — | Contracts | Contracts | ✗ | ✗ |
| Web | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Worker | ✓ | ✓ | ✗ | ✓ | Contracts* | ✗ | ✗ |
| Media | Contracts only | ✗ | ✗ | — | ✗ | ✗ | ✗ |
| Agent | Contracts | Contracts | ✗ | Contracts | — | ✗ | ✗ |
| MCP | Contracts | Contracts | Contracts | Contracts | ✗ | — | ✗ |
| CLI | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Docs | References | References | OpenAPI | References | References | References | References |
| Cloud | Contracts | Contracts | Contracts | Contracts | Contracts | Contracts | — |

*\* Worker may invoke Agent workflows where a workflow explicitly requires Agent execution, but it must not import Agent internals unnecessarily.*

---

# 15. Forbidden Dependencies

The following 14 cross-repository dependencies are strict architectural violations:

` text
Core → API
Core → Web
Core → Agent
Core → Cloud

Social → Agent
Social → Web
Social → Cloud

Media → Agent
Media → Web

Web → Database
Web → Social SDK

Agent → Social SDK
Agent → Database business mutation

MCP → Social SDK
MCP → Database

CLI → Database
CLI → Social SDK
`

---

# 16. Contract Matrix

| Consumer | Provider | Contract |
| :--- | :--- | :--- |
| Web | API | REST + OpenAPI |
| API | Core | Application Use Cases & Service Contracts |
| API | Social | Social Platform Contracts |
| API | Media | Media Pipeline Contracts |
| Worker | Core | Workflow & Application State Contracts |
| Worker | Social | Publishing, Verification & Webhook Contracts |
| Worker | Media | Media Pipeline Contracts |
| Worker | Agent | Agent Execution Workflow Contracts |
| Agent | Core | Domain & Application Service Contracts |
| Agent | Social | Social Capability, Publishing & Analytics Contracts |
| Agent | Media | Media Pipeline Contracts |
| Agent | LLM | LLM Provider Contract |
| Agent | Image | Image Generation Provider Contract |
| Agent | Video | Video Generation Provider Contract |
| MCP | API / Core | Public Application Contracts |
| CLI | API | REST / OpenAPI |
| Cloud | Public Repositories | Versioned Public Contracts |

---

# 17. Database Ownership

PostgreSQL is the shared authoritative persistence layer. Ownership is logical and isolated:

`	ext
PostgreSQL
│
├── Core-owned Business State
│   ├── workspaces
│   ├── users
│   ├── workspace_members
│   ├── brands
│   ├── social_accounts
│   ├── content
│   ├── content_variants
│   ├── publications
│   ├── publication_attempts
│   ├── approvals
│   ├── goals
│   ├── strategies
│   ├── experiments
│   ├── insights
│   ├── decisions
│   ├── policies
│   ├── outbox
│   └── idempotency_keys
│
└── Agent-owned State
    ├── agent_tasks
    ├── skill_executions
    ├── provider_runs
    └── agent execution metadata
`

- **Rule 1:** No repository may directly alter another repository's tables.
- **Rule 2:** All Core mutations pass through Domain entities and Application Services.
- **Rule 3:** Row Level Security (RLS) is strictly enforced on all workspace-bound tables.

---

# 18. Event / Workflow Ownership

`	ext
Core Application Transaction
      ↓
Insert Business Entity + OutboxEvent
      ↓
COMMIT (PostgreSQL)
      ↓
Inngest Durable Workflow Trigger
      ↓
Worker Picks Up Job (FOR UPDATE SKIP LOCKED)
      ↓
Dispatches to Social Adapter / Media / Provider
      ↓
Receives External Result
      ↓
Worker Calls Core Application Contract
      ↓
Update Publication/Attempt State to SUCCEEDED
`

**Zero external HTTP calls are permitted inside the PostgreSQL transaction.**

---

# 19. Social Platform Expansion Contract

Adding a new social network follows this formal lifecycle:

`	ext
Research → Capability Definition → Adapter Implementation → Contract Tests → Mock Provider → Integration Tests → Developer App E2E → Real API Verification → Failure & Rate-Limit Tests → Media Tests → Webhook Verification → Production Certification
`

Status tiers:
- UNKNOWN
- MOCKED
- CONTRACT_VERIFIED
- INTEGRATION_VERIFIED
- REAL_API_VERIFIED
- CERTIFIED
- DEPRECATED

---

# 20. Agent Expansion Contract

Adding a Skill:
`	ext
Manifest Definition → Input/Output Schemas → Permission Gates → Execution Behavior → Deterministic Tests → Evaluation Suite
`

Adding an AI Provider:
`	ext
Provider Contract → Adapter Implementation → Mock Provider Tests → Failure/Timeout Handling → Rate Limit Normalization → Cost/Latency Profiling → Production Certification
`

---

# 21. Versioning

- Repositories are versioned independently using Semantic Versioning (PATCH, MINOR, MAJOR).
- Breaking contract changes strictly require:
  1. Architectural Decision Record (ADR).
  2. Cross-Repository Compatibility Analysis.
  3. Contract Regression Test Suites.
  4. Database / State Migration Plan.
  5. Documentation & Release Notes.

---

# 22. Test Ownership

Every repository owns the testing layer matching its technical risk:

`	ext
Unit Tests → Business rules, pure functions, state transitions
Contract Tests → Interface conformance across boundaries
Integration Tests → Database RLS, Inngest workflows, storage
Security Tests → Tenant leakage, prompt injection, token isolation
E2E Tests → Critical business paths (E2E-01 to E2E-12)
Regression Tests → Bug reproduction fixtures and backwards compatibility
`

---

# 23. Definition of Done — Repository Change

A change across any repository is not considered complete or mergeable until the following 8 criteria are fulfilled:

` text
Implementation
+
Tests (Unit, Contract, Integration, Regression)
+
Contract impact reviewed
+
Security impact reviewed (Tenant isolation, RLS, Tokens)
+
Dependency direction verified (No architectural violations)
+
Documentation updated where required
+
Migration reviewed where applicable (Zero-downtime & reversible)
+
Compatibility reviewed against cross-repo matrix
`

---

# 24. Non-Negotiable Architecture Invariants

1. scriora-core remains framework-independent from Web/API/Social/Agent implementations.
2. scriora-social owns Social Platform integrations.
3. scriora-agent owns Agent Runtime, Skills, Tools, Memory, Policies and AI providers.
4. scriora-media owns media processing, not generation intelligence.
5. scriora-api is the HTTP boundary.
6. scriora-worker owns durable asynchronous execution.
7. scriora-mcp is an interface, not an Agent brain.
8. scriora-web never accesses the database directly.
9. PostgreSQL is the source of truth.
10. Redis is not the source of truth.
11. Inngest is the primary durable workflow mechanism.
12. UNKNOWN_EXTERNAL_STATE is a first-class state.
13. Agents cannot bypass authorization or approval.
14. Social adapters cannot contain product-domain logic.
15. Skills are not repositories.
16. Adding a platform should normally be isolated to scriora-social.
17. Adding a Skill should normally be isolated to scriora-agent.
18. Adding an AI provider should normally require only a provider adapter + certification.
19. Repository boundaries do not automatically imply microservices.
20. Public contracts must be versioned and tested.

---

# 25. Final Dependency Philosophy

`	ext
                    ┌──────────────────┐
                    │   scriora-web    │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │   scriora-api    │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │  scriora-core    │
                    └──────────────────┘


     ┌────────────────┐       ┌────────────────┐
     │ scriora-agent  │       │scriora-worker  │
     └───────┬────────┘       └───────┬────────┘
             │                        │
       Contracts                  Contracts
             │                        │
       ┌─────┴─────┬──────────┬──────┴─────┐
       ▼           ▼          ▼            ▼
     Core        Social      Media      Workflows


External Agents
       │
       ▼
scriora-mcp
       │
       ▼
Public Contracts


CLI
 │
 ▼
API


Cloud
 │
 ▼
Versioned Public Contracts
`
