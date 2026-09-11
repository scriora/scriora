# Scriora --- Architecture Baseline

> **Status:** Proposed for architectural approval\
> **Role:** Architectural source of truth for rebuilding
> `SCRIORA_SPEC.md`\
> **Product:** Scriora --- The Autonomous AI Social Growth Operating
> System\
> **Principle:** AI Works. Human Controls.

------------------------------------------------------------------------

## 0. Purpose

This document freezes the architectural decisions that must be settled
before rebuilding the main Scriora specification.

It defines:

-   the final repository topology;
-   ownership and forbidden responsibilities for every repository;
-   dependency direction;
-   cross-repository contracts;
-   Social Platform Framework boundaries;
-   Agent/Skills/Tools/Provider architecture;
-   runtime and data-flow boundaries;
-   state and error models;
-   test strategy and certification matrices;
-   versioning and cross-repository compatibility.

`SCRIORA_SPEC.md` must be rebuilt from this baseline after architectural
approval.

This document does **not** replace detailed product requirements, UX
specifications, database schemas, or platform API documentation. Those
documents must conform to this baseline.

------------------------------------------------------------------------

# 1. Architectural Decisions

## ADR-BASE-001 --- Repository Separation

Scriora uses separate repositories for major technical boundaries.

Final repository set:

1.  `scriora-core`
2.  `scriora-social`
3.  `scriora-api`
4.  `scriora-web`
5.  `scriora-worker`
6.  `scriora-media`
7.  `scriora-agent`
8.  `scriora-mcp`
9.  `scriora-cli`
10. `scriora-docs`
11. `scriora-cloud`

Repository separation does **not** automatically imply distributed
runtime services.

The default runtime architecture remains a **modular system with
explicit contracts**, and deployment topology may combine components
when appropriate, especially for self-hosting.

------------------------------------------------------------------------

## ADR-BASE-002 --- Source of Truth

PostgreSQL is the authoritative source of business state.

Redis is used for:

-   caching;
-   short-lived coordination;
-   distributed locks where required;
-   non-authoritative ephemeral state.

Redis is not the authoritative publication ledger and is not the primary
source of business truth.

------------------------------------------------------------------------

## ADR-BASE-003 --- Durable Execution

The durable execution model is:

``` text
PostgreSQL transaction
    ↓
Business state + publication/attempt + outbox event
    ↓
COMMIT
    ↓
Inngest
    ↓
Worker execution
    ↓
Social / Media / Provider adapter
    ↓
Verification / reconciliation
```

`Inngest` is the durable workflow engine.

The architecture must not reintroduce BullMQ as a competing primary
workflow mechanism.

------------------------------------------------------------------------

## ADR-BASE-004 --- Social Platform Isolation

All Social Platform integrations belong to `scriora-social`.

Adding a new platform should normally require:

``` text
New Adapter
+ Capability Definition
+ Platform Tests
+ Certification
```

and must not require modifications to:

-   `scriora-core`;
-   `scriora-api`;
-   `scriora-web`;
-   `scriora-agent`.

A change to a shared contract is allowed only when the new platform
introduces a genuinely new cross-platform capability.

------------------------------------------------------------------------

## ADR-BASE-005 --- Agent Isolation

All Agent-specific runtime, skills, tools, policies, memory integration,
missions, evaluations, and AI provider adapters belong to
`scriora-agent`.

The Agent must not directly implement Social Platform APIs.

The Agent operates through contracts exposed by the platform/application
layers.

------------------------------------------------------------------------

## ADR-BASE-006 --- Provider Agnosticism

LLM, image-generation, video-generation, and future multimodal
integrations are provider-agnostic.

The application depends on provider contracts, not vendor SDKs.

Provider-specific code belongs behind adapters.

The exact production providers are a later implementation/release
decision and must not be hard-coded into the architectural contracts.

------------------------------------------------------------------------

## ADR-BASE-007 --- AI Rollout Timing

The architecture is AI-ready before it is AI-live.

During foundational development:

-   use deterministic mocks/stubs;
-   validate schemas and contracts;
-   test Agent behavior deterministically;
-   avoid consuming paid AI API quotas.

Real provider credentials and live model execution are introduced during
the final AI integration phase.

------------------------------------------------------------------------

# 2. System Architecture

Scriora consists of four major product layers:

``` text
┌─────────────────────────────────────────────────────────┐
│                    AI / AGENT LAYER                     │
│ Runtime • Skills • Tools • Missions • Memory • Policies│
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│                  GROWTH INTELLIGENCE                     │
│ Goals • Strategy • Experiments • Insights • Learning    │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│                    SOCIAL MANAGEMENT                     │
│ Content • Calendar • Approvals • Analytics • Inbox      │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│               SOCIAL PLATFORM INFRASTRUCTURE             │
│ OAuth • Accounts • Capabilities • Publishing • Webhooks │
│ Metrics • Verification • Rate Limits • Adapters         │
└─────────────────────────────────────────────────────────┘
```

Cross-cutting foundations:

-   identity and authorization;
-   tenant isolation;
-   PostgreSQL;
-   encryption;
-   auditability;
-   observability;
-   contracts;
-   durable execution;
-   media infrastructure.

## 2.1 Unified System Topology

``` text
                         SCRIORA
                            │
       ┌────────────────────┼────────────────────┐
       │                    │                    │
       ▼                    ▼                    ▼
   Web / CLI / MCP       Agent               Public API
       │                    │                    │
       └────────────────────┼────────────────────┘
                            │
                       Contracts
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
            CORE          SOCIAL         MEDIA
              │             │             │
              ▼             ▼             ▼
         PostgreSQL     Platforms      Storage/
         + Outbox       + APIs        Processing
              │
              ▼
           Inngest
              │
              ▼
           Worker
```

## 2.2 Unified Agent Cognitive Loop

``` text
                   AGENT
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
      Skills        Tools       Providers
        │            │        ┌────┼────┐
        ▼            ▼        ▼    ▼    ▼
     Planning    Core/Social  LLM Image Video
        │
        ▼
     Memory
        │
        ▼
    Evaluation
        │
        ▼
     Policies
        │
        ▼
  Human Approval
```

------------------------------------------------------------------------

# 3. Final Repository Topology

## 3.1 Repository Overview

  -----------------------------------------------------------------------
  Repository              Visibility              Primary Ownership
  ----------------------- ----------------------- -----------------------
  `scriora-core`          Public                  Domain, application
                                                  logic, database,
                                                  security

  `scriora-social`        Public                  Social Platform
                                                  Framework and adapters

  `scriora-api`           Public                  Public HTTP API

  `scriora-web`           Public                  Web application/UI

  `scriora-worker`        Public                  Durable background
                                                  execution

  `scriora-media`         Public                  Media processing and
                                                  storage abstraction

  `scriora-agent`         Public                  Agent runtime, skills,
                                                  tools, policies,
                                                  providers

  `scriora-mcp`           Public                  MCP interface

  `scriora-cli`           Public                  CLI interface

  `scriora-docs`          Public                  Documentation

  `scriora-cloud`         Private                 Managed/commercial
                                                  cloud layer
  -----------------------------------------------------------------------

## 3.2 Repository Contract Matrix

| Repository | Owns | Exposes | Consumes | Forbidden (ممنوع عليه) | Runtime | DB Ownership | Release | Visibility |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `scriora-core` | Domain, business rules, tenancy, auth, permissions, persistence, outbox | Domain contracts, application services | PostgreSQL, crypto/storage abstractions | Social APIs, UI, HTTP framework, MCP | Library | **نعم (Authoritative)** | npm package | Public |
| `scriora-social` | Social Platform Framework, adapters, OAuth, publishing, verification, platform metrics, webhooks, capabilities | Social contracts + adapters | Official platform APIs, media contracts | Product domain, UI, billing | Library | **لا** | npm package | Public |
| `scriora-api` | Public API, HTTP, validation, auth boundary, API versioning | REST/OpenAPI | Core, Social, Media | Direct platform implementation, business duplication | **نعم** | لا | Container + package | Public |
| `scriora-web` | Dashboard/UI/frontend | Web application | Public API | DB, Social adapters, platform APIs | **نعم** | لا | Container | Public |
| `scriora-worker` | Durable workflows, background execution, retries, scheduled execution | Workflow handlers | Core, Social, Media, Inngest | UI, duplicated domain rules | **نعم** | لا* | Container | Public |
| `scriora-media` | Media pipeline, transforms, validation, transcoding, storage abstraction | Media contracts | Object storage, processing providers | Product domain, publishing logic | Library initially | لا | npm package | Public |
| `scriora-agent` | Agent runtime, planning, execution loop, skills, tools, memory, policies, missions, provider adapters | Agent contracts, skill interfaces | Core contracts, Social contracts, Media contracts, Provider APIs | Direct social SDKs, direct DB bypass, bypassing human gates | Library / Service | لا (State metadata only) | npm package / Container | Public |
| `scriora-mcp` | MCP tools/resources/prompts | MCP server | Public API / Application contracts | Direct DB, duplicated domain/social logic | Optional | لا | npm package / container | Public |
| `scriora-cli` | CLI commands and developer UX | CLI | Public API | Direct DB, duplicated business logic | No | لا | npm package | Public |
| `scriora-docs` | Documentation/specs/guides | Docs site/content | Repository contracts | Runtime dependencies | No | لا | Static/site | Public |
| `scriora-cloud` | Managed cloud, billing, provisioning, commercial layer | Cloud APIs/control plane | Core/API/infra | Core self-hosted dependency | **نعم، لاحقًا** | Cloud-owned | Private | Private |

*\* `scriora-worker` reads and writes exclusively through Core application contracts and owns no independent domain schema.*

## 3.3 Ownership Matrix (Responsibility vs Repository)

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


------------------------------------------------------------------------

# 4. Repository Ownership

## 4.1 `scriora-core`

### Owns

-   Domain entities;
-   application/use-case layer;
-   authorization;
-   workspace/tenant model;
-   business rules;
-   database schema;
-   migrations;
-   RLS;
-   audit events;
-   publication state;
-   outbox;
-   idempotency;
-   approval state;
-   goals, strategies, experiments, insights and decisions;
-   canonical business contracts.

