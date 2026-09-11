# Scriora — Agent Framework

> **Status:** Canonical Platform Architecture Specification (Agent Framework 100% Complete)  
> **Role:** Independent Cognitive Architecture, Autonomous Planning Engine & Growth Operating System  
> **Core Principle:** The Agent can think, plan, propose, and execute permitted actions through tools, but possesses **Zero Business Authority**. Business truth and state reside strictly in `scriora-core`.

---

# 1. Purpose & Strategic Goal

`scriora-agent` is an **independent Agent Framework** within Scriora.

Its core objective is to elevate Scriora from a conventional Social Management Platform into an autonomous **Growth Operating System** capable of:
- Understanding high-level commercial **Missions**
- Analyzing quantitative goals, baselines, and empirical results
- Formulating data-grounded **Strategies**
- Articulating falsifiable **Hypotheses**
- Designing comprehensive **Content Plans**
- Generating multi-channel **Content Assets**
- Adapting content precisely to platform-specific constraints
- Proposing rigorous **Experiments (A/B & Multi-Variant)**
- Analyzing empirical **Evidence** from real-world analytics
- Synthesizing actionable, causal **Insights**
- Proposing strategic **Decisions**
- Executing permitted, policy-compliant **Actions**
- Continuously closing the **Learning Loop** from measured outcomes
- Operating strictly within **Human Governance Boundaries**

### The Supreme Operating Law
> **The Agent can reason, plan, and execute via permitted tools, but it holds zero business authority.**

---

# 2. System Architecture Placement

The operational pipeline flows strictly through gated boundaries:

```text
User Intent
    ↓
Mission
    ↓
Agent Runtime
    ↓
Plan
    ↓
Skills
    ↓
Tools
    ↓
Policy Check
    ↓
Human Approval Gate
    ↓
Execution
    ↓
Evidence
    ↓
Learning
```

### Prohibited Direct Paths
There is **NEVER** a direct unmediated connection:
```text
Prompt ──► LLM ──► Social API   (STRICTLY FORBIDDEN)
Agent  ──► Core Database        (STRICTLY FORBIDDEN)
```

---

# 3. Business Truth & Authority Boundaries

The Agent is strictly an intelligence, reasoning, and planning layer:

| Permitted Agent Actions | Forbidden Agent Authorities |
| :--- | :--- |
| Read approved context | Workspace multi-tenant ownership |
| Analyze metrics & evidence | Authorization & RLS rules |
| Propose hypotheses & strategies | Publication state ledger |
| Plan experiments & content | Unilateral approval authority |
| Request tool execution | Commercial billing & subscription state |
| Execute policy-permitted actions | Social network credentials & OAuth tokens |

Business truth, tenant isolation, and authority belong strictly to the underlying core architecture.

---

# 4. Framework Responsibilities & Ownership

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        OWNED BY scriora-agent                          │
├────────────────────────────────────────────────────────────────────────┤
│ • Agent Runtime & Orchestration      • Provider Routing Engine         │
│ • Execution Loop & Task Runner       • LLM Provider Contracts          │
│ • Planning Engine & Context Assembly • Image/Video Provider Contracts  │
│ • Skill Model & Skill Registry       • Multimodal Generation Pipelines │
│ • Tool Contracts & Execution Engine  • Structured Output Validation    │
│ • Policy & Governance Engine         • Agent Observability & Tracing   │
│ • Mission Execution Lifecycles       • Deterministic AI Stubs          │
│ • 6-Tier Memory Integration          • Agent-Owned Persistence         │
│ • Evaluation & Benchmark Suites      • Human Approval Request Triggers │
└────────────────────────────────────────────────────────────────────────┘
```

### Explicitly Excluded (Must Not Own)
- Social Platform SDKs & API Adapters (Owned by `scriora-social`)
- Core Business Entities, Relational Schema & Migrations (Owned by `scriora-core`)
- OAuth Token Vault & Secrets Storage (Owned by `scriora-core`)
- Database Row Level Security (RLS) policies
- HTTP Routing & Client Webhook Ingress (Owned by `scriora-api`)
- Frontend Presentation & Web UI (Owned by `scriora-web`)
- MCP Wire Transport & Server Daemons (Owned by `scriora-mcp`)
- Media Transcoding & Storage Infrastructure (Owned by `scriora-media`)
- Commercial Stripe Billing & Plans (Owned by `scriora-core`)

---

# 5. High-Level Agent Architecture

```text
┌───────────────────────────────────────────────────────────────────────┐
│                           Agent Runtime                               │
├───────────────────────────────────────────────────────────────────────┤
│ • Planning Engine                 • Task Runner & State Machine       │
│ • Autonomous Execution Loop       • Context Assembly Engine           │
│ • Agent Orchestration             • Deterministic First Evaluation    │
└───────────────────────────────────┬───────────────────────────────────┘
                                    │
               ┌────────────────────┼────────────────────┐
               ▼                    ▼                    ▼
            Skills                Tools               Policies
               │                    │                    │
               └────────────────────┼────────────────────┘
                                    ▼
                         Application Contracts
                                    │
               ┌────────────────────┼────────────────────┐
               ▼                    ▼                    ▼
          scriora-core       scriora-social       scriora-media
                                    │
                                    ▼
                        Model & Media Providers
               (OpenAI, Anthropic, Gemini, Replicate, Stubs)
```

---

# 6. Agent Runtime Core Responsibilities

The Runtime is the cognitive execution heart of `scriora-agent`. It manages:
1. Instantiating and tracking `AgentTask` lifecycles
2. Assembling minimal, privacy-compliant execution contexts
3. Executing the recursive planning loop
4. Discarding hallucinated or out-of-scope actions
5. Invoking deterministic or AI-driven skills
6. Enforcing tool contracts and evaluating policy rules
7. Halting on mandatory Human Approval requirements
8. Recording execution evidence, latencies, and token expenditures
9. Handling graceful failures, backoff retries, and reconciliations
10. Producing clean, verifiable evidence for the continuous learning loop

*The Runtime contains zero hardcoded business domain rules.*

---

# 7. The Autonomous Execution Loop

```text
Receive Task
    │
    ▼
Load Context (Filtered, Ranked & Compressed)
    │
    ▼
Check Governance Policy
    │
    ▼
Formulate Plan
    │
    ▼
