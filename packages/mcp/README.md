# scriora-mcp

MCP Protocol Server for Scriora  -  Model Context Protocol 2024-11-05.

**Mandate:** Expose Scriora capabilities to external AI clients
via the standard MCP protocol. Enforce all governance boundaries.

**Critical Invariants:**
- Cannot bypass the Human Approval Gate under any circumstance
- Cannot access social platform credentials directly
- All tool inputs validated via Zod before execution
- All actions authenticated via API key + HMAC signature
- Cross-tenant access structurally impossible

**Exposed Capabilities (Phase 1):**
- create-content  -  Draft content for workspace
- get-analytics  -  Read engagement metrics
- request-approval  -  Submit content for human approval
- get-mission-status  -  Read mission progress

**Transport:** stdio (default) | HTTP (optional)

Reference: scriora-docs/architecture/SCRIORA_REPOSITORY_SPECIFICATIONS.md

## Quality Gate

```bash
pnpm typecheck && pnpm test && pnpm build
```

Coverage minimum: 85%