### Must not own

-   Social Platform SDK implementations;
-   platform-specific OAuth implementations;
-   FFmpeg;
-   image/video provider SDKs;
-   Agent runtime;
-   LLM provider implementations;
-   Web UI;
-   MCP transport;
-   CLI;
-   cloud billing.

------------------------------------------------------------------------

## 4.2 `scriora-social`

The independent Social Platform Framework.

### Owns

-   platform contracts;
-   capability model;
-   platform registry;
-   OAuth adapters;
-   account discovery;
-   publishing adapters;
-   verification;
-   metrics ingestion adapters;
-   webhook adapters;
-   rate-limit normalization;
-   platform error normalization;
-   platform media constraints;
-   platform-specific options;
-   platform certification;
-   official API integration tests.

### Must not own

-   Workspace business rules;
-   database ownership;
-   billing;
-   UI;
-   Agent planning;
-   Agent memory;
-   LLM orchestration.

------------------------------------------------------------------------

## 4.3 `scriora-api`

### Owns

-   REST API;
-   OpenAPI;
-   request validation;
-   authentication boundary;
-   authorization enforcement;
-   API versioning;
-   pagination/filtering/sorting;
-   public API keys where applicable;
-   HTTP error serialization;
-   webhooks exposed to external developers;
-   API rate limiting.

### Must not own

-   Domain business rules;
-   database schema ownership;
-   direct Social Platform SDK logic;
-   Agent internal runtime;
-   media processing.

------------------------------------------------------------------------

## 4.4 `scriora-web`

### Owns

-   Next.js application;
-   dashboard;
-   Classic Mode;
-   Mission Mode UI;
-   content studio;
-   calendar;
-   approvals;
-   analytics UI;
-   inbox UI;
-   settings;
-   accessibility;
-   responsive behavior;
-   localization.

### Must not own

-   authorization rules;
-   publication business rules;
-   Social Platform adapters;
-   Agent execution;
-   database access as a substitute for API/application contracts.

------------------------------------------------------------------------

## 4.5 `scriora-worker`

### Owns

-   Inngest functions;
-   durable execution;
-   scheduled execution;
-   outbox processing;
-   publication execution orchestration;
-   token refresh jobs;
-   metrics synchronization;
-   webhook processing;
-   reconciliation;
-   retry policies;
-   recovery workflows.

### Must not own

-   authoritative business state;
-   Social Platform SDK implementations;
-   UI;
-   Agent reasoning.

------------------------------------------------------------------------

## 4.6 `scriora-media`

### Owns

-   media ingestion;
-   validation;
-   metadata;
-   image transformations;
-   thumbnails;
-   compression;
-   video transcoding;
-   FFmpeg execution;
-   aspect-ratio adaptation;
-   storage abstraction;
-   media cleanup;
-   resource limits;
-   deterministic media fixtures.

### Must not own

-   Social account authorization;
-   publishing business state;
-   Agent planning;
-   billing.

------------------------------------------------------------------------

## 4.7 `scriora-agent`

The complete Scriora Agent Framework.

### Owns

``` text
Agent Runtime
Planning
Execution Loop
Context Assembly
Skills
Tools
Memory Integration
Policies
Missions
Evaluation
Guardrails
Human Approval Requests
LLM Provider Adapters
Image Provider Adapters
Video Provider Adapters
Future Multimodal Providers
Agent Contracts
Agent Tests
```

### Must not own

-   Social Platform API implementations;
-   PostgreSQL schema as a business source of truth;
-   tenant authorization rules;
-   direct unrestricted token access;
-   direct bypass of approval policies.

------------------------------------------------------------------------

## 4.8 `scriora-mcp`

### Owns

-   MCP transport;
-   MCP tool/resource/prompt definitions;
-   MCP schemas;
-   external Agent interface;
-   MCP authentication boundary;
-   protocol compatibility.

### Must not own

-   duplicated domain logic;
-   duplicated Social adapters;
-   independent authorization rules.

------------------------------------------------------------------------

## 4.9 `scriora-cli`

### Owns

-   CLI commands;
-   configuration;
-   authentication UX;
-   terminal output;
-   exit codes;
-   local config handling;
-   cross-platform packaging.

It consumes public Scriora contracts and APIs.

------------------------------------------------------------------------

## 4.10 `scriora-docs`

### Owns

-   user documentation;
-   developer documentation;
-   API documentation;
-   architecture documentation;
-   platform capability documentation;
-   self-hosting guides;
-   contribution documentation.

Documentation must be validated against actual contracts.

------------------------------------------------------------------------

## 4.11 `scriora-cloud`

### Owns

-   managed hosting;
-   commercial orchestration;
-   billing;
-   subscriptions;
-   production infrastructure;
-   cloud-specific secrets/IAM;
-   managed deployment;
-   production observability;
-   backups and restore;
-   cloud-specific tenant operations.

It must not redefine the public core domain.

------------------------------------------------------------------------

# 5. Final Repository Trees

## 5.1 `scriora-core`

``` text
scriora-core/
├── src/
│   ├── domain/
│   ├── application/
│   ├── authorization/
│   ├── tenancy/
│   ├── publication/
│   ├── content/
│   ├── approval/
│   ├── analytics/
│   ├── inbox/
│   ├── growth/
│   ├── goals/
│   ├── strategy/
│   ├── experiments/
│   ├── insights/
│   ├── decisions/
│   ├── memory/
│   ├── audit/
│   ├── idempotency/
│   └── outbox/
├── db/
│   ├── schema/
│   ├── migrations/
│   └── seeds/
├── contracts/
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── security/
│   └── architecture/
└── infrastructure/
```

## 5.2 `scriora-social`

``` text
scriora-social/
├── contracts/
│   ├── platform.ts
│   ├── account.ts
│   ├── oauth.ts
│   ├── publishing.ts
│   ├── verification.ts
│   ├── analytics.ts
│   ├── webhook.ts
│   ├── media.ts
│   ├── capabilities.ts
│   ├── rate-limit.ts
│   └── errors.ts
├── capabilities/
├── registry/
├── auth/
├── publishing/
├── verification/
├── analytics/
├── webhooks/
├── rate-limits/
├── media/
├── errors/
├── adapters/
│   ├── linkedin/
│   ├── instagram/
│   ├── facebook/
│   ├── x/
│   ├── tiktok/
│   ├── youtube/
│   ├── pinterest/
│   ├── threads/
│   ├── bluesky/
│   ├── reddit/
│   ├── mastodon/
│   └── discord/
├── platforms/
│   └── <platform>/
│       ├── capabilities.md
│       ├── constraints.md
│       └── certification.md
└── tests/
    ├── unit/
    ├── contract/
    ├── integration/
    ├── failure/
    └── certification/
```

## 5.3 `scriora-api`

``` text
scriora-api/
├── src/
│   ├── routes/
│   ├── middleware/
│   ├── auth/
│   ├── errors/
│   ├── pagination/
│   ├── rate-limit/
│   └── openapi/
├── tests/
│   ├── unit/
│   ├── contract/
│   ├── integration/
│   └── e2e/
└── openapi/
```

## 5.4 `scriora-web`

``` text
scriora-web/
├── app/
├── components/
├── features/
│   ├── auth/
│   ├── workspaces/
│   ├── accounts/
│   ├── content/
│   ├── calendar/
│   ├── approvals/
│   ├── analytics/
│   ├── inbox/
│   ├── growth/
│   └── missions/
├── lib/
├── hooks/
├── i18n/
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── accessibility/
│   └── e2e/
└── public/
```

## 5.5 `scriora-worker`

``` text
scriora-worker/
├── src/
│   ├── functions/
│   ├── workflows/
│   ├── outbox/
│   ├── publishing/
│   ├── reconciliation/
│   ├── token-refresh/
│   ├── analytics-sync/
│   ├── webhooks/
│   └── retry/
└── tests/
    ├── unit/
    ├── workflow/
    ├── integration/
    ├── recovery/
    └── e2e/
```

## 5.6 `scriora-media`

``` text
scriora-media/
├── src/
│   ├── ingestion/
│   ├── validation/
│   ├── images/
│   ├── video/
│   ├── thumbnails/
│   ├── compression/
│   ├── storage/
│   ├── metadata/
│   └── limits/
└── tests/
    ├── unit/
    ├── fixtures/
    ├── golden/
    ├── integration/
    └── resource-safety/
```

## 5.7 `scriora-agent`

``` text
scriora-agent/
├── runtime/
│   ├── agent-runtime/
│   ├── execution-loop/
│   ├── task-runner/
│   ├── planning/
│   ├── context/
│   └── orchestration/
├── skills/
│   ├── research/
│   ├── strategy/
│   ├── content-generation/
│   ├── content-adaptation/
│   ├── analytics/
│   ├── experimentation/
│   ├── insights/
│   ├── learning/
│   ├── publishing/
│   ├── scheduling/
│   ├── media/
│   └── platform-specific/
├── tools/
│   ├── social/
│   ├── content/
│   ├── analytics/
│   ├── media/
│   ├── workspace/
│   └── system/
├── providers/
│   ├── llm/
│   │   ├── contract/
│   │   ├── adapters/
│   │   └── routing/
│   ├── image/
│   │   ├── contract/
│   │   └── adapters/
│   ├── video/
│   │   ├── contract/
│   │   └── adapters/
│   └── multimodal/
├── memory/
│   ├── working/
│   ├── brand/
│   ├── evidence/
│   ├── preferences/
│   └── operational/
├── policies/
│   ├── autonomy/
│   ├── approval/
│   ├── safety/
│   ├── content/
│   ├── cost/
│   └── permissions/
├── missions/
│   ├── mission/
│   ├── goals/
│   ├── strategies/
│   ├── hypotheses/
│   ├── experiments/
│   └── learning-loop/
├── evaluation/
│   ├── quality/
│   ├── hallucination/
│   ├── guardrails/
│   └── platform-constraints/
├── contracts/
│   ├── agent/
│   ├── skill/
│   ├── tool/
│   ├── provider/
│   ├── memory/
│   └── execution/
└── tests/
    ├── unit/
    ├── contract/
    ├── deterministic/
    ├── integration/
    ├── security/
    └── e2e/
```