Validate Plan Structure & Feasibility
    │
    ▼
Execute Step ──► [Approval Required?] ──► YES ──► PAUSE ──► Human Decision
    │                                                               │
    │ NO                                                            ▼
    ▼                                                     Resume / Reject / Revise
Observe Step Result
    │
    ▼
Evaluate Progress Against Task Goal
    │
    ▼
Decision: Continue / Revise Plan / Complete / Abort
```

---

# 8. Agent Task Concept

An `AgentTask` represents a discrete, durable, and auditable unit of cognitive execution.
Every `AgentTask` is logically bound to:
- `workspace_id` (Mandatory tenant isolation boundary)
- `mission_id` (Parent commercial growth objective)
- `goal_id` (Target quantitative metric)
- `decision_id` (Originating strategic rationale, if applicable)
- `skill_name` & `skill_version` (Invoked capability)
- `execution_id` (Durable correlation tracking)

---

# 9. Agent Task Lifecycle State Machine

```text
┌─────────┐     ┌──────────┐     ┌──────────────────┐     ┌───────────┐
│ PENDING ├───► │ PLANNING ├───► │ WAITING_APPROVAL├───► │ EXECUTING │
└─────────┘     └──────────┘     └─────────┬────────┘     └─────┬─────┘
                                           │                    │
                                           ▼                    ▼
                                      ┌───────────┐        ┌─────────┐
                                      │ CANCELLED │        │ PAUSED  │
                                      └───────────┘        └────┬────┘
                                                                │
                               ┌────────────────────────────────┴───────┐
                               ▼                                        ▼
                       ┌───────────────┐                        ┌───────────────┐
                       │   SUCCEEDED   │                        │ FAILED_RETRY  │
                       └───────────────┘                        └───────┬───────┘
                                                                        ▼
                                                                ┌───────────────┐
                                                                │ FAILED_PERM   │
                                                                └───────────────┘
```

### Core Tracking Fields
- `current_step`: Zero-indexed execution pointer
- `attempt_count`: Current retry cycle count
- `started_at`: Timestamp of task initialization
- `completed_at`: Nullable termination timestamp
- `failure_reason`: Canonical failure code and diagnostic explanation

---

# 10. Invariant: AgentTask ≠ Decision

```text
Business Decision (scriora-core)
≠
Execution Task (scriora-agent)
```

- **Decision (Core Business Object):** "Increase LinkedIn carousel publication frequency to capture qualified enterprise leads."
- **AgentTask (Agent Execution Unit):** "Generate 5 educational carousel concepts tailored to the CTO audience."
- **SkillExecution (Skill Invocation Unit):** "Execute `skill:content-generation:v2` using Claude 3.5 Sonnet to draft Carousel #1."

---

# 11. Skill Execution Tracking

Every skill invocation produces an immutable execution audit record:

```text
SkillExecution
 ├── task_id: UUID
 ├── skill_name: String
 ├── skill_version: String
 ├── input_reference: URI / ContentHash
 ├── output_reference: URI / ContentHash
 ├── status: Succeeded | Failed | Aborted
 ├── duration_ms: Integer
 ├── provider_usage: { tokens_in, tokens_out, cost_usd }
 └── errors: Nullable Canonical Error Object
```

*Raw, voluminous context prompts are NEVER stored inside persistent transaction logs.*

---

# 12. Skills Specification

A Skill is an engineered, deterministic, or AI-driven capability. **A Skill is NOT a prompt.**
Every registered Skill must formally define:
- `Name`: Globally unique capability identifier
- `Purpose`: Concise explanation of what business problem it solves
- `Input Schema`: Strict JSON/Zod validated input contract
- `Output Schema`: Strict JSON/Zod validated output contract
- `Permissions`: Mandatory security entitlements required for execution
- `Required Capabilities`: Platform or infrastructure prerequisites
- `Policy Requirements`: Constraints, max budget, and autonomy gates
- `Side Effects`: Explicit declaration of internal/external side effects
- `Cost Characteristics`: Estimated token, model, or compute footprint
- `Execution Type`: Deterministic vs AI-driven
- `Evaluation Rules`: Falsifiable quality, formatting, and safety tests
- `Version`: Semantic version string (`v1.0.0`)

---

# 13. Skill Taxonomy

```text
                        ┌────────────────────────┐
                        │      Skill Types       │
                        └───────────┬────────────┘
                                    │
           ┌────────────────────────┴────────────────────────┐
           ▼                                                 ▼
┌───────────────────────┐                         ┌───────────────────────┐
│  Deterministic Skills │                         │       AI Skills       │
├───────────────────────┤                         ├───────────────────────┤
│ • Content Adaptation  │                         │ • Market Research     │
│ • Schedule Calculation│                         │ • Strategy Generation │
│ • Constraint Checking │                         │ • Content Generation  │
│ • Metric Aggregation  │                         │ • Insight Synthesis   │
│ • Experiment Math     │                         │ • Decision Proposal   │
│ • Data Validation     │                         │ • Hypothesis Modeling │
└───────────────────────┘                         └───────────────────────┘
```

---

# 14. The Deterministic-First Invariant

> **If an operation can be solved deterministically, it is STRICTLY FORBIDDEN to invoke an LLM.**

- Checking if a post exceeds 280 characters does NOT require an LLM.
- Calculating an average engagement rate does NOT require an LLM.
- Validating image aspect ratio does NOT require an LLM.

### Architectural Benefits
1. **Zero Hallucination Risk**
2. **Sub-millisecond Latency**
3. **Zero Token Cost**
4. **100% Predictable Test Coverage**

---

# 15. Skill Versioning

Every Skill maintains strict semantic versioning (`v1.0`, `v2.1`).
This allows the Growth Engine to attribute commercial outcomes directly:
- "Did `skill:content-generation:v1` or `v2` produce higher qualified conversion?"
- "Which model provider under `v2` achieved superior engagement per dollar spent?"

---

# 16. Skill Contract Specifications

Every Skill is bound by an immutable interface contract:
```typescript
interface SkillContract<TInput, TOutput> {
  name: string;
  version: string;
  type: "deterministic" | "ai";
  inputSchema: ZodSchema<TInput>;
  outputSchema: ZodSchema<TOutput>;
  requiredPermissions: Permission[];
  policyConstraints: PolicyRule[];
  execute(context: ExecutionContext, input: TInput): Promise<SkillResult<TOutput>>;
}
```

Skills are strictly prohibited from bypassing their defined schemas or mutating unapproved state.

---

# 17. Tools Definition & Ecosystem

Tools are the Agent's controlled, policy-gated interface to the external world and internal applications:

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        Canonical Tool Registry                         │
├────────────────────────────────────────────────────────────────────────┤
│ social.publish           content.create_draft    analytics.query       │
│ social.schedule          content.adapt_variant   analytics.compare     │
│ social.verify            media.generate_image    workspace.get_context │
│ social.get_metrics       media.transform         approval.request      │
└────────────────────────────────────────────────────────────────────────┘
```

