---
title: "REST API Developer Reference"
description: "Universal B2B Omnichannel Social Publishing, Scheduling, and Human Governance Engine — Canonical REST Gateway."
---

The **Scriora Developer API** is a high-performance REST gateway powered by **Fastify**, providing strict **Zod** schema validation, automated **OpenAPI 3.0** documentation, multi-tenant isolation, and **AES-256-GCM** envelope security.

---

## 🌐 Base URLs & Interactive Swagger

- **Local Development**: `http://localhost:4000`
- **Production Edge Gateway**: `https://api.scriora.io`
- **Interactive Swagger UI**: `http://localhost:4000/docs`
- **Raw OpenAPI 3.0 Specification**: `GET /openapi.json` ([Download OpenAPI 3.0](./openapi.json))

---

## 🔐 Authentication Methods

Requests must include either a **Workspace API Key** (for server-to-server and agentic integration) or a **User Session Bearer Token**:

```http
X-API-Key: sk_live_9f83a84b12c3e5d7...
X-Workspace-Id: 4d2e70c7-3010-4d17-b3d8-cca91b5edbc6
```

Or via JWT Bearer Token:
```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## 📊 Core API Endpoints

### 1. Workspaces & API Keys
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/v1/workspaces` | Create a new isolated workspace tenant |
| `GET` | `/v1/workspaces` | List memberships and active workspaces |
| `POST` | `/v1/workspaces/{wsId}/api-keys` | Issue scoped developer API keys (`sk_live_...`) |
| `DELETE` | `/v1/workspaces/{wsId}/api-keys/{keyId}` | Revoke a compromised or retired API key |

### 2. Social Connections & Discovery
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/v1/connect/telegram` | Connect Telegram bot and destination chat/channel |
| `POST` | `/v1/connect/discord` | Connect Discord channel via Webhook or Bot API |
| `GET` | `/v1/connect/discord/channels` | ⚡ Auto-discover bot guilds and text/announcement channels |
| `GET` | `/v1/connect/{platform}` | Initiate OAuth 2.0 PKCE flow (LinkedIn, X) |
| `GET` | `/v1/social-accounts` | List all connected destinations in the workspace |
| `DELETE` | `/v1/social-accounts/{id}` | Disconnect destination and shred encrypted envelope |

### 3. Publishing Engine
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/v1/posts` | 🚀 Unified multi-platform publish or schedule |
| `GET` | `/v1/posts` | List publications with status and delivery receipts |
| `GET` | `/v1/posts/{postId}` | Retrieve publication status, external post URLs, and attempt logs |
| `POST` | `/v1/posts/{postId}/cancel` | Cancel a scheduled publication before dispatch |

### 4. Human-in-the-Loop Governance (§14 Approvals)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/v1/approve/{token}` | Inspect post content and media before authorizing |
| `POST` | `/v1/approve/{token}/decision` | Submit binding `APPROVE` or `REJECT` decision |

---

## 🚀 Unified Publishing Example (`POST /v1/posts`)

```json
{
  "body": "🚀 Scriora 2.0 Developer API is live! Build once, publish everywhere.",
  "targets": [
    {
      "platform": "DISCORD",
      "socialAccountId": "1738cbb3-eeea-4608-844a-17e1ea85015c",
      "platformOptions": {
        "platform": "DISCORD",
        "options": {
          "embedTitle": "⚡ Enterprise Distribution Engine",
          "embedDescription": "Seamlessly publish across all social platforms.",
          "embedColor": "#10B981"
        }
      }
    },
    {
      "platform": "TELEGRAM",
      "socialAccountId": "55555555-5555-4555-8555-555555555555",
      "customBody": "📢 <b>Scriora API Announcement:</b> Developer documentation is now available!"
    }
  ],
  "mediaUrls": ["https://cdn.scriora.io/assets/launch.png"]
}
```

---

## 🛡️ Standard Error Envelopes

Every error response adheres strictly to the canonical error format:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_PAYLOAD",
    "category": "VALIDATION_ERROR",
    "message": "x-workspace-id header or workspaceId query parameter is required",
    "retryable": false
  },
  "meta": {
    "requestId": "req_12345",
    "timestamp": "2026-09-11T20:15:00.000Z"
  }
}
```
