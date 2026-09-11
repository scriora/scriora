# 🌐 Scriora Developer API Reference (v1.0.0)

> **Product:** Scriora Omnichannel Publishing, Scheduling & Governance Engine  
> **Target Audience:** Developers, Enterprise SaaS, AI Agents, Marketing Automation Platforms  
> **Specification:** OpenAPI 3.0.3 ([Download openapi.json](./openapi.json))  
> **Security Level:** Zero-Trust Encrypted (AES-256-GCM) & Multi-Tenant Isolated  

---

## 1. 🧭 Introduction & Developer Value Proposition

The **Scriora Developer API** is a unified, high-performance REST gateway engineered to eliminate the complexity of social media publishing and governance. Instead of building and maintaining custom integrations for dozens of disjointed social networks (LinkedIn, Discord, Telegram, X, Meta, YouTube, Threads, etc.), your software connects to a **single, idempotent canonical gateway**.

### Why Integrate Scriora into Your Product?
* **Single Gateway for 33+ Platforms:** One unified payload dispatches simultaneously to LinkedIn profiles, company pages, Discord channels, Telegram groups, and X threads.
* **Built-in Transactional Outbox Pipeline:** ACID-compliant background job execution with automatic exponential backoff retry and rate-limit handling.
* **Human-in-the-Loop Governance (§14):** Programmatically enforce approval gates before AI-generated or junior-staff content is dispatched.
* **Enterprise White-Labeling:** Bring your own bot tokens, custom webhooks, and branded action buttons.
* **Zero-Trust Security:** Every third-party token is encrypted at rest using AES-256-GCM envelope encryption with unique 96-bit initialization vectors.

> [!TIP]
> For the in-depth architectural guide covering the Canonical Gateway, complete platform options, and endpoint mappings for Discord, Telegram, LinkedIn, X, and Meta, read the [Unified Publishing API & Omnichannel Platform Specification](./UNIFIED_AND_PLATFORM_APIS.md).

```mermaid
flowchart LR
    App["Your SaaS / AI Agent / CRM"] -->|POST /v1/posts<br/>with X-API-Key| Gateway["Scriora API Gateway<br/>(:4000 / api.scriora.io)"]
    Gateway -->|Transactional Outbox| DB[(PostgreSQL + Envelopes)]
    DB --> Dispatcher["Worker Outbox Sweeper"]
    Dispatcher --> LI["LinkedIn Adapter (OAuth PKCE)"]
    Dispatcher --> DC["Discord Adapter (Bot / Webhook)"]
    Dispatcher --> TG["Telegram Adapter (Bot API)"]
    Dispatcher --> X["X/Twitter Adapter (API v2)"]
```

---

## 2. 🔐 Authentication & Security

Scriora supports two authentication mechanisms:

### A. Workspace Developer API Keys (Recommended for Server-to-Server & B2B)
Pass your workspace secret key in the `X-API-Key` request header:
```http
X-API-Key: sk_live_9f83a84b12c3e5d7...
```
* API keys are scoped to a specific workspace and bypass interactive user login.
* Keys can be generated, rotated, or revoked via `POST /v1/workspaces/{wsId}/api-keys`.

### B. User Session Bearer Tokens (JWT)
Pass the JWT obtained from `POST /v1/auth/login` or `POST /v1/auth/register`:
```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## 3. 📋 Standard Headers & Multi-Tenancy

Every API request accepts and respects the following headers:

| Header | Required? | Description |
|---|:---:|---|
| `X-API-Key` | Required (if no Bearer) | Workspace developer key (`sk_live_...`) |
| `Authorization` | Required (if no API Key) | Bearer JWT session token |
| `X-Workspace-Id` | Required for scoped actions | UUID of the target workspace |
| `X-Request-Id` | Optional (Auto-generated) | Client-provided idempotency and tracing identifier (alphanumeric, max 64 chars) |
| `Content-Type` | Required for POST/PATCH | `application/json` |

---

## 4. 📦 Canonical Response Envelope & Error Taxonomy

Scriora guarantees strict, predictable response structures across all endpoints:

### Success Response Envelope:
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "requestId": "req_a7201749f9dd471c",
    "timestamp": "2026-09-11T20:14:52.760Z"
  }
}
```

### Error Response Envelope:
```json
{
  "success": false,
  "error": {
    "code": "INVALID_PAYLOAD",
    "category": "VALIDATION_ERROR",
    "message": "Invalid Discord connection payload",
    "retryable": false,
    "details": [
      {
        "field": "channelId",
        "message": "Invalid Discord channel snowflake ID"
      }
    ]
  },
  "meta": {
    "requestId": "req_error_123",
    "timestamp": "2026-09-11T20:15:00.000Z"
  }
}
```

### Standard Error Categories:
* `VALIDATION_ERROR`: Malformed JSON or schema constraint violated (HTTP 400).
* `AUTHENTICATION_ERROR`: Missing or expired token/key (HTTP 401).
* `AUTHORIZATION_ERROR`: Insufficient role or workspace boundary violation (HTTP 403).
* `NOT_FOUND`: Resource does not exist (HTTP 404).
* `CONFLICT`: Duplicate slug or unique constraint conflict (HTTP 409).
* `RATE_LIMITED`: Rate limit exceeded; check `retryAfterMs` (HTTP 429).
* `PLATFORM_ERROR`: Upstream social network error (HTTP 400/502).
* `INTERNAL_ERROR`: Unexpected system error; reported to telemetry (HTTP 500).

---

## 5. ⚡ Endpoints Reference

### 1. Workspaces & API Keys

#### Generate Developer API Key
```http
POST /v1/workspaces/{wsId}/api-keys
Content-Type: application/json
Authorization: Bearer <token>

{
  "name": "Production AI Agent Key",
  "expiresAt": "2027-01-01T00:00:00.000Z"
}
```