---

# 18. Tool Contract Specifications

Every tool invocation must define:
- `Input Schema`: Rigid parameter validation contract
- `Output Schema`: Guaranteed return structure
- `Required Permissions`: RBAC security gates
- `Side Effects`: Explicit declaration (`None`, `Local Write`, `External Side Effect`)
- `Idempotency`: Whether repeated calls with the same key produce identical results
- `Approval Requirement`: Boolean / Policy condition demanding human signoff
- `Failure Behavior`: Retryable vs Terminal classifications

---

# 19. Invariant: Tool ≠ Skill

```text
Skill = What the Agent knows how to accomplish (Strategy / Capability).
Tool  = What the Agent is permitted to invoke to interact with reality.
```

*Example:*
- **Skill:** "Execute B2B Lead Generation Campaign"
- **Tools Invoked:**
  1. `analytics.query` (Read performance baseline)
  2. `content.create_draft` (Store draft variants)
  3. `approval.request` (Prompt marketing director for review)
  4. `social.schedule` (Queue verified publication post-approval)

---

# 20. Tool Permissions & RBAC Gates

A tool cannot be invoked simply because an Agent "knows" its signature.
The Runtime executes an atomic authorization check before tool invocation:
1. Does the calling user/agent possess the required workspace role?
2. Has the workspace enabled this platform integration?
3. Is the target resource within the current tenant boundary?

---

# 21. Tool Side Effects Classification

Every tool explicitly declares its side effect magnitude:
- `READ`: Zero mutation, zero external calls (e.g., `analytics.query`).
- `LOW_RISK_WRITE`: Local draft creation, non-public modifications (e.g., `content.create_draft`).
- `EXTERNAL_ACTION`: Interacts with live 3rd-party networks (e.g., `social.schedule`).
- `HIGH_IMPACT_ACTION`: Live irreversible publishing or financial expenditure (e.g., `social.publish`).

*Higher side-effect tiers enforce exponentially stricter governance policies.*

---

# 22. Tool Risk Levels

```text
   Impact Level             Representative Tool            Governance Gate
┌───────────────────┬───────────────────────────────┬────────────────────────────┐
│ READ              │ analytics.query               │ Workspace Policy Check     │
├───────────────────┼───────────────────────────────┼────────────────────────────┤
│ LOW_RISK_WRITE    │ content.create_draft          │ Autonomy Level L2+ Check   │
├───────────────────┼───────────────────────────────┼────────────────────────────┤
│ EXTERNAL_ACTION   │ social.schedule               │ Policy Check + L3/L4 Rule  │
├───────────────────┼───────────────────────────────┼────────────────────────────┤
│ HIGH_IMPACT_ACTION│ social.publish (Direct)       │ Mandatory Human Approval   │
└───────────────────┴───────────────────────────────┴────────────────────────────┘
```

---

# 23. The Policy Governance Layer

The Policy Layer is the sovereign governance engine of `scriora-agent`. It specifies:
- What the Agent may attempt
- Under what conditions it may execute
- Which actions strictly mandate Human Approval
- What content categories or platforms are forbidden
- How much money and how many tokens may be spent
- Which sensitive attributes may NEVER enter model prompts

---

# 24. Policy Rule Categories

1. **Autonomy Policy:** Dynamic autonomy level ceilings
2. **Approval Policy:** Triggers for external human gates
3. **Safety Policy:** Brand safety, toxicity, and taboo phrase enforcement
4. **Content Policy:** Platform-specific editorial and tone guardrails
5. **Cost Policy:** Hourly, daily, and monthly dollar budget caps
6. **Permissions Policy:** Role-based access control (RBAC) boundaries
7. **Data Access Policy:** Redaction of PII and private internal telemetry
8. **Platform Policy:** Explicit allow/deny lists for target social networks

---

# 25. Autonomy Levels (L0 to L4)

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        Levels of Agent Autonomy                        │
├────────────────────────────────────────────────────────────────────────┤
│ L0 — Observe            (Read approved metrics; zero actions)          │
│ L1 — Suggest            (Generate insights & hypotheses; human decides)│
│ L2 — Prepare            (Create drafts & queue proposals; no release)  │
│ L3 — Approved Execution (Execute external actions only after signoff)  │
│ L4 — Policy Autonomy    (Autonomous actions strictly within safe bounds)│
└────────────────────────────────────────────────────────────────────────┘
```

> **L4 Autonomy NEVER bypasses Human Governance.** L4 merely permits autonomous execution of actions that workspace policy explicitly pre-authorized as zero-risk.

---

# 26. Autonomy L0 — Observe
- **Permitted:** Read aggregated metrics, inspect post performance, produce descriptive observations.
- **Forbidden:** Drafting content, mutating database records, scheduling, or publishing.

---

# 27. Autonomy L1 — Suggest
- **Permitted:** Synthesize qualitative insights, recommend tactical shifts, propose hypotheses and content outlines.
- **Human Role:** Evaluates suggestions and manually triggers actions.

---

# 28. Autonomy L2 — Prepare
- **Permitted:** Generate complete content variants, create draft publications, prepare experiment allocations, configure scheduled slots.
- **Boundary:** Zero external side effects. Content remains strictly in `DRAFT` status.

---

# 29. Autonomy L3 — Approved Execution
- **Permitted:** The Agent prepares the campaign, formats variants, and submits an `ApprovalRequest`.
- **Trigger:** Upon human cryptographic signoff, the Agent or Worker executes publication dispatch.

---

# 30. Autonomy L4 — Policy-Bounded Autonomy
- **Permitted:** Automatically adapt content for secondary channels, collect telemetry snapshots, prune underperforming internal drafts, run automated A/B variance math.
- **Ceiling:** Hard-bounded by Workspace Policies, Cost Budgets, Platform Rules, and Safety Guardrails.

---

# 31. The Sovereign Human Gate

Human Approval is a non-negotiable architectural invariant of Scriora:
- External MCP tools can **NEVER** bypass Human Approval.
- Live social publishing can **NEVER** occur if an Approval Rule is active and unfulfilled.

```text
Agent Proposal ──► Policy Engine ──► Approval Required?
                                           │
                    ┌──────────────────────┴──────────────────────┐
                    ▼ YES                                         ▼ NO
             Generate Token & Alert                          Auto-Proceed
                    │
                    ▼
           Human Reviewer Action
       (Approve / Reject / Request Changes)