## 5.8 `scriora-mcp`

``` text
scriora-mcp/
├── .github/
│   └── workflows/
│
├── src/
│   ├── server/
│   ├── tools/
│   ├── resources/
│   ├── prompts/
│   ├── auth/
│   ├── validation/
│   ├── errors/
│   └── transport/
│
├── tests/
│   ├── unit/
│   ├── contract/
│   ├── integration/
│   ├── security/
│   ├── e2e/
│   └── regression/
│
├── ARCHITECTURE.md
├── CONTRIBUTING.md
├── SECURITY.md
├── CODEOWNERS
├── LICENSE
├── README.md
└── package.json
```

## 5.9 `scriora-cli`

``` text
scriora-cli/
├── .github/
│   └── workflows/
│
├── src/
│   ├── commands/
│   ├── config/
│   ├── auth/
│   ├── client/
│   ├── output/
│   ├── errors/
│   └── index.ts
│
├── tests/
│   ├── unit/
│   ├── contract/
│   ├── integration/
│   ├── e2e/
│   └── regression/
│
├── packaging/
├── ARCHITECTURE.md
├── CONTRIBUTING.md
├── SECURITY.md
├── CODEOWNERS
├── LICENSE
├── README.md
└── package.json
```

## 5.10 `scriora-docs`

``` text
scriora-docs/
├── .github/
│   └── workflows/
│
├── architecture/
├── product/
├── api/
├── social/
│   ├── framework/
│   ├── platforms/
│   ├── certification/
│   └── test-matrix/
├── self-hosting/
├── development/
├── contributing/
├── security/
├── releases/
├── reference/
│
├── scripts/
│
├── README.md
├── CONTRIBUTING.md
├── SECURITY.md
├── CODEOWNERS
└── package.json
```

## 5.11 `scriora-cloud`

``` text
scriora-cloud/
├── .github/
│   └── workflows/
│
├── src/
│   ├── control-plane/
│   ├── tenants/
│   ├── billing/
│   ├── subscriptions/
│   ├── provisioning/
│   ├── deployments/
│   ├── usage/
│   ├── audit/
│   └── cloud-api/
│
├── infrastructure/
│   ├── terraform/
│   ├── environments/
│   └── policies/
│
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── security/
│   ├── billing/
│   ├── isolation/
│   ├── e2e/
│   └── regression/
│
├── ARCHITECTURE.md
├── CONTRIBUTING.md
├── SECURITY.md
├── CODEOWNERS
├── README.md
└── package.json
```

------------------------------------------------------------------------

# 6. Dependency Graph

## 6.1 High-Level Graph

``` text
                         ┌─────────────────┐
                         │ scriora-web     │
                         └────────┬────────┘
                                  │
                                  ▼
                         ┌─────────────────┐
                         │ scriora-api     │
                         └───────┬─────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              ▼                  ▼                  ▼
       ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
       │ scriora-core│    │scriora-social│    │scriora-media│
       └──────┬──────┘    └─────────────┘    └─────────────┘
              │
              ▼
       PostgreSQL / Outbox

       ┌─────────────────┐
       │ scriora-worker  │
       └───────┬─────────┘
               ├──────────────► core
               ├──────────────► social
               └──────────────► media

       ┌─────────────────┐
       │ scriora-agent   │
       └───────┬─────────┘
               ├──────────────► core contracts
               ├──────────────► social contracts
               ├──────────────► media contracts
               └──────────────► provider contracts

       ┌─────────────────┐
       │ scriora-mcp     │
       └───────┬─────────┘
               └──────────────► public application contracts

       ┌─────────────────┐
       │ scriora-cli     │
       └───────┬─────────┘
               └──────────────► scriora-api

       ┌─────────────────┐
       │ scriora-cloud   │
       └───────┬─────────┘
               └──────────────► public Scriora contracts
```

## 6.2 Dependency Rules

Allowed:

``` text
web → api
api → core
api → social contracts
api → media contracts
worker → core
worker → social
worker → media
agent → core contracts
agent → social contracts
agent → media contracts
agent → provider contracts
mcp → public contracts
cli → api
cloud → public contracts
```

Forbidden:

The following 14 cross-repository dependencies are strict architectural violations:

``` text
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
```

## 6.3 Cross-Repository Dependency Matrix

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

The exact package-level dependency mechanism may be implemented using
published packages, workspace packages during development, or generated
contract artifacts, but the ownership direction must remain unchanged.

------------------------------------------------------------------------

# 7. Contract Matrix

  Consumer   Provider       Contract
  ---------- -------------- -------------------------------------------
  Web        API            REST + OpenAPI
  API        Core           Application/use-case contracts
  API        Social         Social contracts
  API        Media          Media contracts
  Worker     Core           Application/workflow contracts
  Worker     Social         Publishing/verification/webhook contracts
  Worker     Media          Media contracts
  Agent      Core           Domain/application contracts
  Agent      Social         Capability/publishing/analytics contracts
  Agent      Media          Media contracts
  Agent      LLM            LLM provider contract
  Agent      Image          Image provider contract
  Agent      Video          Video provider contract
  MCP        API/Core       Public application contracts
  CLI        API            REST/OpenAPI
  Cloud      Public repos   Versioned public contracts

------------------------------------------------------------------------

# 8. Social Platform Framework

## 8.1 Core Principle

A platform adapter is a replaceable implementation of a stable contract.

``` text
Social Capability Contract
          ↓
Platform Adapter
          ↓
Official Platform API
```

The rest of Scriora consumes normalized behavior.

## 8.2 Platform Lifecycle

``` text
Platform Research
      ↓
Capability Definition
      ↓
Adapter
      ↓
Contract Tests
      ↓
Mock Provider
      ↓
Integration Tests
      ↓
Developer/Test App
      ↓
Real API E2E
      ↓
Failure/Retry Tests
      ↓
Rate-Limit Tests
      ↓
Media Tests
      ↓
Webhook Tests
      ↓
Production Certification
```

## 8.3 Capability Matrix

Each platform is evaluated independently for:

-   OAuth;
-   account discovery;
-   text;
-   image;
-   video;
-   carousel;
-   scheduling compatibility;
-   publishing;
-   verification;
-   metrics;
-   webhooks;
-   rate limits;
-   retries;
-   failure recovery;
-   media constraints;
-   platform-specific features.

A capability is not marked supported based on assumption.

## 8.4 Platform Adapter Contract Interface

Every social platform adapter implements a standard, type-safe contract interface for the capabilities it supports:

```typescript
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
```

Not every platform must implement every capability. Unsupported operations return an explicit capability/error result rather than failing silently or causing crashes.

------------------------------------------------------------------------

# 9. Unified Social API

Scriora exposes a unified abstraction for common operations.

Example:

``` json
{
  "content": "Example post",
  "targets": [
    "linkedin:123",
    "instagram:456",
    "x:789"
  ]
}
```

The unified layer must not erase platform-specific capabilities.

Platform-specific options remain accessible through explicit platform
capability contracts.

Example:

``` text
Unified:
publish(text, media, target)

Platform-specific:
publish(platformOptions)
```

The goal is:

``` text
Common operations → normalized
Unique capabilities → explicitly exposed
```

------------------------------------------------------------------------

# 10. Agent Architecture

## 10.1 Agent Runtime

The runtime manages:

``` text
Task
 ↓
Context
 ↓
Planning
 ↓
Skill Selection
 ↓
Tool Execution
 ↓
Policy Evaluation
 ↓
Human Gate if required
 ↓
Execution
 ↓
Evidence
 ↓
Learning
```

The Agent does not directly mutate authoritative domain state without
going through approved application contracts.

------------------------------------------------------------------------

# 11. Skill Architecture

A Skill is not merely a prompt.

Each Skill should define:

``` text
Skill
├── manifest
├── purpose
├── input schema
├── output schema
├── required permissions
├── required capabilities
├── policy requirements
├── cost characteristics
├── execution behavior
└── tests
```

Example:

``` text
skills/content-generation/
├── skill.yaml
├── schema.ts
├── execute.ts
├── policy.ts
└── tests/
```

Skills must be:

-   deterministic-testable where possible;
-   schema validated;
-   permission aware;
-   observable;
-   versioned;
-   independently replaceable.

## 11.1 Skill Classification: Deterministic vs AI Skills

Skills are not monolithic prompt wrappers. They are strictly divided into two technical execution categories:

### 1. Deterministic Skills
Operations with mathematical, structural, or deterministic rule sets that do not require LLM calls and must execute with 100% predictable outcomes, zero token cost, and sub-millisecond latency:
- `adapt_content`: Adapting content structures, character boundaries, and markdown formatting to platform-specific length constraints.
- `calculate_schedule`: Computing optimal queue slots, timezone conversions, and calendar intervals.
- `validate_platform_constraints`: Validating aspect ratios, video bitrates, file sizes, and mention limits against platform schemas.
- `prepare_media`: Coordinating transformation calls to `scriora-media` for transcoding, cropping, and thumbnail extraction.
- `analyze_metrics`: Aggregating raw impressions, CTR, engagement rates, and trend variances.

### 2. AI Skills
Cognitive, probabilistic, and strategic tasks that leverage abstracted AI providers (`LLMProvider`, `ImageGenerationProvider`, `VideoGenerationProvider`):
- `research`: Ingesting brand documents, competitor benchmarks, and audience pain points.
- `strategy_generation`: Formulating content themes, posting frequencies, and growth hypotheses.
- `content_generation`: Drafting compelling hooks, posts, threads, and captions grounded in brand voice.
- `insight_generation`: Synthesizing semantic performance data into strategic observations.
- `next_best_action`: Recommending actionable next steps based on experiment evidence and historical performance.

