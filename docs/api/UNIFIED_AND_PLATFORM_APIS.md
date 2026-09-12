# 🌐 Scriora Unified Publishing API & Omnichannel Platform Specification

> **Specification Level:** Enterprise API Product (v1.0.0)  
> **Core Architecture:** Canonical Single Gateway + Transactional Outbox + Platform Adapters  
> **Standard:** OpenAPI 3.0.3 ([Download openapi.json](./openapi.json))  
> **Security Model:** Zero-Trust Envelope Encryption (AES-256-GCM) & Multi-Tenant Isolated  

---

## 1. 🏛️ Architecture of the Unified Publishing Engine

In a traditional social media architecture, software applications must build and maintain bespoke API integrations for each social network. Every network introduces incompatible authentication paradigms (OAuth 2.0 PKCE, Bot Tokens, Long-lived Bearer tokens, Webhooks), conflicting rate-limit headers, and disjointed payloads.

**Scriora eliminates this fragmentation through a single Canonical Gateway (`POST /v1/posts`).**

```mermaid
flowchart TD
    Client["Client Application / AI Agent / CRM / UI"] -->|POST /v1/posts<br/>(Unified Canonical Payload)| Gateway["Scriora API Gateway (:4000)"]
    
    subgraph Gateway_Validation ["1. Gateway Tier"]
        Gateway --> Auth["Auth & Tenant Guard (JWT / X-API-Key)"]
        Auth --> Schema["Zod Schema Validation (PublishPayloadSchema)"]
        Schema --> Gov{"Requires Approval?<br/>(Governance §14)"}
    end
    
    Gov -->|Yes| Approvals["Create Approval & Send HMAC Token<br/>(Telegram / Discord / Webhook)"]
    Gov -->|No / Approved| Outbox["Create OutboxCommand (Transactional Outbox)"]
    
    subgraph Storage ["2. ACID Storage & Cryptographic Vault"]
        Outbox --> DB[(PostgreSQL)]
        DB --> Vault[(Secret Envelopes - AES-256-GCM)]
    end
    
    subgraph Worker_Tier ["3. Worker & Dispatch Tier"]
        Sweeper["Worker Sweeper / Inngest Queue"] -->|Claim Command| Dispatcher["Outbox Dispatcher"]
        Dispatcher --> Decrypt["Decrypt Token in RAM"]
        Dispatcher --> Registry["Platform Registry"]
    end
    
    subgraph Platform_Adapters ["4. Platform Adapters (scriora-social)"]
        Registry --> DiscordAdapter["DiscordAdapter (Bot / Webhook)"]
        Registry --> TelegramAdapter["TelegramAdapter (Bot API)"]
        Registry --> LinkedInAdapter["LinkedInAdapter (REST v2)"]
        Registry --> XAdapter["XAdapter (Twitter API v2)"]
        Registry --> MetaAdapter["Instagram / Facebook Adapter"]
        Registry --> TikTokAdapter["TikTok Content API"]
    end
    
    DiscordAdapter --> Discord["Discord API v10"]
    TelegramAdapter --> Telegram["Telegram Bot API"]
    LinkedInAdapter --> LinkedIn["LinkedIn Community API"]
    XAdapter --> XTwitter["X API v2"]
```

---

## 2. 📋 The Unified API Contract (`POST /v1/posts`)

The unified publishing endpoint abstracts heterogeneous social networks while preserving platform-native superpowers.

### Endpoint Definition
```http
POST /v1/posts
Content-Type: application/json
X-API-Key: sk_live_... (or Authorization: Bearer <jwt>)
X-Workspace-Id: {workspaceId}
```

### Unified Request Payload Schema
```typescript
export interface PublishPayload {
  /** Universal body text (used by all targets unless overridden by customBody) */
  body: string;

  /** 1 to 10 destination targets */
  targets: PublishTarget[];

  /** Media URLs (Images, Videos, PDFs) */
  mediaUrls?: string[];

  /** ISO 8601 future timestamp for scheduled broadcast (e.g. "2026-09-15T12:00:00.000Z") */
  scheduledAt?: string;
}

export interface PublishTarget {
  /** Target platform type */
  platform: 
    | 'DISCORD' 
    | 'TELEGRAM' 
    | 'LINKEDIN' 
    | 'X' 
    | 'INSTAGRAM' 
    | 'TIKTOK' 
    | 'YOUTUBE' 
    | 'THREADS' 
    | 'FACEBOOK' 
    | 'BLUESKY' 
    | 'PINTEREST';

  /** UUID of the connected social account in Scriora */
  socialAccountId: string;

  /** Optional message override specific to this destination */
  customBody?: string;

  /** Discriminated union of platform-specific features */
  platformOptions?: PlatformOptions;
}
```

