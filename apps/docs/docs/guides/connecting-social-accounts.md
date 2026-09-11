---
title: "Connecting Social Accounts"
description: "Step-by-step guide for connecting social media accounts to Scriora, including Telegram, Discord, LinkedIn, and Meta platforms."
---

Scriora connects with diverse social platforms using secure, zero-trust token management and standardized platform adapters.

---

## 📱 1. Telegram Integration (Channels, Groups, & C2 Bot)

Telegram integration in Scriora supports **multi-destination publishing** (private chats, public/private channels, and supergroups) as well as **interactive Command & Control (C2)** for mobile approvals.

### 🤖 Dual Connection Modes: Shared Official Bot vs. Custom Brand Bot (BYOB)
1. **Mode 1: Shared Official Bot (`@ScrioraBot`):** 1-Click zero-setup option. No token creation or `@BotFather` configuration needed.
2. **Mode 2: Custom Brand Bot (BYOB):** White-label option for enterprise teams who want their own custom bot name, avatar, and bio.

> [!IMPORTANT]
> ### 🚨 Mandatory Administrator / Moderator Requirement (In Both Modes)
> **Regardless of whether you connect using the Shared Official Bot or your Custom Bot:**
> - **Channels (Public or Private):** You **MUST** add the bot to your channel and promote it to **Administrator** with the **"Post Messages"** permission enabled. Telegram's protocol forbids regular members from posting into channels. If this step is missed, Telegram will reject publishing attempts with `403 Forbidden` or `chat not found`.
> - **Groups & Forums:** You must add the bot as a member with **"Send Messages"** permissions (or as an Administrator/Moderator if your group restricts posting).
> - **1-Click Invite Helper:** In the Scriora dashboard, click the provided direct invite link (`https://t.me/<bot>?startchannel=true`) to add the bot with administrator permissions pre-configured.

### 📋 What We Need from the User (Step-by-Step Requirements)
1. **Bot Token 🤖 (Mode 2 only):** Created via [@BotFather](https://t.me/BotFather) with `/newbot`.
2. **Destination ID (Target Chat ID) 📢:**
   - Public Channel: `@channel_username`
   - Private Channel: Negative 13-digit ID (e.g. `-1001234567890`) obtained via [@userinfobot](https://t.me/userinfobot) or Telegram Web.
   - Supergroup/Forum: Negative ID (e.g. `-1009876543210`).
3. **Admin User ID 🛡️:** Captured automatically via 1-Click QR/link (`https://t.me/your_bot?start=connect_<token>`) for Human-in-the-Loop (§14) mobile approvals.

---

## 🎮 2. Discord Integration (Webhooks, Bot API v10, & Forum Channels)

Scriora supports publishing to Discord announcement channels, general text channels, and community forum threads.

### 🤖 Dual Connection Modes: Instant Webhook vs. Official Bot API (BYOB)

| Feature | Mode 1: Incoming Webhooks ⚡ | Mode 2: Discord Bot API v10 (BYOB) 🤖 |
|---|:---:|:---:|
| **Setup Time** | 10 seconds | 2 minutes |
| **Server & Channel Discovery** | Manual URL copy | ⚡ **Automated 1-Click Dropdown Selection** |
| **Custom Name & Avatar per Post** | ✅ Yes (`username`, `avatarUrl`) | Configured on Bot Application profile |
| **Rich Embeds & Custom Colors** | ✅ Yes | ✅ Yes |
| **Multi-Image Album Collages** | ✅ Yes (up to 4 images) | ✅ Yes (up to 4 images) |
| **Forum Channels (Type 15)** | ⚠️ Limited | ✅ **Native** (creates new thread with `threadName`) |
| **Interactive ActionRow Buttons (§14)**| ❌ Not supported by webhooks | ✅ **Yes** (Interactive Approval Buttons) |

### 🛠️ Setup Steps:
* **Mode 1 (Webhook):** Discord Channel ⚙️ -> **Integrations** -> **Webhooks** -> **New Webhook** -> **Copy Webhook URL**. Paste into Scriora dashboard.
* **Mode 2 (Bot API):**
  1. Open [Discord Developer Portal](https://discord.com/developers/applications) -> **New Application**.
  2. Go to **Bot** tab -> **Reset Token** -> Copy token. Enable **Message Content Intent**.
  3. Go to **OAuth2** -> **URL Generator** -> Select `bot` and `applications.commands` scopes -> Select permissions (`View Channels`, `Send Messages`, `Embed Links`, `Attach Files`). Permission integer: `397284550720`.
  4. Authorize bot into your server. Scriora automatically discovers all available text, announcement, and forum channels!

---

## 💼 3. LinkedIn Integration (Profiles, Company Pages, & PDF Carousels)

LinkedIn connects via official **OAuth 2.0 with PKCE (Proof Key for Code Exchange)**.

### 🌟 Key Capabilities:
* **Personal Profiles:** Publish founder thought leadership directly to your personal network (`urn:li:person`).
* **Company Pages:** Connect multiple brand and regional organization pages (`urn:li:organization`).
* **PDF Document Carousels:** Publish multi-page interactive slide decks (highest organic engagement format on LinkedIn).
* **Automated 60-Day Token Refresh:** Background cron job automatically refreshes tokens expiring within 7 days.

### 🛠️ Setup Steps:
1. In the Scriora Dashboard, click **Connect LinkedIn**.
2. Authorize via LinkedIn's secure OAuth 2.0 consent screen.
3. Select whether to publish to your **Personal Profile** or choose from your managed **Company Pages**.
4. All tokens are encrypted using **AES-256-GCM** with isolated secret envelopes.

---

## 🌐 Multi-Account, Multi-Bot & Custom Copy Overrides

Scriora empowers teams with granular control over destinations and content variants:

### 1. Unlimited Accounts & Channels per Workspace
* Connect **any number** of Telegram channels, supergroups, and bots.
* Connect **multiple Discord servers and channels** simultaneously.
* Connect **multiple LinkedIn accounts**: personal profiles alongside multiple Company Pages.
* Every destination is stored as an independent `SocialAccount` with its own AES-256-GCM encrypted envelope.

### 2. Tailor Copy Differently for Each Destination (`customBody`)
Avoid cookie-cutter posts: provide a tailored message copy for each channel:
* **Telegram Channel:** Bullet points, emojis, call-to-action link.
* **Discord Announcement:** Rich embed with brand hex color (`#10B981`) and multi-image collage.
* **LinkedIn Company Page:** Executive tone, industry hashtags, and PDF slide carousel.
* **LinkedIn Personal Profile:** First-person founder narrative.