This classification allows comprehensive automated and deterministic contract testing across the majority of the Agent surface without invoking external paid AI provider APIs.

------------------------------------------------------------------------

# 12. Tool Architecture

Tools are the Agent's controlled action surface.

Examples:

``` text
social.publish
social.schedule
social.verify
social.get_metrics

content.create_draft
content.adapt

analytics.query
analytics.compare

media.generate
media.transform

workspace.get_context

approval.request
```

Tools must declare:

-   input;
-   output;
-   required permissions;
-   side effects;
-   idempotency behavior;
-   approval requirements;
-   error behavior.

## 12.1 Canonical Typed Tool Contracts

Tools provide the typed interface through which the Agent interacts with Core, Social, and Media contracts:

```typescript
// Core Growth & Planning Tools
create_goal(input: CreateGoalInput): Promise<GoalResult>;
create_strategy(input: CreateStrategyInput): Promise<StrategyResult>;
create_insight(input: CreateInsightInput): Promise<InsightResult>;

// Content & Editorial Tools
create_content(input: CreateContentInput): Promise<ContentResult>;
adapt_content(input: AdaptContentInput): Promise<AdaptResult>;

// Scheduling & Publishing Tools
schedule_publication(input: SchedulePublicationInput): Promise<ScheduleResult>;
publish(input: PublishInput): Promise<OperationResult>;

// Intelligence & Reporting Tools
get_metrics(input: GetMetricsInput): Promise<MetricsResult>;
```

Every tool execution:
1. Validates strict Zod/TypeScript runtime input schemas.
2. Verifies Workspace context and tenant isolation.
3. Evaluates active Agent autonomy policies (L0 to L4).
4. Routes through human approval gates whenever required by governance policy.
5. Emits structured immutable audit events with full causal provenance.

------------------------------------------------------------------------

# 13. Provider Architecture

## 13.1 LLM

``` text
Agent
 ↓
LLM Contract
 ↓
Provider Router
 ├── Adapter A
 ├── Adapter B
 ├── Adapter C
 └── Local Provider
```

The Agent must not depend on vendor-specific request/response formats.

## 13.2 Image

``` text
Image Skill
 ↓
Image Provider Contract
 ↓
Provider Adapter
 ↓
Image Generation API
```

The same model applies to video and future multimodal generation.

## 13.3 Provider Selection

Provider selection may later consider:

-   capability;
-   quality;
-   latency;
-   cost;
-   availability;
-   safety;
-   workspace policy;
-   media requirements.

The provider router must not become an uncontrolled hidden decision
engine. Selection rules must be observable and policy constrained.

------------------------------------------------------------------------

# 14. Agent ↔ Scriora Interaction

The preferred flow:

``` text
Agent
  ↓
Skill
  ↓
Tool
  ↓
Application Contract
  ↓
Core / Social / Media
```

Never:

``` text
Agent
  ↓
Database
```

and never:

``` text
Agent
  ↓
Social Platform SDK
```

This preserves authorization, auditing, idempotency and business
invariants.

------------------------------------------------------------------------

# 15. Human Governance

The existing principle remains:

``` text
AI Works.
Human Controls.
```

Agent autonomy levels must be enforced by policy.

Example:

``` text
L0 — Observe
L1 — Recommend
L2 — Draft
L3 — Execute approved actions
L4 — Controlled autonomous execution
```

Autonomy does not override:

-   workspace permissions;
-   platform permissions;
-   security policy;
-   approval policy;
-   provider safety policy.

------------------------------------------------------------------------

# 16. Memory Model

Agent memory is an Agent concern in terms of orchestration and
retrieval, but authoritative business facts remain in Core.

``` text
Core
 └── authoritative business facts

Agent
 ├── working context
 ├── brand memory
 ├── evidence context
 ├── preferences
 └── learning context
```

The Agent must not treat generated memory as automatically
authoritative.

Evidence and provenance should be retained for important decisions.

## 16.1 Six-Tier Cognitive Memory Storage Architecture

```text
Working Context      ──► Redis / RAM (Ephemeral conversation state)
Short-term Context   ──► PostgreSQL (~14-day retention)
Brand Knowledge      ──► PostgreSQL + pgvector (Permanent)
Evidence Context     ──► PostgreSQL (Time-decaying relevance)
Preferences          ──► PostgreSQL (Permanent user / brand overrides)
Operational State    ──► Redis (Rebuildable operational cache)
```

`pgvector` is scheduled for Agent and Mission Engine phases; Classic GA relies on relational indices.

------------------------------------------------------------------------

# 17. Persistence Ownership

PostgreSQL is shared infrastructure, but ownership of schemas/tables follows repository boundaries.

```text
PostgreSQL
├── Core-owned business state
│   ├── workspaces
│   ├── memberships
│   ├── content
│   ├── publications
│   ├── approvals
│   ├── goals
│   ├── strategies
│   ├── experiments
│   ├── insights
│   └── audit/business records
│
└── Agent-owned state
    ├── agent_tasks
    ├── skill_executions
    ├── provider_runs
    └── agent execution metadata
```

Agent-owned persistence must still obey the global security model and tenant boundaries.

The existence of Agent-owned tables does not make the Agent the authoritative owner of business entities.

The same principle applies to other repositories if they require durable repository-specific state.

## 17.1 Domain Entity & Table Ownership Matrix

| Domain Entity | Physical Table | Owning Repository | Schema Definition Status |
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
| Hypothesis | `growth_hypotheses` | `scriora-core` | Defined in Domain Model Spec |
| Experiment | `experiments` | `scriora-core` | Defined in Domain Model Spec |
| Insight | `insights` | `scriora-core` | Defined in Domain Model Spec |
| Decision | `decisions` | `scriora-core` | Defined in Domain Model Spec |
| Mission | `missions` | `scriora-core` | Defined in Domain Model Spec |
| Memory | `memories` | `scriora-agent` / `scriora-core` | Defined in Spec |
| Agent Task | `agent_tasks` | `scriora-agent` | Defined in Domain Model Spec |
| Skill Execution | `skill_executions` | `scriora-agent` | Defined in Domain Model Spec |
| Provider Run | `provider_runs` | `scriora-agent` | Defined in Domain Model Spec |

## 17.2 Entity-Relationship Topological Map

```text
User
 │
 └──< WorkspaceMember >── Workspace
                             │
             ┌───────────────┼────────────────┐
             ↓               ↓                ↓
        SocialAccount     Content           Goal
             │               │                │
             │               ↓                ↓
             │          ContentVariant     Strategy
             │               │                │
             │               ↓                ↓
             │          Publication       Hypothesis
             │               │                │
             │               ↓                ↓
             │       PublishAttempt       Experiment
             │
             │
             └──────────────────────────────┐
                                            ↓
                                         Metrics
                                            ↓
                                         Evidence
                                            ↓
                                         Insight
                                            ↓
                                         Decision
```

## 17.3 Metrics Truthfulness Principle

When an external platform lacks authorization or capability to expose a requested metric:
```text
metric_value = NULL
metric_status = 'PERMISSION_LIMITED'
```
Scriora never stores `0` or guesses values for unavailable metrics. Storing `0` for an unpermitted metric is treated as data corruption.

## 17.4 Pre-Migration Schema Checklist (17 Open Items)

Before executing database migrations, the following 17 schema items must be explicitly confirmed:
1. Exact `WorkspaceMemberRole` enum values.
2. Exact `PlatformType` enum values across all supported networks.
3. Secret envelope encryption algorithm (`AES-256-GCM` key rotation strategy).
4. Full `Content` status lifecycle enum.
5. Exact structure of variant-level metadata (`target_duration_seconds`, `thread_order`).
6. Exact `Approval` request metadata and policy rules.
7. Exact `Experiment` schema and A/B variant cohorts.
8. Exact `Insight` schema and statistical confidence scores.
9. Exact `Decision` schema and actionable links.
10. Exact `Mission` lifecycle states and timeframes.
11. Exact `Memory` vector schema (pgvector vs JSON metadata).
12. Exact TimescaleDB relational hypertable schema for analytics.
13. Foreign-key cascading strategies (`CASCADE` vs `RESTRICT`).
14. Entity deletion and GDPR retention policies.
15. Unique constraints and indexing strategies for high-frequency queries.
16. Indexing strategy for outbox polling (`FOR UPDATE SKIP LOCKED`).
17. Final boundary for Agent vs Core memory ownership.

## 17.5 Confirmed Identity & Tenancy Schemas

### Table: `users`
```text
id               UUID PRIMARY KEY DEFAULT gen_random_uuid()
email            TEXT NOT NULL UNIQUE
name             TEXT NOT NULL
avatar_url       TEXT
auth_provider    TEXT NOT NULL DEFAULT 'local'
```

### Table: `workspaces`
```text
id                       UUID PRIMARY KEY DEFAULT gen_random_uuid()
name                     TEXT NOT NULL
slug                     TEXT NOT NULL UNIQUE
purpose                  TEXT NOT NULL  -- Confirmed values: PERSONAL, WORK, CLIENT, AGENT
default_operating_mode   TEXT NOT NULL DEFAULT 'MANUAL'
owner_user_id            UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT
country                  TEXT
timezone                 TEXT NOT NULL DEFAULT 'UTC'
```

### Table: `workspace_members`
```text
workspace_id     UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE
user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
workspace_role   TEXT NOT NULL  -- Confirmed roles: OWNER, ADMIN, EDITOR, VIEWER
PRIMARY KEY (workspace_id, user_id)
```

## 17.6 Database Extensions Timeline

- **Phase 1 (Classic GA):** `pgcrypto` for cryptographically strong UUID generation and column-level encryption functions.
- **Phase 2 (Agent & Mission Engine):** `pgvector` for cosine similarity memory search; `TimescaleDB` for high-throughput relational analytics snapshots.

## 17.7 Foreign-Key & Indexing Philosophy