### Synchronous Gateway Response (`202 Accepted`)
```json
{
  "success": true,
  "data": {
    "message": "Publication queued for dispatch",
    "contentId": "bee51d97-9618-42ca-bdde-1e489d016dcc",
    "publications": [
      {
        "publicationId": "94376995-ec2a-4c6f-b752-6eb0ca4cb841",
        "platform": "DISCORD",
        "status": "READY",
        "outboxCommandId": "0923b969-58a3-41c4-9d48-6d4bc83f2a27"
      },
      {
        "publicationId": "c51a0293-1284-4841-8c4b-140284018241",
        "platform": "LINKEDIN",
        "status": "PENDING_APPROVAL",
        "outboxCommandId": "7320b969-12a3-41c4-9d48-6d4bc83f1011"
      }
    ]
  },
  "meta": {
    "requestId": "req_7b6fe80dc00d46cd",
    "timestamp": "2026-09-11T20:27:06.676Z"
  }
}
```

---

## 3. 🎯 Platform-by-Platform API & Options Reference

---

### A. Discord Integration Suite

Discord supports two distinct integration modes: **Webhook Mode** (instant broadcast) and **Bot API Mode** (channel discovery, threads, reactions, pins, and approvals).

#### 1. Endpoints Catalog
| Endpoint | Method | Purpose |
|---|:---:|---|
| `/v1/connect/discord` | `POST` | Connect Webhook or Bot Token destination |
| `/v1/connect/discord/channels` | `GET` | Auto-discover servers and accessible channels |
| `/v1/posts` | `POST` | Dispatch message, embeds, pins, and reactions |

#### 2. Upstream Discord Endpoints Mapped by Scriora
* `POST /webhooks/{webhook.id}/{webhook.token}?wait=true` — Webhook publishing
* `POST /channels/{channel.id}/messages` — Bot message publishing
* `PUT /channels/{channel.id}/pins/{message.id}` — Automated message pinning
* `PUT /channels/{channel.id}/messages/{message.id}/reactions/{emoji}/@me` — Automated bot reactions
* `POST /channels/{channel.id}/messages/{message.id}/threads` — Automated thread creation
* `DELETE /channels/{channel.id}/messages/{message.id}` — Post deletion

#### 3. Platform Options (`platformOptions.options`)
```typescript
export interface DiscordOptions {
  /** Custom embed title (up to 256 characters) */
  embedTitle?: string;
  /** Custom markdown description (up to 4,096 characters) */
  embedDescription?: string;
  /** Hex color string ('#10B981') or decimal integer (1096065) */
  embedColor?: string | number;
  /** Custom embed footer text (up to 2,048 characters) */
  embedFooter?: string;
  /** Custom sender username (Webhook mode only) */
  username?: string;
  /** Custom avatar URL (Webhook mode only) */
  avatarUrl?: string;
  /** Automatically pin the message after posting (requires PIN_MESSAGES) */
  pinMessage?: boolean;
  /** List of Unicode emojis or custom emoji identifiers to react with */
  autoReactions?: string[];
  /** Forum thread title or thread to spawn under post */
  threadName?: string;
  /** Explicitly allow @everyone and role mentions */
  allowEveryoneMention?: boolean;
}
```

#### 4. Permission Requirements (Least-Privilege & Zero-Trust Matrix)

In compliance with enterprise security policies, Scriora **never requires the `Administrator` (`0x8`) permission**. You can invite the bot using granular permissions:

| Permission Name | Bitflag | Hex | Feature Dependent on This Permission |
|---|:---:|:---:|---|
| `VIEW_CHANNEL` | `1024` | `0x400` | Automated channel and guild discovery |
| `SEND_MESSAGES` | `2048` | `0x800` | Publishing base text and link previews |
| `READ_MESSAGE_HISTORY` | `65536` | `0x10000` | Verification sweeps and idempotency |
| `EMBED_LINKS` | `16384` | `0x4000` | Rich embed cards, colored banners, author/footer |
| `ATTACH_FILES` | `32768` | `0x8000` | Images, videos, and multi-image collage albums |
| `CREATE_PUBLIC_THREADS`| `34359738368` | `0x800000000` | Spawning discussion threads and forum channel topics |
| `SEND_MESSAGES_IN_THREADS`| `274877906944` | `0x4000000000` | Posting follow-up messages inside threads |
| `ADD_REACTIONS` | `64` | `0x40` | Automated reaction emojis matrix |
| `MANAGE_MESSAGES` | `8192` | `0x2000` | **Pinning announcements** and lifecycle post deletion |
| `USE_EXTERNAL_EMOJIS` | `262144` | `0x40000` | Custom server emotes in reactions |
| `MANAGE_THREADS` | `17179869184` | `0x400000000` | Managing and locking spawned discussion threads |