```

---

# 32. Immutable Resource Version Binding

Approvals are strictly bound to a cryptographic hash and explicit version of the target resource:
- If a post is approved at `Content Version 4`, and an agent or user edits it to `Version 5`:
- **The prior approval is instantly invalidated.**
- A new approval cycle MUST be triggered.

---

# 33. Approval Token Security Architecture

When agency clients or external stakeholders review content via Signed Links:
- **Raw tokens are NEVER stored in the database.**
- Database persists: `token_hash`, `nonce`, `expiry`, and `usage_state`.
- Cryptographic signature: HMAC-SHA256 with workspace-isolated secrets.
- Default TTL: Exactly **7 days**, with single-use revocation upon decision recording.

---

# 34. Mission: The Closed-Loop Growth Core

A Mission is the highest-level commercial context for `scriora-agent`.
It binds empirical business objectives to iterative execution:

```text
Mission
 └── Goal (Target KPI + Baseline + Deadline)
      └── Strategy (Pillars, Tone, Audience)
           └── Hypothesis (Falsifiable Assumption)
                └── Experiment (A/B Test Design)
                     └── Content & Publications
                          └── Metrics & Telemetry
                               └── Evidence
                                    └── Insight
                                         └── Decision ──► New Hypothesis
```

---

# 35. Mission Execution Paradigm

The Agent never begins with the naive prompt: *"Write a post."*
Execution strictly begins with:
1. *"What is the commercial objective (Goal)?"*
2. *"What strategic pillars and audience personas are defined?"*
3. *"What hypothesis are we testing to move this metric?"*
4. *"What content variant produces the cleanest evidence?"*

---

# 36. Quantitative Goal Context

An Agent cannot plan without concrete telemetry boundaries:
- `Metric`: e.g., `qualified_signups`, `engaged_followers`, `ctr`
- `Baseline`: Starting empirical measurement (e.g., `120 signups/mo`)
- `Target`: Target objective (e.g., `500 signups/mo`)
- `Current Value`: Real-time measurement synced from Analytics
- `Time Window`: Deadline boundary (e.g., `30 Days`)

---

# 37. Strategy Formulation & Business State

The Agent can draft and propose:
- Audience segmentation
- Content pillars and distribution mixes
- Tone of voice and messaging angles

*However, a Strategy only becomes authoritative Business State when validated and accepted into `scriora-core`.*

---

# 38. Falsifiable Hypothesis Generation

Every generated hypothesis must follow the strict falsifiability template:
- **Statement:** "Publishing technical carousels on LinkedIn will increase high-intent clicks."
- **Rationale:** "Historical carousel posts generated 2.4x higher dwell time than text posts."
- **Success Metric:** `click_through_rate`
- **Expected Effect:** `+35% relative lift`
- **Sample Period:** `14 days`

---

# 39. The Causality Invariant

> **Correlation is NOT Causation.**

The Agent Framework strictly prohibits claiming causal attribution without verified experimental controls.
- "Engagement rose when we posted on Tuesdays" is an **Observed Association**.
- "Variant A outperformed Control B with p < 0.05 across randomized audiences" is **Causal Evidence**.

---

# 40. Experiment Planning Specifications

The Agent outlines multi-variant experiments containing:
- `Control`: Baseline creative/copy
- `Variants`: Systematically altered creatives (e.g., Hook variation, Format variation)
- `Platform Targets`: Specific social networks
- `Sample Duration`: Minimum runtime to achieve statistical significance
- `Primary & Secondary Metrics`: Clear evaluation criteria
- `Traffic Allocation`: Balanced distribution rules

---

# 41. Content Generation Context Assembly

The Content Generation Skill receives a precisely structured, compressed payload:
- Target Goal & Current Strategy Pillar
- Persona Profile & Tone Guidelines
- Platform Constraints (Character limits, media ratios)
- Brand Knowledge & Anti-Patterns (Taboo phrases)
- Recent High-Performing & Low-Performing Evidence

*Dumping raw conversation histories or entire databases into LLM prompts is strictly forbidden.*

---

# 42. Context Assembly Engine

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        Context Assembly Pipeline                       │
├────────────────────────────────────────────────────────────────────────┤
│ 1. Filter: Extract only entities belonging to active Mission & Goal    │
│ 2. Rank: Sort evidence and brand memory by relevance score             │
│ 3. Compress: Strip boilerplate, format into high-density JSON/Markdown │
│ 4. Validate: Ensure zero PII or credentials exist in payload           │
│ 5. Deliver: Transmit minimal necessary context to Provider             │
└────────────────────────────────────────────────────────────────────────┘
```

---

# 43. Token Optimization Protocol

To achieve 65-75% token economy and eliminate context overflow:
- Use concise Technical English for all internal cognitive processing.
- Cache immutable brand guidelines and schemas via prompt-caching headers.
- Truncate long historical logs into compact statistical aggregates.

---

