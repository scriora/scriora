# scriora-agent
AI Agent Framework for Scriora  -  the cognitive layer of the Growth OS.
**Mandate:** Autonomous task execution within human governance boundaries.
Owns: Runtime, skills, tools, memory tiers, provider abstraction, evaluation.
**Supreme Law:** Agent has ZERO business authority.
It proposes. Humans and policies decide.
**Autonomy Levels:**
- L0: Observe only
- L1: Suggest (human reviews)
- L2: Execute + notify
- L3: Execute with pre-approval
- L4: Autonomous within policy

**Approval gate:** `evaluateAutonomyGate` enforces `ALWAYS_REQUIRES_APPROVAL` (including `publication.publish`) at every level, including L4. MCP `scriora_create_post` calls this gate and holds the Classic approval path. Classic HTTP `POST /v1/posts` still uses `workspace.requiresApproval` as its enforcement. L4 / `AUTONOMOUS` is not a publish bypass.
**Memory Architecture (6 Tiers):**
Working → Short-Term → Brand Knowledge → Evidence → Preferences → Operational
**Provider Strategy:**
Default = Stub (deterministic, no API calls)
Production = Anthropic / OpenAI / Gemini (explicit opt-in)
Scriora runs fully without any AI provider (Classic Mode).
Reference: scriora-docs/architecture/SCRIORA_AGENT_FRAMEWORK.md
## Quality Gate
```bash
pnpm typecheck && pnpm test && pnpm test:evaluation && pnpm build
```
Coverage minimum: 80% | Evaluation pass rate: 100%