* **Minimal Text Only Bitfield:** `68608` (`0x10C00`)
* **Standard Visual Publisher Bitfield:** `309237763072` (`0x480001CC00`)
* **Power Suite Bitfield (Recommended):** `326419999808` (`0x4C00056C40`)
* **Enterprise Invite URL Pattern:**
  ```text
  https://discord.com/oauth2/authorize?client_id={CLIENT_ID}&permissions=326419999808&scope=bot%20applications.commands
  ```
* **Graceful Degradation:** If the bot lacks `MANAGE_MESSAGES` or `ADD_REACTIONS`, the primary post is published successfully without throwing an error, and `pinned: false` is recorded in `platformMetadata`. The dispatch never fails entirely due to non-critical permission omissions.

---

### B. Telegram Integration Suite

Telegram operates via the high-speed Telegram Bot API with native HTML/MarkdownV2 formatting and interactive inline keyboards.

#### 1. Endpoints Catalog
| Endpoint | Method | Purpose |
|---|:---:|---|
| `/v1/connect/telegram` | `POST` | Connect Telegram Bot and Chat ID destination |
| `/v1/connect/telegram/verify` | `GET` | Verify bot connectivity and fetch chat title |
| `/v1/webhooks/telegram` | `POST` | Ingest interactive button clicks (Approvals §14) |

#### 2. Upstream Telegram Endpoints Mapped by Scriora
* `POST /bot{token}/sendMessage` — HTML-formatted text broadcasts
* `POST /bot{token}/sendPhoto` — Single image with caption
* `POST /bot{token}/sendVideo` — Video broadcast with caption
* `POST /bot{token}/sendMediaGroup` — Multi-image carousel / album (up to 10 items)
* `POST /bot{token}/editMessageReplyMarkup` — Dynamic approval button updates
* `POST /bot{token}/deleteMessage` — Post deletion

#### 3. Platform Options (`platformOptions.options`)
```typescript
export interface TelegramOptions {
  /** Disable web page preview in Telegram message */
  disableWebPagePreview?: boolean;
  /** Send message silently without sound notification */
  disableNotification?: boolean;
  /** Protect content from being forwarded or saved */
  protectContent?: boolean;
  /** Reply to an existing message ID */
  replyToMessageId?: number;
}
```

---

### C. LinkedIn Integration Suite

LinkedIn connects via OAuth 2.0 with Proof Key for Code Exchange (PKCE), supporting Personal Profiles and Company Pages.

#### 1. Endpoints Catalog
| Endpoint | Method | Purpose |
|---|:---:|---|
| `/v1/connect/linkedin` | `GET` | Initiate LinkedIn OAuth 2.0 PKCE redirect |
| `/v1/connect/linkedin/callback` | `GET` | Exchange authorization code for encrypted tokens |
| `/v1/connect/linkedin/organizations` | `GET` | List company pages where the user is an Administrator |

#### 2. Upstream LinkedIn REST Endpoints Mapped by Scriora
* `POST /rest/posts` — Share text, articles, and media
* `POST /rest/images?action=initializeUpload` — Two-step image binary upload
* `POST /rest/videos?action=initializeUpload` — Two-step video binary upload
* `DELETE /rest/posts/{postUrn}` — Delete post

#### 3. Platform Options (`platformOptions.options`)
```typescript
export interface LinkedInOptions {
  /** Post as a long-form article instead of a standard feed post */
  postAsArticle?: boolean;
  /** Title of the document carousel (requires mediaUrls pointing to a PDF) */
  documentTitle?: string;
  /** Visibility setting: PUBLIC or CONNECTIONS */
  visibility?: 'PUBLIC' | 'CONNECTIONS';
}
```

---

### D. X (Twitter) Integration Suite

X connects via OAuth 2.0 PKCE, enforcing the 280-character boundary with native thread splitting.

#### 1. Endpoints Catalog
| Endpoint | Method | Purpose |
|---|:---:|---|
| `/v1/connect/x` | `GET` | Initiate X OAuth 2.0 PKCE redirect |
| `/v1/connect/x/callback` | `GET` | Exchange code for tokens and store in SecretEnvelope |

#### 2. Upstream X Endpoints Mapped by Scriora
* `POST https://api.twitter.com/2/tweets` — Post single tweet or thread replies
* `POST https://upload.twitter.com/1.1/media/upload.json` — Chunked media upload
* `DELETE https://api.twitter.com/2/tweets/{tweetId}` — Delete tweet

#### 3. Platform Options (`platformOptions.options`)
```typescript
export interface XOptions {
  /** Automatically split posts exceeding 280 characters into a numbered thread */
  threadMode?: boolean;
  /** Reply to an existing tweet ID */
  replyToId?: string;
  /** Accessible image description for WCAG compliance */
  altText?: string;
}
```

---

### E. Meta Platforms (Instagram & Facebook)

Connected via Meta Graph API v19.0.

