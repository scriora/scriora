# 🎮 Discord Omnichannel & Interactive Bot Integration Guide

> **Status:** Production-Ready | **Module:** `scriora-social`, `scriora-api`, `scriora-worker`  
> **Security Level:** Zero-Trust Encrypted (AES-256-GCM Envelope)  
> **Governance:** Human-in-the-Loop (§14 Interactive ActionRow Approvals) & Transactional Outbox Reliability

---

## 1. 🌐 Overview & Architectural Topology

Scriora treats Discord as a premier, high-velocity community channel. Through the `@scriora/social` layer and Transactional Outbox pipeline, creators and SaaS teams can orchestrate **rich announcements**, **multi-image gallery drops**, **forum discussions**, and **interactive Human-in-the-Loop approval workflows (§14)** across unlimited Discord servers and channels.

```mermaid
flowchart TD
    subgraph Discord Ecosystem
        Creator["Content Team / Admin"]
        DiscordServer["Target Discord Server (Guild)"]
        AnnounceChannel["📢 #announcements (Type 5)"]
        TextChannel["💬 #general (Type 0)"]
        ForumChannel["🧵 #product-feedback (Type 15 Forum)"]
        AdminChannel["🛡️ #scriora-approvals (Admin Only)"]
    end

    subgraph Scriora API Gateway
        ConnectAPI["POST /v1/connect/discord<br/>(Webhook or Bot Mode)"]
        DiscoveryAPI["GET /v1/connect/discord/channels<br/>(Dynamic Guild & Channel Sync)"]
        InteractionsWH["POST /v1/webhooks/discord/interactions<br/>(Ed25519 Verified C2)"]
    end

    subgraph Security & Persistence
        DB[(PostgreSQL + Prisma)]
        Envelopes["Secret Envelopes<br/>(AES-256-GCM Master Key)"]
        Outbox["Transactional Outbox Queue<br/>(ACID Consistency)"]
    end

    subgraph Outbox Worker & Social Dispatcher
        Worker["Inngest Outbox Dispatcher"]
        DiscordAdapter["DiscordAdapter (scriora-social)"]
        RateLimiter["Discord Rate Limiter (X-RateLimit)"]
    end

    Creator -->|Connects Account| ConnectAPI
    ConnectAPI --> DiscoveryAPI
    DiscoveryAPI --> DiscordServer
    ConnectAPI -->|Encrypt Token/Webhook| Envelopes
    ConnectAPI --> DB

    Creator -->|Submits Post with Draft| DB
    DB --> Outbox
    Outbox --> Worker
    Worker --> RateLimiter
    RateLimiter --> DiscordAdapter

    DiscordAdapter -->|Mode 1: POST Webhook URL| AnnounceChannel
    DiscordAdapter -->|Mode 2: POST /channels/{id}/messages| TextChannel
    DiscordAdapter -->|Mode 2: Create Forum Thread| ForumChannel
    DiscordAdapter -->|§14 Approval Card with Buttons| AdminChannel

    AdminChannel -->|Tap [Approve] / [Reject]| InteractionsWH
    InteractionsWH -->|Update Publication & Trigger Outbox| DB
```

---

## 2. 📋 Dual Connection Modes: Instant Webhook vs. Official Bot API (BYOB)

Scriora provides two distinct operational modes designed for maximum flexibility:

| Feature & Capability | Mode 1: Incoming Webhooks ⚡ | Mode 2: Discord Bot API v10 (BYOB) 🤖 |
|---|:---:|:---:|
| **Target Audience** | Quick onboarding, solo creators, read-only alerts | Community builders, agencies, enterprise DAOs |
| **Setup Duration** | **10 seconds** (copy & paste URL) | **2 minutes** (Discord Developer Portal) |
| **Permissions Required** | "Manage Webhooks" on channel | Bot invite with "Send Messages" & "Embed Links" |
| **Server & Channel Discovery** | Manual URL copy per channel | ⚡ **Automated 1-Click Dropdown Selection** |
| **Custom Name & Avatar per Post** | ✅ **Yes** (dynamic `username` & `avatarUrl`) | Configured on Bot Application profile |
| **Rich Embeds & Custom Colors** | ✅ **Yes** (Full markdown & Hex/Int colors) | ✅ **Yes** (Full markdown & Hex/Int colors) |
| **Multi-Image Album Collages** | ✅ **Yes** (up to 4 images per grid) | ✅ **Yes** (up to 4 images per grid) |
| **Forum Channels (Type 15)** | ⚠️ Query param `thread_id` required | ✅ **Native** (automatic thread title creation) |
| **Announcement Threads** | ⚠️ Query param `thread_id` required | ✅ **Native** |
| **Interactive ActionRow Buttons (§14)**| ❌ Prohibited by Discord protocol | ✅ **Yes** (Interactive Approval Buttons) |
| **Role Mentions & Ping Controls** | ✅ Yes (`allowed_mentions`) | ✅ Yes (`allowed_mentions`) |

