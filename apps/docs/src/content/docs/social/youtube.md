---
title: "YouTube & YouTube Shorts Integration"
description: "Publish standard long-form videos and YouTube Shorts with custom thumbnails, tags, and automated Google OAuth 2.0 token management."
---

Scriora provides first-class support for **YouTube Data API v3**, allowing creators, media teams, and autonomous AI agents to publish both **Standard Long-form Videos** and **YouTube Shorts** with custom metadata, automated thumbnail covers, and engagement tracking.

---

## 🚀 Key Features

- **Google OAuth 2.0 (Offline Access):** Automatically captures a permanent `refresh_token` using `access_type=offline` and `prompt=consent`.
- **Resumable Upload Protocol:** Two-phase chunked upload handling large video files reliably without connection drops or gateway timeouts.
- **YouTube Shorts Optimization:** Automatic `#Shorts` tagging and vertical URL formatting (`https://www.youtube.com/shorts/{id}`).
- **Custom Video Thumbnails:** Direct upload of high-resolution thumbnail images via `POST /thumbnails/set`.
- **Granular Privacy & COPPA Compliance:** Control video privacy (`public`, `private`, `unlisted`) and declare `selfDeclaredMadeForKids`.
- **Live Metrics Tracking:** Ingests video views (`impressions`), likes, and comment counts.

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
          "madeForKids": false
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

## 🤖 Model Context Protocol (MCP) Tooling

AI agents can directly publish to YouTube via the `scriora_create_post` tool:

```json
{
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
        "tags": ["AI", "TechNews", "Shorts"]
      }
    }
  ],
  "mediaUrls": ["https://cdn.example.com/shorts/recap.mp4"]
}
```

---

## 📊 Platform Limits & Specifications

| Parameter | Limit / Specification |
|---|---|
| **Maximum Video Size** | Up to 256 GB (or 12 hours) via Resumable Upload |
| **Title Length** | Maximum 100 characters |
| **Description Length** | Maximum 5,000 characters |
| **Tags Count** | Cumulative 500 characters |
| **Shorts Duration** | Up to 180 seconds (3 minutes) |
| **Supported Video Formats** | `.mp4`, `.mov`, `.avi`, `.wmv`, `.flv`, `.webm` |
| **Custom Thumbnail** | Recommended 1280x720 (minimum 640px width), 16:9 ratio, max 2 MB |