# 44. The 6-Tier Memory Architecture

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        6-Tier Memory Framework                         │
├────────────────────────────────────────────────────────────────────────┤
│ Tier 1: Working Memory     │ In-memory transient scratchpad per task   │
│ Tier 2: Short-Term Memory  │ Mission-session recent decisions & events │
│ Tier 3: Brand Knowledge    │ Stable voice, guidelines, rules, personas │
│ Tier 4: Evidence Memory    │ Empirical, verified metrics & outcomes    │
│ Tier 5: Preferences        │ Team & user posting styles & habits       │
│ Tier 6: Operational Memory │ Platform quirks, failure patterns, ratelim│
└────────────────────────────────────────────────────────────────────────┘
```

---

# 45. Tier 1: Working Memory
- **Nature:** Ephemeral, process-local memory.
- **Scope:** Active step execution, immediate scratchpad calculations.
- **Lifecycle:** Discarded immediately upon `AgentTask` completion.

---

# 46. Tier 2: Short-Term Memory
- **Nature:** Session-scoped context.
- **Scope:** Recent task successes/failures within the active 24-48h window.
- **Lifecycle:** Auto-expires unless promoted to Persistent Memory.

---

# 47. Tier 3: Brand Knowledge
- **Nature:** Core business identity assets.
- **Scope:** Brand positioning, terminology, customer pain points, taboo vocabulary.
- **Storage:** Persisted in PostgreSQL, accessible across all workspace missions.

---

# 48. Tier 4: Evidence Memory
- **Nature:** Immutable empirical records.
- **Scope:** Measured performance deltas linked to specific publications and experiments.
- **Rule:** May NEVER be synthesized or hallucinated by an LLM. Must originate from verified analytics.

---

# 49. Tier 5: Preferences
- **Nature:** User and organizational configuration.
- **Scope:** Preferred publishing times, favored visual formats.
- **Hierarchy:** System Policy ALWAYS overrides User Preferences.

---

# 50. Tier 6: Operational Memory
- **Nature:** Infrastructure telemetry.
- **Scope:** Transient API slowdowns, recent rate-limit trips, model latency benchmarks.
- **Storage:** Managed in Redis / Ephemeral storage.

---

# 51. Vector Memory & `pgvector` Boundary

When semantic vector search is utilized:
- **`pgvector` is purely an acceleration retrieval index.**
- It is **NEVER** the authoritative source of truth.
- Relational PostgreSQL tables remain the sole system of record.
- If vector embeddings become corrupted, they can be 100% regenerated from relational data.

---

# 52. The Classic Mode Invariant

> **Scriora operates 100% independently in Classic Mode without AI, LLMs, or Vector Databases.**

A user can schedule, publish, transcode media, and review analytics without running a single LLM query or paying a single AI token. AI is an accelerator, never a hard dependency.

---

# 53. Provider Abstraction Architecture

`scriora-agent` interacts with AI vendors strictly through unified, vendor-neutral contracts:
- `LLMProvider` (Text generation, structured output, tool calling)
- `ImageGenerationProvider` (Visual asset creation)
- `VideoGenerationProvider` (Short-form video synthesis)
- `MultimodalProvider` (Image understanding, audio transcription)

---

# 54. LLM Provider Contract

```typescript
interface LLMProvider {
  name: string;
  generateText(prompt: PromptPayload, options: ModelOptions): Promise<TextResponse>;
  generateStructured<T>(prompt: PromptPayload, schema: ZodSchema<T>): Promise<T>;
  streamText(prompt: PromptPayload): AsyncIterable<string>;
  getMetadata(): ProviderMetadata;
}
```

---

# 55. Image Generation Provider Contract
- **Responsibilities:** Prompt dispatch, seed control, style enforcement, raw image asset return.
- **Non-Responsibilities:** Resizing, compression, thumbnailing, or CDN storage (strictly delegated to `scriora-media`).

---

# 56. Video Generation Provider Contract
- **Responsibilities:** Prompt dispatch, motion parameterization, raw video generation.
- **Non-Responsibilities:** Audio normalization, aspect ratio transcoding, or HLS packaging (strictly handled by `scriora-media`).

---

# 57. Provider Router Specifications

The Provider Router dynamically selects the optimal model engine based on:
1. **Capability Requirement:** Context length, structured output fidelity, vision reasoning
2. **Quality Tier:** Flagship reasoning vs fast classification
3. **Latency Profile:** Interactive real-time vs background queue
4. **Unit Cost:** Dollars per 1k tokens
5. **Workspace Policy:** Explicit customer model restrictions (e.g., "EU-hosted models only")

---

# 58. Intelligent Provider Failover

```text
Provider Request ──► Primary Engine (e.g., Anthropic Claude 3.5 Sonnet)
                           │
                           ▼ [Rate-Limit / 5xx Network Timeout?]
                     Classify Failure
                           │
                           ▼ [Retryable?]
                     Secondary Engine (e.g., OpenAI GPT-4o)
```

*Failover NEVER violates Workspace Data Policies or exceeds allocated cost ceilings.*

---

# 59. Provider Observability & Audit

Every provider call records:
- Provider name & exact model version string
- Input tokens, output tokens, cached tokens
- Execution latency in milliseconds
- Estimated financial cost in micro-cents
- Canonical error codes (if failed)

*Customer PII and confidential credentials are scrubbed before logging.*

---

# 60. AI Output Validation Pipeline

```text
Raw Model Output
    │
    ▼
JSON / Schema Parsing (Zod Validation) ──► Fails? ──► Re-prompt / Repair
    │
    ▼ Passes
Policy & Brand Safety Checks            ──► Fails? ──► Abort / Alert
    │
    ▼ Passes
Domain & Semantic Validation            ──► Fails? ──► Human Review Gate
    │
    ▼ Passes