---

## 3. 🛠️ Step-by-Step Requirements & Setup Guide

### Mode 1: Instant Webhook Connection (10 Seconds)

1. Open your Discord server on desktop or web browser.
2. Right-click your target channel (e.g. `#announcements` or `#general`) -> click **Edit Channel** (⚙️).
3. Select **Integrations** from the left-hand menu -> click **Webhooks**.
4. Click **New Webhook**, name it `Scriora Dispatcher`, and confirm the target channel.
5. Click **Copy Webhook URL**. The URL adheres to this format:
   ```text
   https://discord.com/api/webhooks/{WEBHOOK_ID}/{WEBHOOK_TOKEN}
   ```
6. In the Scriora Dashboard or via API endpoint `POST /v1/connect/discord`, paste the URL.

---

### Mode 2: Official Bot / Custom Brand Bot (Bring Your Own Bot - BYOB)

To unlock automated channel discovery, native forum threads, and Human-in-the-Loop (§14) interactive buttons, connect via Bot API:

#### 1. Create Application in Discord Developer Portal
1. Navigate to the official [Discord Developer Portal](https://discord.com/developers/applications).
2. Click **New Application** at the top right.
3. Enter your bot name (e.g. `Scriora Bot` or your brand name).
4. *(Optional)* Upload your brand icon as the App Icon (1024x1024 PNG/WebP).

#### 2. Configure Bot Token & Privileged Gateway Intents
1. In the left navigation menu, click **Bot**.
2. Under the **Token** section, click **Reset Token**, confirm password/2FA, and copy the generated token:
   ```text
   YOUR_DISCORD_BOT_TOKEN_HERE
   ```
   > [!IMPORTANT]
   > Discord displays this token **only once**. Save it securely in your `.env` or paste it directly into Scriora's Connect Modal. It will be encrypted immediately via AES-256-GCM.
3. Scroll down to **Privileged Gateway Intents** and enable:
   - ✅ **Message Content Intent** (required for receiving command arguments and interaction feedback).
4. Click **Save Changes**.

#### 3. Generate 1-Click Bot Invite Link
1. In the left menu, navigate to **OAuth2** -> **URL Generator**.
2. Under **Scopes**, select:
   - `[✔] bot`
   - `[✔] applications.commands`
3. Under **Bot Permissions**, select:
   - `[✔] View Channels`
   - `[✔] Send Messages`
   - `[✔] Send Messages in Threads`
   - `[✔] Create Public Threads`
   - `[✔] Embed Links`
   - `[✔] Attach Files`
   - `[✔] Read Message History`
4. The generated permission integer is: `397284550720`.
5. Copy the generated invite link:
   ```text
   https://discord.com/oauth2/authorize?client_id={CLIENT_ID}&permissions=397284550720&scope=bot%20applications.commands
   ```
6. Open this link in your browser, select your Discord server from the dropdown, and click **Authorize**.

---

## 4. 🔍 Automated Server & Channel Discovery Engine

When connected via **Bot API Mode**, creators never need to search for numerical snowflake channel IDs manually. Scriora automatically discovers all servers and text/announcement/forum channels the bot has access to:

### API Discovery Endpoint (`GET /v1/connect/discord/channels`)

```http
GET /v1/connect/discord/channels?socialAccountId=74c20e0d-fcd9-426f-9b81-210075bd175e
x-workspace-id: 4d2e70c7-3010-4d17-b3d8-cca91b5edbc6
```

### JSON Response:
```json
{
  "success": true,
  "data": {
    "guilds": [
      {
        "id": "1503384965520293910",
        "name": "Acme Community HQ",
        "icon": "a_1234567890abcdef"
      }
    ],
    "channels": [
      {
        "id": "1520242595031285872",
        "name": "announcements",
        "type": 5,
        "typeName": "ANNOUNCEMENT",
        "guildId": "1503384965520293910",
        "guildName": "Acme Community HQ"
      },
      {
        "id": "1503384965520293913",
        "name": "general",
        "type": 0,
        "typeName": "TEXT",
        "guildId": "1503384965520293910",
        "guildName": "Acme Community HQ"
      },
      {
        "id": "1503384965520293919",
        "name": "product-feedback",
        "type": 15,
        "typeName": "FORUM",
        "guildId": "1503384965520293910",
        "guildName": "Acme Community HQ"
      }
    ]
  },
  "requestId": "req_disc_01"
}
```

In the Scriora Web Composer, this populates a categorized dropdown allowing creators to select `#announcements` or `#product-feedback` with a single click.

---

## 5. 🎨 Payload Specification & Rich Embed Engine

Scriora's `DiscordAdapter` supports Discord's full rich embed schema via `DiscordOptionsSchema`:

```typescript
export interface DiscordOptions {
  /** Custom embed title (up to 256 characters) */
  embedTitle?: string;
  /** Custom markdown description (up to 4,096 characters) */
  embedDescription?: string;
  /** Hex color string ('#5865F2', '#10B981') or decimal integer (5793266) */
  embedColor?: string | number;
  /** Custom footer note (up to 2,048 characters) */
  embedFooter?: string;
  /** Custom sender username (Webhook mode only, up to 80 characters) */
  username?: string;
  /** Custom avatar URL (Webhook mode only) */
  avatarUrl?: string;
  /** Forum thread title when publishing to a Forum Channel (Type 15) */
  threadName?: string;
}
```

### Publishing Rich Embed with Multi-Image Album:

Discord allows up to **4 images** to be displayed in a seamless 2x2 collage by sharing identical `url` fields across embeds:

```http
POST /v1/posts
Content-Type: application/json
x-workspace-id: 4d2e70c7-3010-4d17-b3d8-cca91b5edbc6

{
  "body": "🚀 **Scriora 2.0 is Officially Live!**\n\nWe have completely revamped our omnichannel distribution engine. Read the highlights below 👇",
  "targets": [
    {
      "platform": "DISCORD",
      "socialAccountId": "74c20e0d-fcd9-426f-9b81-210075bd175e",
      "platformOptions": {
        "platform": "DISCORD",
        "options": {
          "embedTitle": "⚡ Enterprise Distribution Engine Activated",
          "embedDescription": "• Zero-Trust Token Envelopes\n• Transactional Outbox Pipeline\n• Real-Time Human Governance",
          "embedColor": "#10B981",
          "embedFooter": "Scriora Omnichannel Suite • Verified Dispatch"
        }
      }
    }
  ],
  "mediaUrls": [
    "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800",
    "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=800"
  ]
}
```

---

## 6. 🛡️ Human-in-the-Loop Governance (§14 Approvals via ActionRow Buttons)

Just as Telegram provides inline keyboard approvals, Scriora equips Discord with **native Message Components**:

```text
┌────────────────────────────────────────────────────────┐
│ 🛡️ New Content Approval Required (Governance §14)     │
│                                                        │
│ 📋 Platform: DISCORD & LINKEDIN                        │
│ 🏷️ Campaign: Q3 Product Milestone                     │
│ ⏰ Scheduled For: Immediate                           │
│                                                        │
│ > 🚀 Scriora 2.0 is live with zero-trust envelopes...  │
│                                                        │
│ [ ✅ Approve & Publish ]  [ ❌ Reject ]  [ 🌐 View ]  │
└────────────────────────────────────────────────────────┘
```

### Discord Component Payload Structure:
```json
{
  "components": [
    {
      "type": 1,
      "components": [
        {
          "type": 2,
          "style": 3,
          "label": "Approve & Publish ✅",
          "custom_id": "approve_app_74c20e0d"
        },
        {
          "type": 2,
          "style": 4,
          "label": "Reject Draft ❌",
          "custom_id": "reject_app_74c20e0d"
        },
        {
          "type": 2,
          "style": 5,
          "label": "View Draft in Scriora 🌐",
          "url": "https://scriora.io/dashboard/approvals/app_74c20e0d"
        }
      ]
    }
  ]
}
```

### Interaction Webhook Verification (`POST /v1/webhooks/discord/interactions`):
1. Discord dispatches button clicks to Scriora's Interaction Webhook.
2. The payload is verified cryptographically using the bot's `PUBLIC_KEY` via **Ed25519** signature verification.
3. Upon approval:
   - The token is consumed.
   - The publication state changes from `PENDING_APPROVAL` to `READY`.
   - The Outbox Dispatcher fires instantly.
   - The Discord message updates dynamically to show: `✅ Approved by @Admin at 14:32 UTC`.

---

## 7. 🧵 Forum Channels (Type 15) & Announcement Threads

Discord Forum channels require every new root post to specify a `name` (the thread title). Scriora handles this natively:

1. In `platformOptions.options.threadName`, provide the thread title (e.g. `Scriora v2.0 Architecture Discussion`).
2. `DiscordAdapter` detects the target channel type (`type === 15`).
3. Sends `POST /channels/{channelId}/threads` containing `name` and the embed payload.
4. Discord creates the thread and publishes the card as the starter message.

---

## 8. 🚨 Error Handling & Rate Limiting (Discord Bucket Logic)

Discord enforces rigorous rate limits tracked via response headers:

| Header | Description | Scriora Outbox Action |
|---|---|---|
| `x-ratelimit-remaining` | Number of remaining requests in the bucket | If 0, delay next batch |
| `x-ratelimit-reset-after` | Seconds until bucket reset | Set outbox retry delay |
| `x-ratelimit-bucket` | Unique ID of the rate limit bucket | Tracked in worker memory |

### Error Normalization Matrix:

| Discord HTTP Status | Error Code | Scriora Normalization | Recovery Strategy |
|:---:|---|---|---|
| **400** | `50006` (Cannot send empty message) | `VALIDATION_ERROR` | Ensure text or embed is provided |
| **401** | `40001` (Unauthorized) | `AUTHENTICATION_ERROR` | Prompt admin to re-enter bot token |
| **403** | `50013` (Missing Permissions) | `AUTHORIZATION_ERROR` | Prompt to grant "Send Messages" / "Embed Links" |
| **404** | `10003` (Unknown Channel) | `NOT_FOUND` | Channel deleted or bot removed from server |
| **429** | `RATE_LIMITED` | `RATE_LIMITED` | Back off for `retryAfterMs` (exponential backoff) |
| **500** | Discord Gateway Outage | `EXTERNAL_ERROR` | Inngest transactional outbox re-tries automatically |

---

## 9. 🔒 Zero-Trust Security & Key Encryption

All Discord credentials (bot tokens, webhook URLs, and destination snowflakes) are protected by **AES-256-GCM Envelope Encryption**:

* **Master Key:** Sourced exclusively from `MASTER_ENCRYPTION_KEY` (32 bytes / 64 hex characters).
* **Storage Isolation:** Encrypted blobs stored in `secret_envelopes`. Tokens are never exposed in logs, error traces, or unencrypted database columns.
* **In-Memory Decryption:** Credentials are decrypted strictly in-memory during the brief millisecond of outbox dispatch.

---

## 10. 🧪 Production Verification & Live Test Scripts

To verify Discord integration end-to-end:

```bash
# 1. Run unit test suite (11/11 tests)
pnpm --filter scriora-social test -- test/unit/discord.adapter.test.ts

# 2. Run API gateway connect tests
pnpm --filter scriora-api test -- test/routes/connect.route.test.ts

# 3. Test automated bot discovery live against real Discord server
node --env-file=.env scratch/test_discord_bot_discovery.mjs

# 4. Test transactional outbox pipeline live
node --env-file=.env scratch/test_discord_pipeline_bot.mjs
```
