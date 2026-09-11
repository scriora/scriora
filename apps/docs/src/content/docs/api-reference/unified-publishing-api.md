---
title: "Unified Omnichannel Publishing API"
description: "Canonical single gateway specification, multi-platform payload schema, and platform-by-platform options reference."
---

import { Tabs, TabItem } from '@astrojs/starlight/components';

## 🏛️ Architecture Overview

The **Scriora Unified Publishing Engine** eliminates the need for separate integrations per social platform. By connecting to `POST /v1/posts`, applications dispatch to 10+ social networks concurrently through an ACID-compliant **Transactional Outbox** pipeline backed by **AES-256-GCM** envelope encryption.

---

## 📋 The Canonical Payload (`POST /v1/posts`)

```http
POST /v1/posts
Content-Type: application/json
X-API-Key: sk_live_...
X-Workspace-Id: 4d2e70c7-3010-4d17-b3d8-cca91b5edbc6
```

```json
{
  "body": "🚀 Announcing Scriora 2.0: The Developer-First Omnichannel Engine!",
  "targets": [
    {
      "platform": "DISCORD",
      "socialAccountId": "74c20e0d-fcd9-426f-9b81-210075bd175e",
      "platformOptions": {
        "platform": "DISCORD",
        "options": {
          "embedTitle": "⚡ Scriora Developer Platform Live",
          "embedDescription": "• Unified REST API\n• Auto-Reactions & Auto-Pin\n• Channel Auto-Discovery",
          "embedColor": "#10B981",
          "pinMessage": true,
          "autoReactions": ["🔥", "🚀", "🎉"]
        }
      }
    },
    {
      "platform": "TELEGRAM",
      "socialAccountId": "55555555-5555-4555-8555-555555555555",
      "customBody": "📢 <b>Scriora 2.0 API is Live!</b>\n\nCheck our docs: https://scriora.io/docs"
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
    "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800"
  ]
}
```

---

## 🎯 Platform-Specific Capabilities

### Discord Suite
- **Modes**: Webhook or Bot Token (`POST /v1/connect/discord`)
- **Discovery**: Auto-discovers guilds & channels (`GET /v1/connect/discord/channels`)
- **Least-Privilege Setup (No Administrator Needed)**:
  - **Standard Publisher** (`309237763072`): View Channels, Send Messages, Embed Links, Attach Files, Read History, Threads.
  - **Power Suite (Recommended)** (`326419999808`): Adds Add Reactions, Pin Messages, Manage Messages, Use External Emojis, Manage Threads.
  - **1-Click Invite Pattern**:
    `https://discord.com/oauth2/authorize?client_id={CLIENT_ID}&permissions=326419999808&scope=bot%20applications.commands`
- **Power Options**:
  - `pinMessage: boolean` — Auto-pins message to channel
  - `autoReactions: string[]` — Instantly adds bot reactions (e.g. `['🔥', '🚀']`)
  - `threadName: string` — Spawns forum or message thread
  - `embedColor: string | number` — Hex or integer card color
  - `allowEveryoneMention: boolean` — Guard against unauthorized mass pings

### Telegram Suite
- **Modes**: Bot Token & Chat ID (`POST /v1/connect/telegram`)
- **Formatting**: HTML (`<b>`, `<i>`, `<code>`, `<a href="...">`)
- **Governance (§14)**: Native inline approval buttons with Ed25519 webhook callbacks

### LinkedIn Suite
- **Modes**: OAuth 2.0 PKCE with automatic refresh (`GET /v1/connect/linkedin`)
- **Destinations**: Personal Profiles and Organization Pages
- **Special Formats**: Document Carousels (`documentTitle` with PDF URL), Long-form Articles

### X (Twitter) Suite
- **Modes**: OAuth 2.0 PKCE (`GET /v1/connect/x`)
- **Threading Engine**: Auto-splits posts exceeding 280 characters with linked parent/reply IDs
- **Accessibility**: Enforces `altText` for WCAG AA compliance

---

## 📊 Comparison Matrix

| Platform | Max Text | Max Images | Carousel / Album | Threads | Auto-Reactions | Pinning |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Discord** | 2,000 | 10 (4 collage) | ✅ | ✅ | ✅ | ✅ |
| **Telegram** | 4,096 | 10 | ✅ | ❌ | ❌ | ✅ |
| **LinkedIn** | 3,000 | 9 (or PDF) | ✅ (PDF) | ❌ | ❌ | ❌ |
| **X (Twitter)**| 280 | 4 | ❌ | ✅ (Auto) | ❌ | ❌ |
| **Instagram** | 2,200 | 10 | ✅ | ❌ | ❌ | ❌ |
| **TikTok** | 2,200 | 35 | ✅ | ❌ | ❌ | ❌ |
| **Facebook** | 63,206 | 10 | ✅ | ❌ | ❌ | ❌ |