Accepted into Application Contract
```

---

# 61. Mandatory Structured Outputs

Any AI output intended for downstream consumption (e.g., Content Variants, Strategy Proposals, Experiment Metrics) **MUST** be emitted as strict JSON schemas. Unstructured markdown or conversational prose is strictly prohibited in machine-to-machine interfaces.

---

# 62. Strict Hallucination Controls

The Agent Framework enforces zero tolerance for fabricated telemetry:
- If analytics data does not exist, the agent MUST emit `null` or `UNKNOWN`.
- Fabricating engagement metrics, follower counts, or benchmark stats triggers immediate task failure.

---

# 63. Empirical Evidence Boundary

```text
Raw Platform Metric (API) ──► Analytics Snapshot ──► Evidence Record ──► Insight
```

Every actionable Insight MUST link to one or more immutable `Evidence` IDs. Free-floating insights without empirical citations are rejected.

---

# 64. Decision Generation & Recommendation

When proposing decisions:
- The Agent presents clear alternatives: `Option A` vs `Option B`.
- Accompanied by quantitative rationale and supporting evidence IDs.
- Authoritative activation of the Decision remains strictly in the hands of human operators via `scriora-core`.

---

# 65. Confidence Score Semantics

A `confidence_score` (e.g., `0.85`) represents:
> **The mathematical confidence of the statistical model given the observed sample size and variance.**

It does **NOT** represent absolute certainty or a guarantee of future real-world commercial success.

---

# 66. The Full Closed-Loop Learning Cycle

```text
                ┌────────────────────────────────────────┐
                │          Commercial Mission            │
                └───────────────────┬────────────────────┘
                                    │
                                    ▼
                ┌────────────────────────────────────────┐
                │        Falsifiable Hypothesis          │
                └───────────────────┬────────────────────┘
                                    │
                                    ▼
                ┌────────────────────────────────────────┐
                │           A/B Experiment               │
                └───────────────────┬────────────────────┘
                                    │
                                    ▼
                ┌────────────────────────────────────────┐
                │      Multi-Channel Publication         │
                └───────────────────┬────────────────────┘
                                    │
                                    ▼
                ┌────────────────────────────────────────┐
                │      Real-World Social Telemetry       │
                └───────────────────┬────────────────────┘
                                    │
                                    ▼
                ┌────────────────────────────────────────┐
                │       Causal Evidence Extraction       │
                └───────────────────┬────────────────────┘
                                    │
                                    ▼
                ┌────────────────────────────────────────┐
                │       Permanent Memory Promotion       │
                └───────────────────┬────────────────────┘
                                    │
                                    ▼
                     Informs Next Mission Cycle!
```

---

# 67. Controlled Learning vs Telemetry Noise

To prevent memory poisoning:
- Routine daily metric fluctuations are NOT written to Permanent Memory.
- Only statistically significant experiment conclusions and validated hypotheses are promoted to Long-Term Brand Memory.

---

# 68. Memory Promotion Pipeline

Information ascends through formal validation stages:
```text
Working Scratchpad ──► Short-Term Session ──► Candidate Knowledge ──► Permanent Memory
```
Promotion to Permanent Memory requires explicit verification against empirical evidence or human administrative signoff.

---

# 69. Memory Conflict Resolution

When fresh empirical evidence contradicts legacy knowledge:
1. The system identifies conflicting assertions.
2. A formal evaluation calculates relative evidence weight and sample freshness.
3. The old memory is marked with `valid_until = now()` and superseded.
4. Historical records are preserved for longitudinal audit.

---

# 70. The OAuth Token Shield

The Agent Framework is hermetically sealed from social credentials:
- Raw OAuth access tokens and refresh secrets are stored in encrypted vaults owned by `scriora-core`.
- The Agent **NEVER** sees, receives, logs, or transmits raw social tokens.
- Tool invocations pass opaque identifiers (`social_account_id`), never credentials.

---

# 71. Robust Prompt Injection Defense

External social data (comments, replies, inbound webhooks, competitor posts) is treated as **untrusted user input**:
- Stored in strict data enclosures with boundary delimiters.
- Evaluated as data, never as system instructions.
- System prompts enforce non-overridable boundary instructions.

---

# 72. Tool Injection & Privilege Escalation Protection

Even if an LLM is hijacked via malicious input:
1. The Runtime validates the requested tool against the workspace's explicit permissions.
2. Parameters are parsed through strict Zod schemas, stripping unexpected keys.
3. High-impact operations trigger the mandatory Human Approval Gate outside the model's control.

---

# 73. Multi-Tenant Workspace Isolation

Every `AgentTask`, `SkillExecution`, and `MemoryRecord` contains an immutable `workspace_id`. Cross-workspace queries are structurally blocked at the application contract and database RLS layers.

---

# 74. Agent Persistence Model

Agent-specific operational records are persisted in dedicated, agent-owned tables:
- `agent_tasks` (Execution state and step pointers)
- `skill_executions` (Granular capability audit logs)
- `provider_runs` (Model usage, latencies, and token costs)

These tables belong strictly to `scriora-agent` migrations.

---

# 75. Database Ownership Protocol

- **Core Business Tables:** Owned exclusively by `scriora-core`.
- **Agent Operational Tables:** Owned exclusively by `scriora-agent`.
- **Shared Cluster:** Both schemas reside logically within the same managed PostgreSQL instance, communicating via contracts.

---

# 76. Inter-Repo Contract: Agent ↔ Core
- Agent reads business state via Core Application Contracts.
- Agent requests draft creation or state changes via Core APIs.
- Agent CANNOT execute raw SQL or mutate Core tables directly.

---

# 77. Inter-Repo Contract: Agent ↔ Social
- Agent interacts with social networks solely through `SocialTool` abstractions.
- Agent possesses zero knowledge of platform-specific SDKs, HTTP headers, or OAuth handshakes.

---

# 78. Inter-Repo Contract: Agent ↔ Media
- Agent specifies media creation requirements (aspect ratio, target format).
- Asset transcoding, thumbnail generation, and storage are delegated to `scriora-media`.

---

# 79. Inter-Repo Contract: Agent ↔ MCP
- External agents interact with Scriora through `scriora-mcp`.
- `scriora-mcp` calls Scriora Application Contracts, which route to `scriora-agent`.
- External MCP tools cannot bypass internal Human Approval policies.

---

# 80. Inter-Repo Contract: Agent ↔ Worker
- **Agent:** The cognitive architect (Reasoning, Strategy, Planning).
- **Worker:** The durable executioner (Inngest jobs, retries, cron triggers, distributed locks).

---

# 81. Durable Long-Running Execution

For tasks spanning minutes or hours:
- State is checkpointed to `agent_tasks` in PostgreSQL after every step.
- Execution resumes cleanly across server restarts or container redeployments.
- Ephemeral in-memory execution loops are strictly prohibited for production tasks.

---

# 82. Canonical Failure Taxonomy

Every execution failure is mapped to an explicit enumeration:
1. `INPUT_INVALID`: Parameter contract validation error.
2. `CONTEXT_UNAVAILABLE`: Missing mandatory workspace or telemetry data.
3. `MODEL_FAILURE`: LLM returned invalid syntax or 500 error.
4. `TOOL_FAILURE`: Underlying tool crashed or threw exception.
5. `PROVIDER_FAILURE`: External model vendor downtime.
6. `POLICY_DENIED`: Action blocked by governance guardrails.
7. `APPROVAL_REQUIRED`: Execution paused awaiting human signoff.
8. `TIMEOUT`: Execution exceeded allocated step SLA.
9. `RATE_LIMITED`: Quota exhausted on model or tool interface.
10. `EXTERNAL_UNKNOWN`: Ambiguous 3rd-party status requiring reconciliation.
11. `INTERNAL`: Uncaught system error.

---

# 83. Retry & Reconciliation Strategy

- **Retryable Errors:** `PROVIDER_FAILURE`, `TIMEOUT`, `RATE_LIMITED` (Exponential backoff with jitter).
- **Terminal Errors:** `INPUT_INVALID`, `POLICY_DENIED`, `PERMISSION_DENIED` (Immediate halt).
- **Reconciliation Mode:** `EXTERNAL_UNKNOWN` triggers status polling rather than blind replay.

---

# 84. Task Cancellation & Pause Semantics

Users can pause or cancel missions and tasks at any instant:
- In-flight provider calls are aborted via `AbortController`.
- Downstream tool queues are purged.
- Task status updates atomically to `PAUSED` or `CANCELLED`.

---

# 85. Budget & Expenditure Controls

Workspaces enforce hard financial limits:
- Maximum daily model spend (USD)
- Maximum tokens per task execution
- Maximum media generation credits per billing period

*Exceeding a budget cap immediately halts execution and alerts workspace owners.*

---

# 86. Cost-Aware Planning Heuristics

When multiple model tiers can satisfy a task:
- Drafting initial outlines uses low-cost models.
- High-stakes strategic reasoning invokes flagship frontier models.
- Cost constraints are evaluated during the planning phase.

---

# 87. Comprehensive Evaluation Framework

Agent quality is evaluated across 8 rigorous dimensions:
1. **Schema Validity**: 100% adherence to Zod interfaces.
2. **Policy Compliance**: Zero unauthorized tool calls.
3. **Evidence Grounding**: All insights backed by empirical metrics.
4. **Hallucination Rate**: Zero fabricated numbers or capabilities.
5. **Tool Precision**: Selection of the optimal tool for the step.
6. **Token Efficiency**: Minimal tokens spent per unit of value.
7. **Latency**: End-to-end execution speed.
8. **Recovery Resilience**: Graceful degradation under vendor failures.

---

# 88. Deterministic AI Stubs

To ensure continuous development and testing without token expenditure:
- `scriora-agent` includes full **Deterministic AI Stubs** for all planning, strategy, and content skills.
- The entire system can be tested end-to-end without connecting to live OpenAI/Anthropic APIs.
- Live LLM connections are deferred to the final staging phase.

---

# 89. Phased AI Activation Strategy

```text
Phase 1: Pure Agent Contracts & Schemas
   │
   ▼
