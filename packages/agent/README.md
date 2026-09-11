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