---
title: "Connecting Social Accounts"
description: "Step-by-step guide for connecting social media accounts to Scriora, including Telegram, LinkedIn, and Meta platforms."
---

Scriora connects with diverse social platforms using secure, zero-trust token management and standardized platform adapters.

---

## 📱 Telegram Integration (Channels, Groups, & C2 Bot)

Telegram integration in Scriora supports **multi-destination publishing** (private chats, public/private channels, and supergroups) as well as **interactive Command & Control (C2)** for mobile approvals.

### 📋 What We Need from the User (المتطلبات خطوة بخطوة)

To connect Telegram to a workspace, the user only needs to provide three elements:

#### 1. Bot Token (توكن البوت) 🤖
* **Purpose:** Allows Scriora to publish posts and listen for interactive commands.
* **How to obtain:**
  1. Open Telegram and search for the official [@BotFather](https://t.me/BotFather).
  2. Send `/newbot` and follow the prompts to choose a display name and username (e.g., `my_brand_bot`).
  3. Copy the **HTTP API Token** provided by BotFather (format: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`).
* **Where to provide:** In the workspace settings under **Connect Telegram** or via API `POST /v1/connect/telegram`.

#### 2. Destination ID (معرّف وجهة النشر) 📢
Scriora can publish to any of the following destinations:
* **Telegram Channel:**
  1. Add the bot to your channel as an **Administrator** with the **"Post Messages"** permission.
  2. For **Public Channels**: provide the public handle (e.g. `@my_brand_channel`).
  3. For **Private Channels**: send a test message into the channel after adding the bot; Scriora will capture the negative 13-digit ID (e.g. `-1001234567890`).
* **Supergroup or Forum:**
  1. Add the bot to the group.
  2. Mention the bot in any message (e.g. `@my_brand_bot hello`) to register the group ID (e.g. `-1009876543210`).
* **Direct Private Chat:**
  1. Open the bot in Telegram and press **Start** (`/start`). Your personal chat ID is registered immediately.

#### 3. Admin User ID (معرّف حساب المدير للتحكم والاعتماد) 🛡️ *(Optional / Recommended)*
* **Purpose:** Enables **Zero-Trust Whitelist Protection** and **Human-in-the-Loop Governance (§14)**:
  * Only this user receives interactive approval cards with `[ ✅ Approve ]` and `[ ❌ Reject ]` inline buttons.
  * Only this user can issue C2 commands (`/status`, `/accounts`, `/post`) from mobile.
* **How to obtain:**
  * Open [@userinfobot](https://t.me/userinfobot) on Telegram to see your numerical User ID instantly (e.g. `987654321`).
* **Where to configure:** In your workspace settings or system environment variable `TELEGRAM_ADMIN_CHAT_ID`.

---

## 🔒 Zero-Trust Security & Key Encryption

All social tokens, bot secrets, and destination identifiers are stored in PostgreSQL using **AES-256-GCM Envelope Encryption** (`secret_envelopes` table).
- Master encryption keys are never written to disk or logs.
- Platform tokens are decrypted only in-memory at the exact millisecond of publication dispatch.
- Every API request and callback query is checked against the workspace authorization perimeter.

---

## 🔗 Connecting via Scriora API

```http
POST /v1/connect/telegram
Content-Type: application/json
x-workspace-id: 4d2e70c7-3010-4d17-b3d8-cca91b5edbc6

{
  "botToken": "123456789:ABCdefGHIjklMNOpqrsTUVwxyz",
  "chatId": "-1001234567890",
  "channelTitle": "قناة تيليجرام الرسمية"
}
```