---

### 2. Social Destinations & Connection

#### Connect Telegram Destination
```http
POST /v1/connect/telegram
Content-Type: application/json
X-Workspace-Id: 4d2e70c7-3010-4d17-b3d8-cca91b5edbc6

{
  "botToken": "123456789:ABCdefGHIjklMNOpqrsTUVwxyz",
  "chatId": "-1001234567890",
  "channelTitle": "Acme VIP Telegram Channel"
}
```

#### Connect Discord Destination (Webhook Mode)
```http
POST /v1/connect/discord
Content-Type: application/json
X-Workspace-Id: 4d2e70c7-3010-4d17-b3d8-cca91b5edbc6

{
  "mode": "WEBHOOK",
  "webhookUrl": "https://discord.com/api/webhooks/1548060388333985863/opnFUzyl...",
  "channelTitle": "Discord Announcements"
}
```

#### Connect Discord Destination (Bot API Mode)
```http
POST /v1/connect/discord
Content-Type: application/json
X-Workspace-Id: 4d2e70c7-3010-4d17-b3d8-cca91b5edbc6

{
  "mode": "BOT",
  "botToken": "MTU0ODA2MTAzNTAzMjg3OTEyNA...",
  "channelId": "1520242595031285872",
  "guildId": "1503384965520293910",
  "channelTitle": "#announcements (Acme Server)"
}
```

#### Auto-Discover Discord Guilds & Channels
```http
GET /v1/connect/discord/channels?socialAccountId=1738cbb3-eeea-4608-844a-17e1ea85015c
X-Workspace-Id: 4d2e70c7-3010-4d17-b3d8-cca91b5edbc6
```
Returns all text, announcement, and forum channels accessible by the bot.

---

### 3. Publishing Engine (`POST /v1/posts`)

The central publishing endpoint dispatches unified or tailored content across any combination of destinations:

```http
POST /v1/posts
Content-Type: application/json
X-API-Key: sk_live_...
X-Workspace-Id: 4d2e70c7-3010-4d17-b3d8-cca91b5edbc6

{
  "body": "🚀 Announcing Scriora 2.0: The Developer-First Omnichannel Engine!",
  "targets": [
    {
      "platform": "DISCORD",
      "socialAccountId": "1738cbb3-eeea-4608-844a-17e1ea85015c",
      "platformOptions": {
        "platform": "DISCORD",
        "options": {
          "embedTitle": "⚡ Scriora Developer API Released",
          "embedDescription": "Orchestrate social media from your code with a single API call.",
          "embedColor": "#10B981",
          "embedFooter": "Scriora Developer Platform",
          "pinMessage": true,
          "autoReactions": ["🔥", "🚀", "🎉"]
        }
      }
    },
    {
      "platform": "TELEGRAM",
      "socialAccountId": "55555555-5555-4555-8555-555555555555",
      "customBody": "📢 <b>Scriora 2.0 API is Live!</b>\n\nCheck our documentation: https://scriora.io/docs"
    },
    {
      "platform": "LINKEDIN",
      "socialAccountId": "cb4013f4-e24c-4b96-b817-07bc42070dde",
      "platformOptions": {
        "platform": "LINKEDIN",
        "options": {
          "documentTitle": "Scriora_Architecture_Guide.pdf",
          "visibility": "PUBLIC"
        }
      }
    }
  ],
  "mediaUrls": [
    "https://cdn.scriora.io/assets/launch-banner.png"
  ],
  "scheduledAt": "2026-09-15T12:00:00.000Z"
}
```

---

### 4. Human-in-the-Loop Governance (§14 Approvals)

#### Inspect Pending Approval by Token
```http
GET /v1/approve/{token}
```

#### Submit Binding Decision (Approve / Reject)
```http
POST /v1/approve/{token}/decision
Content-Type: application/json

{
  "decision": "APPROVE",
  "reason": "Copy verified by compliance officer."
}
```

---

## 6. 💻 Code SDK Examples

### Node.js / TypeScript Example
```typescript
import { fetch } from 'undici';

const API_KEY = process.env.SCRIORA_API_KEY!;
const WORKSPACE_ID = process.env.SCRIORA_WORKSPACE_ID!;

async function publishUpdate() {
  const response = await fetch('https://api.scriora.io/v1/posts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
      'X-Workspace-Id': WORKSPACE_ID,
    },
    body: JSON.stringify({
      body: 'Hello world from the Scriora TypeScript SDK!',
      targets: [
        {
          platform: 'DISCORD',
          socialAccountId: '1738cbb3-eeea-4608-844a-17e1ea85015c',
        },
      ],
    }),
  });

  const result = await response.json();
  console.log('Publish result:', result);
}

publishUpdate();
```

### Python Example
```python
import os
import requests

API_KEY = os.getenv("SCRIORA_API_KEY")
WORKSPACE_ID = os.getenv("SCRIORA_WORKSPACE_ID")

payload = {
    "body": "Automated broadcast from Python worker.",
    "targets": [
        {
            "platform": "TELEGRAM",
            "socialAccountId": "55555555-5555-4555-8555-555555555555"
        }
    ]
}

headers = {
    "X-API-Key": API_KEY,
    "X-Workspace-Id": WORKSPACE_ID,
    "Content-Type": "application/json"
}

res = requests.post("https://api.scriora.io/v1/posts", json=payload, headers=headers)
print("Response:", res.json())
```

---

## 7. 🧪 Interactive Playground & Live Swagger

* **Live Interactive Documentation (Swagger UI):** Visit `http://localhost:4000/docs` (development) or `https://scriora.io/docs/api`.
* **Download Raw Specification:** `GET /openapi.json`.
