---
title: "YouTube & YouTube Shorts Integration"
description: "Publish standard long-form videos and YouTube Shorts with custom thumbnails, tags, and automated Google OAuth 2.0 token management."
---

Scriora provides first-class support for **YouTube Data API v3**, allowing creators, media teams, and autonomous AI agents to publish both **Standard Long-form Videos** and **YouTube Shorts** with custom metadata, automated thumbnail covers, and engagement tracking.

---

## 🚀 Key Features

- **Google OAuth 2.0 (Offline Access):** Automatically captures a permanent `refresh_token` using `access_type=offline` and `prompt=consent` with `youtube.upload`, `youtube.readonly`, and `youtube.force-ssl` scopes.
- **Resumable Upload Protocol:** Two-phase chunked upload handling large video files up to 256 GB reliably without reverse proxy or Cloudflare gateway timeouts.
- **YouTube Shorts Optimization:** Automatic `#Shorts` tagging and vertical URL formatting (`https://www.youtube.com/shorts/{id}`).
- **First Comment Auto-Posting:** Auto-posts a top-level comment immediately after publication (e.g. for links, discussion prompts, or disclaimers) without triggering outbound link penalties.
- **AI Synthetic Media Disclosure:** Fully compliant with YouTube's mandated `containsSyntheticMedia` disclosure flag for AI-generated or modified content.
- **Custom Video Thumbnails:** Direct upload of high-resolution thumbnail images via `POST /thumbnails/set`.
- **COPPA Compliance:** Explicit `madeForKids` (`selfDeclaredMadeForKids`) regulatory setting.
- **Data-Backed Smart Scheduling:** Integrated with Buffer's 1.8M video empirical dataset (Sunday 10:00 AM peak for long-form, Friday 4:00 PM for Shorts).

---

## 🔑 Google Cloud Setup

To connect a YouTube channel to Scriora:

1. Visit the [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a project and navigate to **APIs & Services > Library**.
3. Search for **YouTube Data API v3** and click **Enable**.
4. Navigate to **APIs & Services > Credentials** and click **Create Credentials > OAuth client ID**.
5. Select **Web application** as the application type.
6. Add the following **Authorized redirect URIs**:
   ```text
   http://localhost:4000/v1/connect/youtube/callback
   ```
   *(or your production API URL, e.g. `https://api.yourdomain.com/v1/connect/youtube/callback`)*.
7. Save and copy your **Client ID** and **Client Secret**.
8. Set the environment variables in your `.env` file:
   ```env
   YOUTUBE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
   YOUTUBE_CLIENT_SECRET="GOCSPX-your-secret"
   ```

---

## 📡 Connecting a YouTube Channel

### 1. Initiate OAuth Handshake

```http
GET /v1/connect/youtube?workspaceId=YOUR_WORKSPACE_UUID
```

Scriora returns an `HTTP 302` redirecting to Google's consent screen requesting the following scopes:
- `https://www.googleapis.com/auth/youtube.upload`
- `https://www.googleapis.com/auth/youtube.readonly`
- `https://www.googleapis.com/auth/youtube.force-ssl`

### 2. OAuth Callback & Channel Onboarding

Upon user consent, Google redirects back to:
```http
GET /v1/connect/youtube/callback?code=AUTH_CODE&state=SIGNED_JWT_STATE
```

Scriora queries the YouTube `/channels` API, stores the channel ID, channel title, and avatar in `socialAccounts`, and encrypts the credentials into a `SecretEnvelope` using AES-256-GCM.

---

## 📤 Publishing Video Content

### Long-form Video Example

```bash
curl -X POST http://localhost:4000/v1/posts \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "x-workspace-id: YOUR_WORKSPACE_UUID" \
  -H "Content-Type: application/json" \
  -d '{
    "universalBody": "Deep dive into autonomous software engineering agents in 2026.",
    "targets": [
      {
        "socialAccountId": "YOUR_YOUTUBE_ACCOUNT_UUID",
        "platform": "YOUTUBE",
        "options": {
          "title": "Autonomous Coding Agents in 2026: The Complete Guide",
          "description": "In this masterclass, we explore self-healing architectures...\n\nTimestamps:\n0:00 Intro\n03:15 Multi-Agent Swarms",
          "tags": ["AI", "Coding", "SoftwareEngineering", "Antigravity"],
          "categoryId": "28",
          "privacyStatus": "public",
          "thumbnailUrl": "https://cdn.example.com/thumbnails/masterclass-cover.jpg",
          "madeForKids": false,
          "containsSyntheticMedia": true,
          "firstComment": "Join our community discussion on Discord: https://discord.gg/scriora"
        }
      }
    ],
    "mediaUrls": [
      "https://cdn.example.com/videos/masterclass-full.mp4"
    ]
  }'
```

### YouTube Shorts Example

```bash
curl -X POST http://localhost:4000/v1/posts \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "x-workspace-id: YOUR_WORKSPACE_UUID" \
  -H "Content-Type: application/json" \
  -d '{
    "universalBody": "Top 3 VSCode extensions you need right now!",
    "targets": [
      {
        "socialAccountId": "YOUR_YOUTUBE_ACCOUNT_UUID",
        "platform": "YOUTUBE",
        "options": {
          "title": "3 Insane Coding Tools You Must Try",
          "isShort": true,
          "privacyStatus": "public"
        }
      }
    ],
    "mediaUrls": [
      "https://cdn.example.com/videos/shorts-vertical.mp4"
    ]
  }'
```

---

## 📈 Optimal Scheduling Times (Buffer 1.8M Video Benchmark)

Based on empirical data from 1.8 million published videos:

| Video Format | Peak Window | Top Days | Best Times (Local Time) |
|---|---|---|---|
| **Long-form Videos** | Morning (8:00 AM – 11:00 AM) | Sunday, Tuesday, Monday | **Sunday 10:00 AM** (0.95 peak factor), Sunday 9:00 AM, Friday 12:00 PM |
| **YouTube Shorts** | Evening (4:00 PM – 11:00 PM) | Friday, Saturday, Thursday | **Friday 4:00 PM**, Friday 6:00 PM, Friday 7:00 PM |

> [!TIP]
> Upload long-form videos **1 to 2 hours** before your peak viewer activity window to allow YouTube time to process, transcode (up to 4K/60fps), and index the video before recommending it.

---

## 🤖 Model Context Protocol (MCP) Tooling

AI agents can directly query optimal slots and publish to YouTube via Scriora's MCP server:

```json
{
  "tool": "scriora_create_post",
  "arguments": {
    "workspaceId": "d1e2f3a4-b5c6-47d8-e9f0-1234567890ab",
    "body": "Daily AI News Recap",
    "targets": [
      {
        "socialAccountId": "a1b2c3d4-e5f6-47a8-b9c0-1234567890ef",
        "platform": "YOUTUBE",
        "youtubeOptions": {
          "title": "GPT-5 Breakthrough Announced #Shorts",
          "isShort": true,
          "privacyStatus": "public",
          "tags": ["AI", "TechNews", "Shorts"],
          "containsSyntheticMedia": true,
          "firstComment": "Full source code and whitepaper link: https://scriora.com/blog/gpt-5"
        }
      }
    ],
    "mediaUrls": ["https://cdn.example.com/shorts/recap.mp4"]
  }
}
```

---

## 📊 Platform Limits & Specifications

| Parameter | Limit / Specification |
|---|---|
| **Maximum Video Size** | Up to 256 GB (or 12 hours) via Resumable Upload |
| **Title Length** | Maximum 100 characters (`<` and `>` prohibited by YouTube Data API) |
| **Description Length** | Maximum 5,000 characters |
| **Tags Count & Limit** | Cumulative max 500 characters across all tags combined |
| **First Comment** | Up to 10,000 characters (auto-posted via `commentThreads.insert`) |
| **Shorts Duration** | Up to 180 seconds (3 minutes, per 2025/2026 YouTube update) |
| **Supported Video Formats** | `.mp4`, `.mov`, `.avi`, `.wmv`, `.flv`, `.webm`, `.mkv`, `prores`, `hevc` |
| **Custom Thumbnail** | Recommended 1280x720 (minimum 640px width), 16:9 ratio, max 2 MB |
