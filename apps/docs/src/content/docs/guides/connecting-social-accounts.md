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
Scriora can publish to any of the following destinations without requiring random test messages:

* **Public Channel (قناة عامة):**
  * Provide the public username directly (e.g. `@my_brand_channel` or `t.me/my_brand_channel`).
  * Add the bot as an **Administrator** with only one permission: **"Post Messages" (نشر الرسائل)**.
* **Private Channel (قناة خاصة):**
  * Requires the negative 13-digit ID (e.g. `-1001234567890`).
  * **How to get the ID directly in seconds:**
    1. **Using [@userinfobot](https://t.me/userinfobot):** Forward any message from the private channel to [@userinfobot](https://t.me/userinfobot) (https://t.me/userinfobot). The bot will reply with `Forwarded from chat ID: -100...`.
    2. **Using Telegram Web:** Open the channel in [web.telegram.org](https://web.telegram.org) and copy the numerical ID from the browser URL bar (`https://web.telegram.org/a/#-1001234567890`).
  * Add the bot as an **Administrator** with **"Post Messages"** permission only.
* **Supergroup or Forum (مجموعة أو منتدى):**
  * Requires the negative ID (e.g. `-1009876543210`).
  * **How to get the ID:** Forward a message from the group to [@userinfobot](https://t.me/userinfobot) or copy from the Telegram Web URL.
  * Bot only needs **"Send Messages" (إرسال الرسائل)** permission.
* **Direct Private Chat:**
  * Open the bot in Telegram and press **Start** (`/start`).

#### 3. Admin User ID (معرّف حساب المدير للتحكم والاعتماد) 🛡️
* **Purpose:** Enables **Zero-Trust Whitelist Protection** and **Human-in-the-Loop Governance (§14)**:
  * Only this user receives interactive approval cards with inline action buttons.
  * Only this user can issue C2 commands (`/status`, `/accounts`, `/post`) from mobile.
* **How to obtain:**
  * Open [@userinfobot](https://t.me/userinfobot) (https://t.me/userinfobot) on Telegram and send `/start` to get your numerical User ID (e.g. `987654321`).
* **Where to configure:** In your workspace settings or system environment variable `TELEGRAM_ADMIN_CHAT_ID`.

---

### 🛡️ Zero-Trust Permissions & Data Isolation Policy

Scriora adheres to strict least-privilege principles:

| Permission | Requested by Bot? | Rationale & Guarantee |
|---|:---:|---|
| **Post Messages** | ✅ Yes | Required to publish approved content into channels |
| **Read Member Messages** | ❌ **Strictly No** | Group Privacy Mode enabled; bot cannot read member conversations |
| **Add / Delete Administrators** | ❌ **Strictly No** | No administrative rights requested or needed |
| **Delete Others' Messages** | ❌ **Strictly No** | Bot only manages its own dispatch notices |
| **Access Contacts or Personal Data**| ❌ **Technically Impossible** | Telegram Bot API does not provide access to user contacts |

---

### 🎨 Customizable Approval Message & Button Labels

Scriora allows workspace administrators to completely customize the approval card texts and inline button labels to match team preferences:

* **Custom Button Texts:** Change `[ ✅ اعتماد ونشر فوري ]` and `[ ❌ رفض وإلغاء ]` to any custom labels (e.g. `[ 🚀 نشر الآن ]` / `[ 🛑 تأجيل ]` or `[ Approve ]` / `[ Decline ]`).
* **Custom Headers & Footers:** Add personalized review guidelines, campaign tags, or compliance notices to the message body.
* **Instant Dynamic Feedback:** When clicked, the message updates dynamically showing the exact decision and who approved it.

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