Phase 2: Deterministic AI Stubs & Unit Tests
   │
   ▼
Phase 3: Integration with Core & Social via Mocks
   │
   ▼
Phase 4: Benchmark Evaluation against Staging Datasets
   │
   ▼
Phase 5: Live Provider Connection & Canary Deployment
```

---

# 90. Automated Regression Test Suite

A frozen suite of regression test cases runs on every PR:
- Complex multi-step Mission planning
- Brand safety and taboo word filtering
- Multi-channel content adaptation
- Prompt injection resilience
- Rate-limit recovery simulation

---

# 91. Observability & Distributed Tracing

Every agent execution produces unified trace headers:
- `correlation_id`: End-to-end request identifier
- `agent_task_id`: Durable task identifier
- `workspace_id`: Tenant context
- `skill_execution_id`: Granular capability identifier
- `provider_run_id`: Individual model API call

---

# 92. Comprehensive Audit Trails

All high-impact agent operations produce an immutable audit log detailing:
- Initiator (User, Cron, or Webhook)
- Active Agent, Skill, and Tool
- Policy checks and human approval decisions
- Exact input parameters and sanitized output summaries
- Timestamp and execution duration

---

# 93. Explainability Over Chain-of-Thought

Scriora delivers **User Explainability** rather than dumping raw internal Chain-of-Thought tokens:
- "Why did the Agent recommend this carousel?"
- **Answer:** "Because analysis of your last 10 posts revealed carousels generated 3.2x higher signups than single images among CTOs."

---

# 94. Mission Control UI Contract

The Web UI displays:
- Mission progress bar and active Goal delta
- Current hypothesis status (`Pending`, `Testing`, `Validated`, `Disproven`)
- Pending approval cards with 1-click review
- Recent causal insights and suggested next steps

*UI interacts strictly through standard HTTP API contracts.*

---

# 95. Agent State vs Business State Isolation

```text
Agent State (scriora-agent):
"Analyzing last 30 days of LinkedIn metrics to formulate Q3 Strategy."

Business State (scriora-core):
"Mission Q3: Active. Target: +500 Signups. Baseline: 120."
```

---

# 96. Skill Extensibility Architecture

Adding a new Skill does not require creating a new repository or altering core schemas:
1. Implement `SkillContract` within `scriora-agent/skills/`.
2. Define input/output Zod schemas.
3. Register in `SkillRegistry`.
4. Add automated evaluation test.

---

# 97. Platform-Specific Skills

Specialized skills (e.g., `LinkedInCarouselSkill`, `TikTokScriptSkill`, `RedditCommunitySkill`) leverage normalized `scriora-social` capabilities without importing platform SDKs directly.

---

# 98. Skill Certification Standards

Before a Skill is certified for production:
- 100% test coverage on input/output schemas
- Zero-leakage security audit
- Deterministic behavior verification
- Benchmark score exceeding 90% quality threshold

---

# 99. The Test Pyramid for Agent Framework

```text
                  ┌────────────────────────┐
                  │    Evaluation Suite    │
                  ├────────────────────────┤
                  │    E2E Mission Loop    │
                  ├────────────────────────┤
                  │     Security Tests     │
                  ├────────────────────────┤
                  │  Deterministic Stubs   │
                  ├────────────────────────┤
                  │     Contract Tests     │
                  ├────────────────────────┤
                  │       Unit Tests       │
                  └────────────────────────┘
