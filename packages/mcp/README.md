# scriora-mcp

MCP Protocol Server for Scriora  -  Model Context Protocol 2024-11-05.

**Mandate:** Expose Scriora capabilities to external AI clients
via the standard MCP protocol. Enforce all governance boundaries.

**Critical Invariants:**
- Cannot bypass the Human Approval Gate under any circumstance
- Cannot access social platform credentials directly
- All tool inputs validated via Zod before execution
- **Workspace-scoped tools require a real workspace API key** (`SCRIORA_API_KEY` or `MCP_API_KEY`) whose `workspaceId` matches the tool argument. Membership of the key's user is required. A client-supplied `workspaceId` or `X-Workspace-Id` header is **not** authentication and cannot authorize writes to an arbitrary workspace.
- When `MCP_SIGNING_SECRET` is set, workspace-scoped tools also require `MCP_REQUEST_SIGNATURE` (HMAC-SHA256 of `toolName:workspaceId`). API key lookup uses the same HMAC-SHA256 peppered fingerprint as HTTP (`API_KEY_PEPPER`); legacy SHA-256(rawKey) rows still verify during transition.
- `scriora_create_post` applies the agent autonomy gate: `publication.publish` is in `ALWAYS_REQUIRES_APPROVAL`, so MCP holds the Classic approval path even when `workspace.requiresApproval` is false or the workspace operating mode is `AUTONOMOUS`. Classic `POST /v1/posts` remains the HTTP enforcement path (`workspace.requiresApproval`).

**Exposed Capabilities (Phase 1):**
- `scriora_create_post` — create publications (approval hold; `posts:write`)
- `scriora_list_social_accounts` — list accounts in the bound workspace
- `scriora_optimize_cross_post` — copy heuristics (no workspace scope)
- `scriora_get_smart_slots` — schedule heuristics (no workspace scope)

**Transport:** stdio (default) | HTTP (optional)

Reference: scriora-docs/architecture/SCRIORA_REPOSITORY_SPECIFICATIONS.md

## Quality Gate

```bash
pnpm typecheck && pnpm test && pnpm build
```

Coverage minimum: 85%
