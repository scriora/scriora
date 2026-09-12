# scriora-mcp

MCP Protocol Server for Scriora  -  Model Context Protocol 2024-11-05.

**Mandate:** Expose Scriora capabilities to external AI clients
via the standard MCP protocol. Enforce all governance boundaries.

**Critical Invariants:**
- Cannot bypass the Human Approval Gate under any circumstance
- Cannot access social platform credentials directly
- All tool inputs validated via Zod before execution
- **Auth today is stdio-trusted.** There is no per-request API key / HMAC
  verification in this process. `scriora_create_post` refuses unknown
  `workspaceId` values and honors `workspace.requiresApproval` through the
  same `createUnifiedPost` path as `POST /v1/posts`. It is not a substitute
  for HTTP tenant auth; do not expose stdio MCP on an untrusted boundary.
- Cross-tenant isolation depends on the host process (who can invoke the
  tool), not on MCP-side membership checks.

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
