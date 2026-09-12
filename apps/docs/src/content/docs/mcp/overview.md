---
title: "Model Context Protocol (MCP) Server"
---

Scriora provides a native, production-grade **Model Context Protocol (MCP)** server (`@scriora/mcp`) that enables AI assistants (such as Anthropic Claude, Cursor, ChatGPT, and custom LLM agents) to directly interact with Scriora workspaces, publish content, schedule campaigns, and inspect analytics.

---

## 🔌 Supported Transports

The Scriora MCP server supports two transport layers:

1. **Stdio Transport**: Ideal for local desktop clients (Claude Desktop, Cursor, local CLI scripts).
2. **Server-Sent Events (SSE) Transport**: Ideal for remote agents, cloud microservices, and webhooks.

---

## 🚀 Quick Setup

### Connecting to Claude Desktop

Add the following entry to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "scriora": {
      "command": "node",
      "args": [
        "/path/to/scriora/packages/mcp/dist/index.js"
      ],
      "env": {
        "SCRIORA_API_URL": "http://localhost:4000",
        "SCRIORA_API_KEY": "your-workspace-api-key"
      }
    }
  }
}
```

### Connecting to Cursor IDE

In Cursor Settings -> Features -> MCP Servers:
- **Type**: `command`
- **Command**: `pnpm --filter scriora-mcp start`

---

## 🛠️ Available MCP Tools

| Tool Name | Description | Parameters |
|---|---|---|
| `scriora_create_post` | Create and validate a social post draft | `workspaceId`, `content`, `mediaUrls`, `platforms` |
| `scriora_schedule_post` | Schedule a publication for a specific datetime | `publicationId`, `scheduledAt` |
| `scriora_publish_now` | Trigger immediate publication via Outbox Engine | `publicationId` |
| `scriora_list_accounts` | List connected social accounts and their health | `workspaceId` |
| `scriora_get_analytics` | Retrieve engagement metrics (impressions, clicks) | `publicationId`, `period` |

---

## 🔒 Security & Sandboxing

- Every tool execution strictly validates inputs against **Zod schemas**.
- Workspace-scoped tools (`scriora_create_post`, `scriora_list_social_accounts`) require a **workspace API key** (`SCRIORA_API_KEY`) whose binding matches `workspaceId`, plus membership of the key's user. `X-Workspace-Id` is **not** authentication and cannot authorize writes to an arbitrary workspace.
- When `MCP_SIGNING_SECRET` is configured, those tools also require `MCP_REQUEST_SIGNATURE` (HMAC-SHA256 of `toolName:workspaceId`).
- `scriora_create_post` treats `publication.publish` as always-approval (agent autonomy gate). It does not queue a sweepable outbox until a human approves.
- Social tokens are never exposed through the MCP interface; only publication references are exchanged.