#### 1. Upstream Meta Endpoints Mapped
* `POST /{ig-user-id}/media` — Create media container
* `POST /{ig-user-id}/media_publish` — Publish container to feed
* `POST /{page-id}/feed` — Facebook page publishing

#### 2. Platform Options
```typescript
export interface InstagramOptions {
  /** Format of the Instagram post */
  postType?: 'FEED' | 'REEL' | 'STORY' | 'CAROUSEL';
  /** Co-author Instagram handle for collaboration posts */
  collabHandle?: string;
  /** Hide like and view count */
  hideLikeCount?: boolean;
  /** Disable comments on this post */
  disableComments?: boolean;
}
```

---

### F. TikTok Integration Suite

Connected via TikTok Content Posting API v2.

#### Platform Options
```typescript
export interface TikTokOptions {
  /** Enable or disable duets */
  duetEnabled?: boolean;
  /** Enable or disable stitching */
  stitchEnabled?: boolean;
  /** Content visibility: PUBLIC, FRIENDS, or PRIVATE */
  privacy?: 'PUBLIC' | 'FRIENDS' | 'PRIVATE';
  /** Mark as commercial or sponsored content */
  isSponsored?: boolean;
}
```

---

## 4. 🚀 Example: Multi-Platform Omnichannel Publish

This single API request publishes an announcement to **Discord** (with embed, pin, and reactions), **Telegram** (with HTML formatting), and **LinkedIn** (with PDF Document Carousel):

```bash
curl -X POST http://localhost:4000/v1/posts \
  -H "Content-Type: application/json" \
  -H "X-API-Key: sk_live_your_workspace_api_key" \
  -H "X-Workspace-Id: 4d2e70c7-3010-4d17-b3d8-cca91b5edbc6" \
  -d '{
    "body": "🚀 Scriora 2.0 is officially released! Check out the developer manual.",
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
        "customBody": "📢 <b>Scriora 2.0 API is Live!</b>\n\nFull documentation at <a href=\"https://scriora.io/docs\">scriora.io/docs</a>"
      },
      {
        "platform": "LINKEDIN",
        "socialAccountId": "cb4013f4-e24c-4b96-b817-07bc42070dde",
        "platformOptions": {
          "platform": "LINKEDIN",
          "options": {
            "documentTitle": "Scriora_Architecture_Whitepaper_v2.pdf",
            "visibility": "PUBLIC"
          }
        }
      }
    ],
    "mediaUrls": [
      "https://cdn.scriora.io/assets/scriora_whitepaper.pdf"
    ]
  }'
```

---

## 5. 📊 Comparison & Capability Matrix

| Platform | Status | Text Limit | Max Images | Max Video Size | Native Threads | Rich Embeds | Auto-Reactions | Pinning | Approvals (§14) |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Discord** | 🟢 Live | 2,000 | 10 (4 collage) | 25 MB | ✅ | ✅ | ✅ | ✅ | ✅ (Buttons) |
| **Telegram** | 🟢 Live | 4,096 | 10 | 2 GB | ❌ | ❌ | ❌ | ✅ | ✅ (Inline Keyboard) |
| **LinkedIn** | 🟢 Live | 3,000 | 9 (or PDF) | 5 GB | ❌ | ✅ | ❌ | ❌ | ❌ |
| **X (Twitter)**| 🟢 Live | 280 | 4 | 512 MB | ✅ (Auto) | ❌ | ❌ | ❌ | ❌ |
| **Instagram** | 🟡 In Progress | 2,200 | 10 | 100 MB | ❌ | ❌ | ❌ | ❌ | ❌ |
| **TikTok** | 🟡 In Progress | 2,200 | 35 | 4 GB | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Facebook** | 🟡 In Progress | 63,206 | 10 | 10 GB | ❌ | ✅ | ❌ | ❌ | ❌ |
| **Reddit** | 📋 Roadmap | 40,000 | 1 (or Link) | 1 GB | ❌ | ❌ (Markdown) | ❌ | ❌ | ❌ |

---

## 6. 🔒 Error Handling & Resiliency

All platform errors are normalized into standard HTTP response codes and serialized into `publish_attempts`:

```json
{
  "success": false,
  "error": {
    "code": "DISCORD_MISSING_PERMISSIONS",
    "category": "AUTHORIZATION",
    "message": "Discord Bot is missing required permissions in this channel (requires: Send Messages, Embed Links, or Attach Files)",
    "retryable": false
  }
}
```
If an outbox job encounters a temporary network timeout or rate limit (`RATE_LIMITED`), the Inngest Outbox Sweeper retries with exponential backoff respecting upstream `retryAfterMs`. Permanent failures (`DISCORD_MISSING_PERMISSIONS`, `401 Unauthorized`) update the state immediately to `FAILED_PERMANENT` without wasteful retries.
