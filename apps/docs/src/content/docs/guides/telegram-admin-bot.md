---
title: "Telegram C2 Admin Bot & Governance"
description: "Mobile command and control bot, two-way interactive approvals, and zero-trust security on Telegram."
---

Scriora provides an enterprise-grade Command & Control (C2) bot on Telegram, allowing administrators to manage publications, review AI approvals, and inspect system telemetry directly from mobile devices.

---

## 🚀 Key Capabilities

1. **Omnichannel Broadcast**: Publishes to personal chats, public/private channels, and supergroups/forums simultaneously.
2. **Two-Way Interactive Approvals (§14)**: Inline buttons (`[ ✅ Approve ]` and `[ ❌ Reject ]`) deliver Human-in-the-Loop governance straight to the owner's Telegram.
3. **Chat-to-Publish (`/post`)**: Send `/post <content>` to create publications through the same approval-aware path as `POST /v1/posts`. If the workspace has `requiresApproval`, nothing is queued on the sweepable outbox until a human approves.
4. **Live System Telemetry (`/status`, `/accounts`)**: Instant status checks on queue depth, active workspaces, and connected platform credentials.

---

## 🛡️ Zero-Trust Security Configuration

Set the authorized admin Telegram chat ID in `.env`:

```env
TELEGRAM_BOT_TOKEN="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
TELEGRAM_ADMIN_CHAT_ID="987654321"
TELEGRAM_WEBHOOK_SECRET="your_production_secret_here"
TELEGRAM_WORKSPACE_ID="11111111-1111-4111-8111-111111111111"
```

Only messages and button clicks originating from `TELEGRAM_ADMIN_CHAT_ID` are processed. All unauthorized users receive an access-denied notice.

If `TELEGRAM_ADMIN_CHAT_ID` is unset, every C2 command — including `/post` — is denied. There is no development allow-all fallback.

If more than one workspace exists, set `TELEGRAM_WORKSPACE_ID`. Telegram C2 will not silently post to the oldest workspace.

---

## 📋 Available Commands

- `/start` or `/help`: Displays the interactive management menu.
- `/status`: Returns live database status, active workspace name, and outbox queue size.
- `/accounts`: Lists all connected social platforms and their statuses.
- `/post [text]`: Creates publications on every connected account in the resolved workspace. Honors `workspace.requiresApproval` (hold + interactive approval card; no sweepable outbox until approved).