```

---

# 100. Inter-Repo Contract Test Suite
- `Agent ↔ Core`: Schema validation and error handling
- `Agent ↔ Social`: Capability invocation and status handling
- `Agent ↔ Media`: Transcoding request formats
- `Agent ↔ Providers`: Provider adapter conformances

---

# 101. Rigorous Security Tests
- Cross-tenant data isolation penetration tests
- Privilege escalation via tool hijacking
- Direct prompt injection bypass tests
- Secret credential leak prevention tests

---

# 102. Full End-to-End Mission Verification

```text
Create Mission ──► Define Goal ──► Agent Proposes Strategy ──► Human Approves
       │
       ▼
Agent Plans Experiment ──► Drafts Content ──► Human Approves ──► Worker Publishes
       │
       ▼
Analytics Ingested ──► Evidence Recorded ──► Insight Synthesized ──► Decision!
```

---

# 103. Future Multi-Agent Architecture

While future versions may introduce specialized agents (e.g., *Research Agent*, *Creative Director Agent*, *Growth Analyst Agent*), the initial architecture utilizes a single unified Runtime executing specialized Skills.

---

# 104. The Anti-Premature Multi-Agent Complexity Law

> **Do NOT build multi-agent swarms prematurely.**

Multi-agent coordination introduces severe state synchronization, cost explosions, nondeterminism, and debugging overhead. A single robust Runtime with well-factored Skills is simpler, faster, and infinitely more reliable for MVP and production hardening.

---

# 105. Seamless Extension Points

When domain complexity eventually justifies dedicated sub-agents:
- They inherit the existing `SkillRegistry`, `ToolContracts`, `PolicyEngine`, `MemoryModel`, and `ProviderRouter` without structural refactoring.

---

# 106. The Master Agent Flowchart

```text
                           USER / OPERATOR
                                  │
                                  ▼
                               MISSION
                                  │
                                  ▼
                            AGENT RUNTIME
                                  │
                 ┌────────────────┼────────────────┐
                 ▼                ▼                ▼
              CONTEXT            PLAN            POLICY
                 │                │                │
                 └────────────────┼────────────────┘
                                  ▼
                                SKILL
                                  │
                                  ▼
                                TOOL
                                  │
                 ┌────────────────┼────────────────┐
                 ▼                ▼                ▼
            scriora-core   scriora-social   scriora-media
                 │                │                │
                 └────────────────┼────────────────┘
                                  ▼
                              EXECUTION
                                  │
                                  ▼
                              EVIDENCE
                                  │
                                  ▼
                               INSIGHT
                                  │
                                  ▼
                              DECISION
                                  │
                                  ▼
                         CLOSED-LOOP LEARNING
```

---

# 107. The Immutable Governance Law

> **The Agent can reason, plan, propose, and generate, but only executes within strict permissions, policies, and human approval gates.**

---

# 108. Security Outside the Model

Security guardrails are engineered **outside the model**:
Even if an LLM is completely hallucinating or compromised by prompt injection, it remains physically unable to bypass database RLS, alter authorization rules, access OAuth tokens, or publish without approval.

---

# 109. Master Architecture Responsibility Matrix

| Subsystem | Primary Responsibility |
| :--- | :--- |
| **Agent Runtime** | Execution coordination & state transitions |
| **Planner** | Falsifiable step-by-step execution plans |
| **Context Assembler** | Filtered, minimal, high-density prompt payloads |
| **Skill Registry** | Modular capabilities (Deterministic & AI) |
| **Tool Engine** | Gated, policy-enforced system actions |
| **Policy Engine** | Sovereign governance, autonomy & safety guardrails |
| **Memory System** | 6-Tier knowledge, evidence, and preference stores |
| **Provider Router** | Vendor-neutral model & media dispatch |
| **Core (Business)** | Source of Truth, commercial entities & tenancy |
| **Social (ACL)** | External social network communication |
| **Media Engine** | Heavy asset transcoding & storage |
| **Worker Engine** | Durable execution, queues & scheduling |
| **Approval Engine** | Human cryptographic signoff gates |
| **Evaluation Suite** | Deterministic benchmarks & quality audits |

---

# 110. The 10 Invariant Agent Framework Rules

1. **Rule 1 (No Direct Database Access):** The Agent NEVER queries or mutates PostgreSQL directly.
2. **Rule 2 (No Direct Social SDKs):** The Agent NEVER imports or invokes social network SDKs.
3. **Rule 3 (No Credential Exposure):** The Agent NEVER receives or processes raw OAuth tokens.
4. **Rule 4 (Mandatory Validation):** AI output NEVER enters business state without schema validation.
5. **Rule 5 (Policy Enforced Side Effects):** No external action executes without prior policy verification.
6. **Rule 6 (Unbypassable Human Gate):** Neither internal agents nor external MCP tools can bypass Human Approval.
7. **Rule 7 (Deterministic First):** Never invoke an LLM when deterministic logic suffices.
8. **Rule 8 (Context Economy):** Never dump entire databases or uncurated conversation histories into model prompts.
9. **Rule 9 (Causality Rigor):** Never conflate correlation with causal evidence.
10. **Rule 10 (Zero Business Authority):** The Agent is NEVER the authoritative source of business truth.

---

# 111. Status: 100% Formally Sealed

```text
Agent Framework Architecture
████████████████████████████████████ 100% COMPLETE
```

All 113 architectural specifications, governance boundaries, memory tiers, provider contracts, and safety guardrails for `scriora-agent` are formally frozen and canonical.

---

# 112. The Master Architectural Decision

`scriora-agent` is NOT a simple chatbot or wrapper. It is the **Cognitive Intelligence and Execution Layer** operating sovereignly atop the Business Core:

```text
                 CORE
         (Business Truth & RLS)
                   ▲
                   │ Contracts
                   ▼
                 AGENT
        (Intelligence & Planning)
                   │
                   │ Controlled Tools
                   ▼
         SOCIAL / MEDIA / WORKER
       (Execution Infrastructure)
```

Any LLM provider, prompt strategy, or cognitive skill can be swapped or upgraded without modifying a single line of business core logic.

---

# 113. AI-Readiness Without AI-Dependency

Scriora is engineered to be **AI-Ready, but never AI-Dependent**:
- **Classic Mode:** Runs 100% deterministically without LLMs or AI providers.
- **Mission Mode Development:** Develops and tests via Deterministic AI Stubs without token costs.
- **Production AI:** Activated seamlessly once deterministic integration and benchmark evaluations achieve 100% compliance.