1. **Referential Integrity:** Business-critical relationships enforce explicit foreign keys (`ON DELETE RESTRICT` for content/accounts to prevent accidental deletion, `ON DELETE CASCADE` for memberships and publish attempts).
2. **Tenant-Scoped Indexes:** Every high-cardinality table enforces composite indexes starting with `workspace_id` (e.g., `(workspace_id, created_at DESC)`, `(workspace_id, status)`).
3. **Unique Domain Constraints:** `users.email`, `workspaces.slug`, and `(workspace_id, platform, external_account_id)` are enforced at the database engine level.

## 17.8 Token Security & Controlled Decryption Pipeline

```text
Encrypted Secret Envelope (AES-256-GCM in PostgreSQL)
                 ↓
Controlled In-Memory Decryption (Token Service in Core)
                 ↓
Social Platform Adapter (scriora-social)
                 ↓
Official Social Network API (HTTPS)
```

**Zero Secret Leakage Invariant:** Credentials and decrypted tokens must never travel to Agent Runtime, LLM Context, Logs, Traces, Message Queues, Analytics Snapshots, or Client-Facing API Responses.

## 17.9 The Operational Publishing Chain (5-Layer Decoupling)

The core publishing pipeline enforces strict decoupling across 5 entities:

```text
Content        = WHAT creative asset will we publish?
ContentVariant = IN WHAT specific format / platform adaptation?
Publication    = WHERE and WHEN do we intend to publish?
PublishAttempt = WHAT occurred during a concrete execution attempt?
OutboxCommand  = HOW do we reliably trigger worker execution?
```

Refer to [`SCRIORA_DATABASE_CONTRACT.md`](SCRIORA_DATABASE_CONTRACT.md) for full physical DDL, indexing, foreign keys, and cross-tenant constraints.

---

# 18. State Model

## 18.1 Operation

``` text
ACCEPTED
PENDING
PROCESSING
SUCCEEDED
FAILED_RETRYABLE
FAILED_PERMANENT
UNKNOWN_EXTERNAL_STATE
CANCELLED
REQUIRES_APPROVAL
```

HTTP success must not be treated as business-operation success.

## 18.2 Publication Attempt

``` text
RESERVED
    ↓
DISPATCHING
    ↓
PLATFORM_PENDING
    ↓
SUCCEEDED

Failure branches:

DISPATCHING → FAILED_PERMANENT
DISPATCHING → RETRY
PLATFORM_PENDING → UNKNOWN_EXTERNAL_STATE
```

## 18.3 Unknown External State

`UNKNOWN_EXTERNAL_STATE` is a first-class state.

When the platform may have accepted the operation but Scriora cannot
prove the result:

``` text
Do NOT blindly publish again
        ↓
Reconcile
        ↓
Found → SUCCEEDED
Not provably found → remain UNKNOWN
        ↓
Human intervention when required
```

## 18.4 Why Two State Machines? (Business Attempt vs Delivery Outbox)

Scriora deliberately decouples:
1. **Business Attempt State (`publish_attempts`):** Represents the real-world business outcome on the social network (`RESERVED`, `DISPATCHING`, `PLATFORM_PENDING`, `SUCCEEDED`, `UNKNOWN_EXTERNAL_STATE`, `FAILED_PERMANENT`).
2. **Delivery Outbox State (`outbox_commands`):** Represents the internal reliable message delivery progress (`PENDING`, `PROCESSING`, `PUBLISHED`, `FAILED`).

### Architectural Benefit
If a network timeout yields `UNKNOWN_EXTERNAL_STATE` on the business attempt, the corresponding outbox command transitions to `FAILED` or `DEAD_LETTER`. This prevents internal queues from emitting duplicate `CREATE` requests, while a dedicated reconciliation workflow safely audits the external network state.

------------------------------------------------------------------------

# 19. Contract Models: Success & Error Contracts

## 19.1 Success Contract

HTTP transport success (e.g. `200 OK`, `201 Created`, `202 Accepted`) is merely an acknowledgement of message receipt and must never be treated as authoritative proof of business execution.

All asynchronous and external operations return a canonical operation contract shape:

``` json
{
  "operation": {
    "id": "op_123456789",
    "status": "SUCCEEDED",
    "platform": "linkedin",
    "external_id": "urn:li:share:71234567890",
    "external_url": "https://www.linkedin.com/feed/update/urn:li:share:71234567890",
    "verified": true,
    "timestamp": "2026-09-11T12:00:00Z",
    "metadata": {}
  }
}
```

Canonical operation lifecycle statuses:
- `ACCEPTED`: Request validated, persisted in transaction, and scheduled.
- `PENDING`: Outbox event committed, awaiting worker dispatch.
- `PROCESSING`: Worker actively interacting with external platform/provider.
- `SUCCEEDED`: External platform confirmed execution and verification passed.
- `FAILED_RETRYABLE`: Transient failure encountered; backoff retry scheduled.
- `FAILED_PERMANENT`: Non-retryable failure (invalid credentials, policy, validation).
- `UNKNOWN_EXTERNAL_STATE`: External call dispatched but result indeterminate; automated create retry forbidden.
- `CANCELLED`: Execution cancelled by authorized user or workflow condition.
- `REQUIRES_APPROVAL`: Operation gated pending human governance review.

## 19.2 Error Contract

Canonical error categories:

``` text
VALIDATION
AUTHENTICATION
AUTHORIZATION
NOT_FOUND
CONFLICT
RATE_LIMITED
EXTERNAL
TIMEOUT
INTERNAL
UNAVAILABLE
UNKNOWN_EXTERNAL_STATE
```

Canonical shape:

``` json
{
  "error": {
    "code": "SOCIAL_RATE_LIMITED",
    "message": "The social platform rate limit has been reached.",
    "category": "RATE_LIMITED",
    "retryable": true,
    "retry_after": 120,
    "request_id": "req_...",
    "operation_id": "op_...",
    "details": {}
  }
}
```

Interfaces may change presentation, but not semantic meaning.

------------------------------------------------------------------------

# 20. Retry / Recovery Model

Retry candidates normally include:

-   429;
-   temporary 5xx;
-   network failures;
-   temporary provider unavailability;
-   safe transient timeouts.

Retry uses:

``` text
Exponential Backoff
+ Jitter
+ Maximum Attempts
+ Idempotency
```

After retry exhaustion:

``` text
Retry exhausted
      ↓
DLQ / recoverable failure
```

Human intervention is required for cases such as:

-   unknown external state;
-   expired/revoked credentials;
-   missing publishing permission;
-   platform review/policy issues;
-   permanent account issues;
-   irreconcilable conflicts.

Human intervention is part of the state machine, not simply "the final
retry".

------------------------------------------------------------------------

# 21. Data Flow

## 20.1 Publishing

``` text
Web/API
   ↓
Authorize
   ↓
Validate
   ↓
Create Publication
   ↓
Create Attempt
   ↓
Create Outbox Event
   ↓
COMMIT
   ↓
Inngest
   ↓
Worker
   ↓
Social Adapter
   ↓
Official Platform API
   ↓
Verification
   ↓
Publication State
```

No external Social API call occurs inside the database transaction.

------------------------------------------------------------------------

# 22. Use Case Catalog

The complete functional surface of Scriora is formalized into 11 functional domains:

### 1. Foundation
- `UC-001` Register User
- `UC-002` Login
- `UC-003` Logout
- `UC-004` Create Workspace
- `UC-005` Invite Member
- `UC-006` Change Role
- `UC-007` Remove Member

### 2. Social Accounts
- `UC-010` Connect Social Account
- `UC-011` OAuth Callback
- `UC-012` Refresh Token
- `UC-013` Disconnect Account
- `UC-014` Reconnect Account
- `UC-015` Discover Capabilities
- `UC-016` Check Account Health

### 3. Content
- `UC-020` Create Draft
- `UC-021` Edit Draft
- `UC-022` Attach Media
- `UC-023` Create Platform Variant
- `UC-024` Adapt Content
- `UC-025` Duplicate Draft
- `UC-026` Delete Draft

### 4. Publishing
- `UC-030` Publish Now
- `UC-031` Schedule Publication
- `UC-032` Cancel Scheduled Publication
- `UC-033` Reschedule Publication
- `UC-034` Verify Publication
- `UC-035` Retry Failed Publication
- `UC-036` Reconcile Unknown Publication

### 5. Calendar / Queue
- `UC-040` View Calendar
- `UC-041` Move Scheduled Post
- `UC-042` Change Queue
- `UC-043` Bulk Schedule
- `UC-044` Bulk Cancel

### 6. Approvals
- `UC-050` Submit for Approval
- `UC-051` Approve Publication
- `UC-052` Reject Publication
- `UC-053` Request Changes
- `UC-054` Execute Approved Publication

### 7. Media
- `UC-060` Upload Media
- `UC-061` Transform Media
- `UC-062` Generate Thumbnail
- `UC-063` Compress Media
- `UC-064` Convert Video
- `UC-065` Delete Media

### 8. Analytics
- `UC-070` Sync Metrics
- `UC-071` View Post Metrics
- `UC-072` View Account Metrics
- `UC-073` View Workspace Analytics
- `UC-074` Compare Performance

### 9. Inbox
- `UC-080` Receive Webhook
- `UC-081` Ingest Comment
- `UC-082` Ingest Message
- `UC-083` Reply to Comment/Message
- `UC-084` Assign Conversation
- `UC-085` Mark Read

### 10. Growth Intelligence
- `UC-090` Create Goal
- `UC-091` Create Strategy
- `UC-092` Create Experiment
- `UC-093` Define Hypothesis
- `UC-094` Evaluate Result
- `UC-095` Create Insight
- `UC-096` Record Decision
- `UC-097` Update Learning Memory
- `UC-098` Generate Next Best Action

### 11. Mission / AI
- `UC-100` Activate Mission
- `UC-101` Generate Strategy
- `UC-102` Generate Content
- `UC-103` Request Human Approval
- `UC-104` Execute Approved Action
- `UC-105` Collect Evidence
- `UC-106` Learn From Result

## 22.1 Next Best Action (NBA) Scoring Formula

In `UC-098` and `UC-106`, recommendations for autonomous next steps are calculated deterministically via the canonical formula:

$$\\text{NBA Score} = (\\text{Impact} \\times \\text{Confidence}) - \\text{Cost} - \\text{Risk}$$

The highest scoring recommendation is submitted to the active Workspace Governance Policy for human approval or execution depending on the granted autonomy tier (L0 to L4).

## 22.2 Feature → Repository Matrix

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

------------------------------------------------------------------------

# 23. Use Case Test Specification Template & Worked Example

## 23.1 Test Specification Template

Every Use Case must define concrete verification behaviors across all state boundaries:

``` text
UC-ID: [Identifier]

Actor: [User / Agent / Worker / System]
Preconditions: [Authentication, Workspace Membership, Account State, Balance]
Input: [Schema-validated payload]
Happy Path: [Step-by-step authoritative state transitions]

Validation Failures: [Schema, constraints, incompatible media, expired tokens]
Permission Failures: [RBAC, cross-tenant isolation, lack of publishing approval]
Conflict Cases: [Idempotency key collision, concurrent publication lock]

External API Failures: [HTTP 400, 401, 403, 404, 409, 429, 500, 502, 503, Network Drop]
Timeout / Retry: [Exponential backoff parameters, max attempts, transient vs permanent]

Duplicate / Idempotency: [Deterministic replay of identical keys without side effects]
UNKNOWN_EXTERNAL_STATE: [Reconciliation protocol, no blind create retries]

Recovery: [DLQ routing, operator remediation, rollback]
Audit Events: [Structured immutable audit records emitted]
Final State: [Authoritative database record state]
```

## 23.2 Worked Example: UC-030 Publish Now

### 1. Happy Path
``` text
POST /api/v1/publications
  → API validates schema & verifies Workspace context
  → Authorize: actor possesses PUBLISH permission & account belongs to workspace
  → Core transaction:
      - Create Publication entity (status: PENDING)
      - Create PublishAttempt (status: RESERVED)
      - Insert OutboxEvent (type: PUBLICATION_DISPATCH)
      - COMMIT
  → Inngest receives Outbox event
  → Worker picks up job:
      - Claim attempt (FOR UPDATE SKIP LOCKED → status: DISPATCHING)
      - Call scriora-social adapter
      - Official Platform API executes upload & publish
      - Call verify() on platform
      - Worker updates Core state: Publication & Attempt → SUCCEEDED
      - Emit PUBLICATION_SUCCEEDED audit & analytics event
```

### 2. Validation Failures
- Empty content payload (`400 BAD_REQUEST`).
- Attached media does not conform to target platform aspect ratio or duration (`422 UNPROCESSABLE_ENTITY`).
- Target social account not connected or suspended (`400 BAD_REQUEST`).
- Platform options invalid for specified network (`422 UNPROCESSABLE_ENTITY`).

### 3. Permission Failures
- Actor is not a member of the active Workspace (`403 FORBIDDEN`).
- Actor role is Contributor without direct publish rights (`403 FORBIDDEN` / redirects to `UC-050 Submit for Approval`).
- Account belongs to different tenant (`404 NOT_FOUND` to prevent ID enumeration).

### 4. Conflict Cases
- Duplicate `Idempotency-Key` provided: return existing Publication attempt record immediately without creating a new entity.
- Concurrent publish triggered for same publication: `409 CONFLICT` via PostgreSQL optimistic locking / row lock.

### 5. External API Failures & Retry Matrix
- `429 Too Many Requests`: Extract `Retry-After` header, apply exponential backoff + jitter, schedule worker retry (up to max 5 attempts).
- `500 / 502 / 503 / 504`: Mark attempt as `FAILED_RETRYABLE`, backoff retry.
- `401 / 403 Token Expired`: Mark account as `AUTH_EXPIRED`, fail attempt as `FAILED_PERMANENT`, trigger account re-auth notification.
- Permanent policy error (e.g. spam flag, character limit exceeded): `FAILED_PERMANENT`, no retry.

### 6. UNKNOWN_EXTERNAL_STATE Handling
- If HTTP connection drops after sending payload to platform API or request times out:
  - Attempt status transitions to `UNKNOWN_EXTERNAL_STATE`.
  - AUTOMATED BLIND PUBLISH RETRY IS STRICTLY FORBIDDEN.
  - Background Reconciliation job scheduled: invokes `scriora-social.verify()` to probe platform feed.
  - If post is discovered on platform: update status to `SUCCEEDED`.
  - If post cannot be conclusively verified after timeout: escalate to Human Decision queue with full audit context.

------------------------------------------------------------------------

# 24. Test Architecture

## 24.1 Test Layers

Every repository uses the appropriate subset of:

``` text
Unit
Contract
Integration
Security
E2E
Regression
```

The goal is not to maximize test count. The goal is to place each
invariant at the cheapest reliable layer.

## 24.2 Per-Repository Test Pyramids

Each repository has an explicit distribution of testing weight tailored to its failure modes:

### `scriora-core`
``` text
                 E2E
              █████
          Regression
           ███████
       Security / RLS
         █████████
        Integration
       ███████████
      Contract Tests
     █████████████
          Unit
████████████████████
```
*Primary Weight:* Unit + DB/RLS Integration (Data integrity, multi-tenancy, state machines).

### `scriora-social`
``` text
             E2E / Real API
                ███
          Certification
             █████
        Integration
          ███████
      Contract Tests
        █████████
       Adapter Unit
████████████████████
```
*Primary Weight:* Adapter Unit + Contract Tests with mock providers. Real API E2E reserved for certification/nightly gates.

### `scriora-api`
``` text
              E2E
             ███
        Regression
          █████
       Security
        ██████
      Integration
       ████████
      Contracts
       ███████
         Unit
████████████████
```
*Primary Weight:* Request/Response schema validation, OpenAPI consistency, and RBAC security tests.

### `scriora-web`
``` text
              E2E
            █████
       Regression
         ███████
    Accessibility
      █████████
      Component
     ███████████
         Unit
████████████████
```
*Primary Weight:* Component behavior, accessibility (a11y/RTL), and critical Playwright user journeys.

### `scriora-worker`
``` text
             E2E
              ██
        Recovery
           ████
       Integration
         ██████
       Contract
        ███████
          Unit
████████████████
```
*Primary Weight:* Workflow durability, retry backoffs, idempotency, restart recovery, and outbox polling.

### `scriora-media`
``` text
          E2E
           █
      Integration
        ████
      Resource
       █████
      Contract
       ██████
         Unit
████████████████
```
*Primary Weight:* Transcoding accuracy, aspect ratio constraints, golden fixture regression, and resource safety bounds.

### `scriora-agent`
``` text
             E2E
              ███
          Evaluation
            █████
        Integration
          ███████
      Contract Tests
        █████████
       Deterministic
████████████████████
```
*Primary Weight:* Deterministic skill tests, schema validation, guardrail evaluation, and mock provider contract adherence.

------------------------------------------------------------------------

# 25. Global Test Matrix

  Area            Unit   Contract   Integration   Security   E2E   Regression
  ------------- ------ ---------- ------------- ---------- ----- ------------
  Core domain        ✓          ✓             ✓          ✓     ✓            ✓
  Social             ✓          ✓             ✓          ✓     ✓            ✓
  API                ✓          ✓             ✓          ✓     ✓            ✓
  Web                ✓          ✓             ✓        ---     ✓            ✓
  Worker             ✓          ✓             ✓          ✓     ✓            ✓
  Media              ✓          ✓             ✓          ✓     ✓            ✓
  Agent              ✓          ✓             ✓          ✓     ✓            ✓
  MCP                ✓          ✓             ✓          ✓     ✓            ✓
  CLI                ✓          ✓             ✓          ✓     ✓            ✓
  Docs               ✓          ✓           ---        ---   ---            ✓
  Cloud              ✓          ✓             ✓          ✓     ✓            ✓

------------------------------------------------------------------------

# 26. Core Test Matrix

Must cover:

-   domain invariants;
-   authorization;
-   tenant isolation;
-   RLS;
-   migration validation;
-   transaction behavior;
-   outbox atomicity;
-   idempotency;
-   publication state machine;
-   `UNKNOWN_EXTERNAL_STATE`;
-   retry/recovery;
-   approval state;
-   audit events;
-   cross-workspace isolation;
-   architecture dependencies.

------------------------------------------------------------------------

# 27. Social Test Matrix

Must cover:

-   contract validation;
-   platform registry;
-   capability schema;
-   adapter interface;
-   OAuth;
-   PKCE/state;
-   account discovery;
-   capability detection;
-   publishing;
-   verification;
-   metrics;
-   webhooks;
-   error mapping;
-   rate limits;
-   retries;
-   timeout;
-   network failure;
-   partial failure;
-   unknown state;
-   media constraints;
-   platform-specific features;
-   certification.

### New Platform Isolation Gate

A CI check must detect whether adding a platform unexpectedly modifies:

``` text
scriora-core
scriora-api
scriora-web
```

If it does, the change requires architectural review.

------------------------------------------------------------------------

# 28. API Test Matrix

Must cover:

-   OpenAPI validation;
-   OpenAPI ↔ implementation consistency;
-   request/response schemas;
-   authentication;
-   authorization;
-   workspace isolation;
-   RBAC;
-   rate limiting;
-   CORS/security headers;
-   pagination;
-   filtering;
-   sorting;
-   idempotency;
-   webhook verification;
-   API version compatibility;
-   integration;
-   E2E.

------------------------------------------------------------------------

# 29. Worker Test Matrix

Must cover:

-   Inngest functions;
-   workflow transitions;
-   retries;
-   timeouts;
-   cancellation;
-   restart recovery;
-   duplicate execution;
-   concurrent execution;
-   outbox processing;
-   scheduled execution;
-   publication failures;
-   unknown state reconciliation;
-   token refresh;
-   analytics sync;
-   webhook processing;
-   graceful shutdown.

------------------------------------------------------------------------

# 30. Media Test Matrix

Must cover:

-   MIME validation;
-   extension validation;
-   file size;
-   image transformations;
-   thumbnails;
-   compression;
-   video conversion;
-   codecs;
-   corrupted files;
-   unsupported codecs;
-   FFmpeg process safety;
-   CPU/memory/disk limits;
-   storage failure;
-   cleanup;
-   retries;
-   deterministic outputs.

Required aspect ratios:

``` text
1:1
4:5
16:9
9:16
```

------------------------------------------------------------------------

# 31. Agent Test Matrix

Must cover:

## Runtime

-   task lifecycle;
-   context assembly;
-   planning;
-   execution;
-   cancellation;
-   retry;
-   failure recovery.

## Skills

-   manifest validation;
-   input schema;
-   output schema;
-   permissions;
-   policy;
-   deterministic behavior where possible.

## Tools

-   authorization;
-   side effects;
-   idempotency;
-   error mapping;
-   approval enforcement.

## Providers

-   contract tests;
-   mock adapters;
-   malformed responses;
-   timeout;
-   rate limit;
-   provider failure;
-   provider fallback where supported.

## Safety

-   prompt injection boundaries;
-   unauthorized tool use;
-   permission escalation;
-   secret leakage;
-   token isolation;
-   policy bypass;
-   human-gate bypass.

## Evaluation

-   output quality;
-   hallucination checks;
-   structured-output validity;
-   evidence requirements;
-   regression evaluation.

------------------------------------------------------------------------

# 32. MCP Test Matrix

Must cover:

-   JSON-RPC;
-   MCP protocol compatibility;
-   tool schemas;
-   resources;
-   prompts;
-   authentication;
-   authorization;
-   workspace isolation;
-   idempotency;
-   errors;
-   malformed input;
-   Agent mocks;
-   prompt-injection boundaries;
-   API integration.

MCP must never bypass Core authorization.

------------------------------------------------------------------------

# 33. CLI Test Matrix

Must cover:

-   command parsing;
-   argument validation;
-   configuration;
-   authentication;
-   API compatibility;
-   exit codes;
-   snapshots;
-   packaging;
-   checksums;
-   release artifacts.

Target matrix:

``` text
Linux x64
Linux ARM64
macOS
Windows
```

------------------------------------------------------------------------

# 34. Documentation Test Matrix

Must cover:

-   Markdown lint;
-   broken links;
-   OpenAPI references;
-   code examples;
-   architecture references;
-   platform capability matrix;
-   version consistency;
-   installation instructions;
-   Docker/self-hosting instructions.

------------------------------------------------------------------------

# 35. Cloud Test Matrix

Must cover:

-   IAM;
-   secrets;
-   IaC;
-   billing idempotency;
-   payment webhook verification;
-   tenant isolation;
-   cloud authorization;
-   audit logging;
-   backup;
-   restore;
-   migration safety;
-   canary deployment;
-   rollback;
-   production smoke tests.

------------------------------------------------------------------------

# 36. Social Platform Certification Matrix

Every platform gets a certification record.

``` text
Platform
├── OAuth
├── Account Discovery
├── Text
├── Image
├── Video
├── Carousel
├── Scheduling
├── Publish
├── Verify
├── Metrics
├── Webhooks
├── Rate Limits
├── Failure Recovery
├── Media Constraints
└── Platform-specific Capabilities
```

Statuses should distinguish:

``` text
UNKNOWN
MOCKED
CONTRACT_VERIFIED
INTEGRATION_VERIFIED
REAL_API_VERIFIED
CERTIFIED
DEPRECATED
```

------------------------------------------------------------------------

# 37. Cross-Repository Regression

Cross-repository CI must validate the most important contracts.

Examples:

``` text
Core ↔ API
Core ↔ Worker
Social ↔ Worker
Social ↔ API
Media ↔ Worker
Agent ↔ Core
Agent ↔ Social
Agent ↔ Media
MCP ↔ API
CLI ↔ API
```

Real third-party API E2E tests must not run on every pull request.

They belong in:

-   certification;
-   scheduled/nightly tests;
-   release gates;
-   controlled integration environments.

------------------------------------------------------------------------

# 38. Security Baseline

Every repository must include appropriate shared checks:

-   secret scanning;
-   dependency vulnerability scanning;
-   static analysis;
-   CodeQL where applicable;
-   dependency lockfile integrity;
-   dangerous postinstall detection;
-   license compatibility;
-   sensitive-file detection;
-   required repository files;
-   permission validation.

Security-critical systems additionally test:

``` text
Tenant isolation
RLS
Authorization
Token isolation
Secret handling
Prompt injection boundaries
Agent permissions
```

Tokens must never enter LLM context.

------------------------------------------------------------------------

# 39. Standard Repository Governance

Public repositories should contain:

``` text
README.md
ARCHITECTURE.md
CONTRIBUTING.md
SECURITY.md
CODE_OF_CONDUCT.md
CODEOWNERS
LICENSE
CHANGELOG.md
.github/
├── workflows/
├── ISSUE_TEMPLATE/
└── PULL_REQUEST_TEMPLATE.md
```

## 39.1 Definition of Done — Repository Change

A change across any repository is not considered complete or mergeable until the following 8 criteria are fulfilled:

``` text
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
```

------------------------------------------------------------------------

# 40. CI Architecture

Shared CI workflows should be reusable rather than copied between
repositories.

Common gates:

``` text
Format
Lint
Typecheck
Tests
Dependency validation
Dead-code detection
Secret scanning
Dependency security
Lockfile validation
Static security analysis
Required-file validation
```

Repository-specific checks remain in each repository.

------------------------------------------------------------------------

# 41. Versioning

Repositories may version independently.

Example:

``` text
@scriora/core
@scriora/social
@scriora/media
@scriora/agent
```

There is no requirement for all repositories to share one version.

Breaking changes require:

``` text
ADR
 ↓
Compatibility Analysis
 ↓
Contract Tests
 ↓
Migration Plan
 ↓
Documentation
 ↓
Release
```

A compatibility matrix must document supported combinations.

------------------------------------------------------------------------

# 42. Commit Convention

``` text
<type>(<scope>): <description>
```

Types:

``` text
feat
fix
docs
test
refactor
perf
build
ci
chore
revert
```

Examples:

``` text
feat(social): add Instagram carousel publishing
fix(core): prevent cross-workspace publication access
feat(api): add publication status endpoint
test(worker): cover retry exhaustion
fix(media): reject unsupported video codec
feat(agent): add content-generation skill
docs(social): document TikTok capabilities
```

Breaking:

``` text
feat(social)!: change publish contract
```

with:

``` text
BREAKING CHANGE:
```

------------------------------------------------------------------------

# 43. Branch Convention

``` text
feat/instagram-carousel
fix/rls-workspace-leak
test/linkedin-contract
refactor/social-registry
docs/contributing
chore/ci-security
arch/social-framework-v2
```

------------------------------------------------------------------------

# 44. Pull Request Rules

Every significant PR should contain:

-   Summary;
-   Why;
-   Changes;
-   Tests;
-   Security impact;
-   Breaking changes;
-   Migration requirements;
-   Documentation impact.

Avoid large unrelated PRs.

------------------------------------------------------------------------

# 45. Critical End-to-End Journeys

## Journey 1 (E2E-01) --- Workspace & Account Onboarding
``` text
Register
→ Login
→ Create Workspace
→ Connect Social Account
→ OAuth Flow
→ Callback
→ Account Discovery
→ Capability Detection
→ Account Status: Healthy
→ Dashboard Ready
```

## Journey 2 (E2E-02) --- LinkedIn Connection & Health
``` text
Connect LinkedIn
→ OAuth 2.0 PKCE Handshake
→ Scope Authorization
→ Callback Handling
→ Encrypted Token Persistence
→ Account Appears in Settings
→ Capability Matrix Populated
→ Health Status: HEALTHY
```

## Journey 3 (E2E-03) --- Immediate Publish with Media
``` text
Create Draft
→ Upload Media (Image/Video)
→ Validate & Transform Media (Aspect ratio, limits)
→ Select Target Accounts
→ Click Publish Now
→ Core Transaction (Publication, Attempt, Outbox Event)
→ Worker picks up Outbox Event
→ Social Adapter dispatches to Platform API
→ Platform responds with external ID
→ Verification pass
→ Status: SUCCEEDED
```

## Journey 4 (E2E-04) --- Scheduled Publication & Queue
``` text
Create Post
→ Set Future Timestamp
→ Calendar View Reflects Scheduled Post
→ Time Reached
→ Inngest Durable Workflow Triggers
→ Worker Claims Attempt (FOR UPDATE SKIP LOCKED)
→ Social Adapter Publishes
→ Platform Confirms
→ Publication Status: SUCCEEDED
```

## Journey 5 (E2E-05) --- Multi-Level Approval Workflow
``` text
Contributor Creates Post
→ Submits for Approval
→ Post Locked in REQUIRES_APPROVAL state
→ Approver Reviews: Rejects with feedback
→ Contributor Edits Draft addressing feedback
→ Resubmits for Approval
→ Approver Approves
→ Automatic Transition to Scheduled/Publishing Queue
→ Successful Publication Execution
```

## Journey 6 (E2E-06) --- External Timeout & Reconciliation (UNKNOWN_EXTERNAL_STATE)
``` text
Publish Triggered
→ Worker dispatches to External Platform API
→ Network connection drops / HTTP 504 Gateway Timeout
→ State transitions to UNKNOWN_EXTERNAL_STATE
→ Automated create retry is BLOCKED
→ Reconciliation job queries platform feed
→ Verification discovers post published successfully
→ Status resolved to SUCCEEDED without duplicate publishing
```

## Journey 7 (E2E-07) --- Rate Limiting (429) & Exponential Backoff
``` text
Publish Dispatched
→ Platform returns HTTP 429 Too Many Requests with Retry-After: 60
→ Status: FAILED_RETRYABLE
→ Worker respects rate-limit contract
→ Inngest schedules retry with exponential backoff + jitter
→ Retry execution dispatched after backoff window
→ Platform accepts request
→ Verification confirms
→ Status: SUCCEEDED
```

## Journey 8 (E2E-08) --- Permanent Failure Handling (FAILED_PERMANENT)
``` text
Publish Dispatched
→ Platform returns HTTP 403 (Account suspended / OAuth token revoked)
→ Classification: FAILED_PERMANENT (Non-retryable)
→ No blind retry loops executed
→ Account health marked AUTH_EXPIRED
→ Notification dispatched to Workspace Admins
→ Publication marked FAILED_PERMANENT with structured error payload
```

## Journey 9 (E2E-09) --- Webhook Ingestion & Unified Inbox
``` text
External Social Platform Webhook Event (Comment/Mention)
→ API Gateway verifies HMAC-SHA256 signature
→ Ingestion into Outbox
→ Worker processes webhook event
→ Normalize to canonical InboxItem contract
→ Stored in Core DB with Workspace isolation
→ Displayed in Web UI Unified Inbox
```

## Journey 10 (E2E-10) --- Analytics & Metrics Synchronization
``` text
Scheduled Worker Cron triggers Metrics Sync
→ Social Adapter calls Platform Insights API
→ Metrics data normalized to canonical Analytics schema
→ Persisted in Core Analytics tables
→ Aggregations computed
→ Real-time metrics reflected on Web UI Dashboard
```

## Journey 11 (E2E-11) --- Growth Loop Execution
``` text
Define Growth Goal
→ Formulate Strategy
→ Formulate Hypothesis
→ Generate Content Variant
→ Human Review & Approval
→ Publish Post
→ Collect Real Engagement Metrics
→ Evidence Aggregation
→ Synthesize Insight
→ Update Workspace Learning Context
→ Propose Next Best Action
```

## Journey 12 (E2E-12) --- Autonomous Agent Mission
``` text
User Activates Mission
→ Agent Evaluates Goal & Workspace Memory
→ Agent Formulates Multi-Step Plan
→ Skill Selection (e.g. content-generation, media-adaptation)
→ Agent Drafts Strategic Post Proposal
→ Human Governance Gate (Approval required by Policy L3)
→ Human Approves Proposal
→ Agent invokes tool: social.publish via Core Application Contract
→ Execution completes through Outbox & Worker
→ Evidence collected & Mission Learning loop updated
```

------------------------------------------------------------------------

# 46. What Changes When Adding a New Social Platform?

Expected:

``` text
scriora-social
├── adapters/<platform>
├── platforms/<platform>
├── capability definitions
└── tests/certification
```

Potentially:

``` text
shared contract change
```

only if the platform exposes a genuinely new reusable capability.

Unexpected and requiring architectural review:

``` text
scriora-core change
scriora-api change
scriora-web change
scriora-agent change
```

The objective is not to make these changes impossible. The objective is
to make them exceptional and explicit.

------------------------------------------------------------------------

# 47. What Changes When Adding a New Agent Skill?

Expected:

``` text
scriora-agent
└── skills/<skill>
```

Possibly:

``` text
new tool contract
new provider capability
new evaluation
```

It should not require Social Platform code unless the Skill truly
depends on a new Social capability.

------------------------------------------------------------------------

# 48. What Changes When Adding a New AI Provider?

Expected:

``` text
scriora-agent
└── providers/
    └── <provider-adapter>
```

The provider must implement an existing contract.

If it cannot implement an existing contract, the contract must be
reviewed before expanding it.

------------------------------------------------------------------------

# 49. What This Baseline Explicitly Rejects

This architecture rejects:

-   putting every subsystem in `scriora-core`;
-   putting Social adapters inside the Agent;
-   letting MCP duplicate domain logic;
-   allowing Web to directly access the database;
-   making Redis authoritative for business state;
-   using BullMQ and Inngest as competing primary workflow systems;
-   creating a separate repository for every Skill;
-   binding the Agent to one AI provider;
-   binding media generation to one vendor;
-   letting AI bypass authorization or human-governance rules;
-   treating HTTP 200 as proof of successful external execution;
-   retrying uncertain external publications blindly;
-   calling every feature "microservice" merely because it has a
    repository.

------------------------------------------------------------------------

# 50. Final Architecture Principle

Scriora is organized around **ownership and contracts**, not arbitrary
code splitting.

The target is:

``` text
Stable Core
     +
Independent Social Platform Framework
     +
Independent Media Infrastructure
     +
Independent Agent Framework
     +
Independent Interfaces
     +
Independent Cloud Layer
```

while maintaining:

``` text
One Product
One Domain
One Security Model
One Contract System
One Observable Execution Model
```

## 50.1 Critical Architectural Invariants

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

## 50.2 Final Product Loop

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

## 50.3 Autonomous Mission Closed-Loop Growth Architecture

Scriora's growth intelligence decouples business intent from agent execution:

```text
Business Domain (scriora-core)              Execution Telemetry (scriora-agent)
───────────────────────────────              ───────────────────────────────────
Mission (Commercial Objective)
   ↓
Goal (Measurable Target / KPI)
   ↓
Strategy (Channel Mix & Voice v1..vn)
   ↓
GrowthHypothesis (Testable Proposition)
   ↓
Experiment (A/B Protocol & Allocation)
   ↓
EvidenceRecord (Empirical Observation)
   ↓
Insight (CORRELATED vs CAUSAL deduction)
   ↓
Decision (Business Action Directive)  ──►  AgentTask (Operational Execution Unit)
   ↓                                            ↓
Business Memory (Permanent Knowledge)       SkillExecution (Deterministic / AI)
                                                ↓
                                            ProviderRun (LLM / Image / Video API)
```

Refer to [`SCRIORA_DATABASE_CONTRACT.md`](SCRIORA_DATABASE_CONTRACT.md) (Part II & Part III) for physical schemas, foreign keys, unique constraints, and non-cascading retention policies.

## 50.4 The 7-Layer Semantic Separation Invariant

Scriora rigorously isolates business intent, temporal observation, empirical proof, machine deduction, and execution:

```text
1. Approval          = Formal Human Decision Record (Bound immutably to resource_version)
2. AnalyticsSnapshot = Temporal Point-in-Time Observation (Append-only immutable record)
3. AnalyticsMetric   = Individual Measured Quantitative Fact (NULL on PERMISSION_DENIED; never 0)
4. EvidenceRecord    = Traceable Input for Machine Reasoning (Ground truth empirical data)
5. Insight           = Semantic Interpretation Grounded in Evidence (CORRELATED vs CAUSAL)
6. Decision          = Commercial Action Directive (Business state owned by Core)
7. AgentTask         = Autonomous Execution Unit (Telemetry owned by Agent)
```

------------------------------------------------------------------------

# 51. Non-Negotiable Architecture Invariants

The following 20 architectural invariants are non-negotiable across all repositories and implementations:

1. `scriora-core` remains framework-independent from Web/API/Social/Agent implementations.
2. `scriora-social` owns Social Platform integrations.
3. `scriora-agent` owns Agent Runtime, Skills, Tools, Memory, Policies and AI providers.
4. `scriora-media` owns media processing, not generation intelligence.
5. `scriora-api` is the HTTP boundary.
6. `scriora-worker` owns durable asynchronous execution.
7. `scriora-mcp` is an interface, not an Agent brain.
8. `scriora-web` never accesses the database directly.
9. PostgreSQL is the source of truth.
10. Redis is not the source of truth.
11. Inngest is the primary durable workflow mechanism.
12. `UNKNOWN_EXTERNAL_STATE` is a first-class state.
13. Agents cannot bypass authorization or approval.
14. Social adapters cannot contain product-domain logic.
15. Skills are not repositories.
16. Adding a platform should normally be isolated to `scriora-social`.
17. Adding a Skill should normally be isolated to `scriora-agent`.
18. Adding an AI provider should normally require only a provider adapter + certification.
19. Repository boundaries do not automatically imply microservices.
20. Public contracts must be versioned and tested.

---

# 52. Approval Gate

`SCRIORA_SPEC.md` must not be rebuilt until this baseline is approved.

Approval means accepting:

-   the 11-repository topology;
-   repository ownership;
-   dependency direction;
-   Social Platform Framework;
-   Agent Framework;
-   provider abstraction;
-   contract matrix;
-   state model;
-   error model;
-   test architecture;
-   certification process;
-   versioning rules.

After approval, the master specification is rebuilt to conform to this
document.

------------------------------------------------------------------------

# Appendix A --- Current Architectural Source Alignment

The existing specification already establishes several principles that
this baseline preserves:

-   Scriora is intended as both a full social-management product and
    developer/AI infrastructure.
-   Classic Mode and Mission Mode are first-class product modes.
-   AI should initially use deterministic mocks/stubs and live provider
    keys should be delayed.
-   MCP should expose high-level semantic capabilities without
    duplicating domain execution.
-   PostgreSQL, transactional outbox, durable workflows, tenant
    isolation and `UNKNOWN_EXTERNAL_STATE` are central reliability
    principles.
-   The previous specification places Social and Agent packages inside
    `scriora-core`; this baseline intentionally relocates those
    responsibilities into `scriora-social` and `scriora-agent`
    respectively.

The existing specification also contains a repository structure that is
now superseded by this baseline. The baseline is the authority for
repository boundaries; the detailed product specification must be
regenerated accordingly.

------------------------------------------------------------------------

# Appendix B --- Next Document Set

After approval, the architecture work should produce:

``` text
01-SCRIORA_ARCHITECTURE_BASELINE.md        ← this document
02-SCRIORA_REPOSITORY_SPEC.md
03-SCRIORA_CONTRACTS.md
04-SCRIORA_SOCIAL_PLATFORM_FRAMEWORK.md
05-SCRIORA_AGENT_FRAMEWORK.md
06-SCRIORA_MEDIA_FRAMEWORK.md
07-SCRIORA_TEST_STRATEGY.md
08-SCRIORA_STATE_AND_ERROR_MODEL.md
09-SCRIORA_COMPATIBILITY_MATRIX.md
10-SCRIORA_SPEC.md                          ← rebuilt master specification
```

These documents should reference the baseline rather than redefining its
decisions.
