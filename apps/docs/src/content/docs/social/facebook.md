---
title: "Facebook Adapter & Omnichannel Engine"
description: "Publish Text, Links, Photos, Attached Media Albums, and Native Videos to Facebook Pages with Multi-Page Discovery, Custom Thumbnails, and Buffer 14M Smart Scheduling"
---

The **Facebook Adapter** provides enterprise-grade publishing and analytics for Facebook Pages via the **Meta Graph API v21.0**.

---

## 1. Architectural Model & Meta Policies

> [!IMPORTANT]
> **Facebook Pages Only:** Since Graph API v3.0, Meta permanently removed automated publishing to personal timelines / user profiles (`publish_actions`). Third-party publishing platforms (including Buffer, Hootsuite, PostPeer, and Scriora) strictly publish to **Facebook Pages**.
> 
> In Facebook's security model, a user's personal profile authenticates the app, and Scriora automatically discovers all managed Pages (`/me/accounts`) and establishes **permanent Page Access Tokens** (`expiresIn: 0`).

---

## 2. Multi-Page Auto-Discovery & Bulk Management

When a creator or agency connects Facebook, they can administer dozens of Pages:

- **Auto-Discovery:** Scriora queries `/me/accounts` during OAuth exchange and registers an independent `SocialAccount` and encrypted `SecretEnvelope` for **every Page** the user administers.
- **Selective or Bulk Targeting:** Posts can target a single Page, a custom subset, or **all Pages simultaneously** via the unified `targets` array in `POST /v1/posts`.
- **Dynamic Sync:** When new Pages are created in Meta Business Suite, visiting the connect URL seamlessly onboards new Pages without disrupting existing connections.

---

## 3. Supported Post Formats & Capabilities

| Format | Max Limit | Technical Implementation |
| :--- | :--- | :--- |
| **Feed Text & Link** | 63,206 chars | `POST /{page-id}/feed` with `message` and optional `link` preview |
| **Single Photo** | 10 MB (JPG/PNG) | `POST /{page-id}/photos` with `url` and `message` |
| **Multi-Photo Album (Carousel)** | Up to 10 photos | Two-phase flow: Upload child photos with `published: false`, then dispatch `POST /{page-id}/feed` with `attached_media` |
| **Native Video** | 10 GB / 240 mins | `POST /{page-id}/videos` with `file_url` and `description` |
| **Custom Video Cover** | JPG/PNG | Post-publish thumbnail attachment via `POST /{video-id}/thumbnails` |
| **Unpublished Drafts** | All formats | Pass `published: false` in `platformOptions` for Meta Business Suite staging |
| **Real-time Metrics** | Likes, comments, shares | `GET /{post-id}?fields=shares` with resilient fallback |

---

## 4. Buffer 14M Post Dataset & Smart Scheduling

Scriora's scheduling engine integrates benchmark telemetry derived from analyzing **14 million Facebook posts**:

- **Golden Peak Window:** **Thursday at 9:00 AM** (Score 100/100).
- **Top Engagement Days:** Wednesday (Score 98), Thursday, Tuesday (Score 95).
- **Morning Primacy:** 6:00 AM to 11:00 AM consistently outperforms afternoon slots.
- **Saturday Low:** Avoid Saturday afternoons (lowest reach across the week).

### The Zero-Link Rule (Link Penalty Heuristic)
Empirical data shows that **97.3% of top-viewed Facebook posts contain zero outbound links**. Placing links directly in the post caption can depress algorithmic distribution by up to 50%.
Scriora's `CrossPostOptimizer` automatically flags external links in Facebook captions with code `FACEBOOK_LINK_REACH_PENALTY`, recommending moving links to the first comment or utilizing visual carousel formats.

---

## 5. API Usage Examples

### A. Publishing to Multiple Facebook Pages
```typescript
POST /v1/posts
Content-Type: application/json

{
  "workspaceId": "4d2e70c7-3010-4d17-b3d8-cca91b5edbc6",
  "body": "Announcing our major platform release! 🚀",
  "targets": [
    {
      "socialAccountId": "page-tech-uuid",
      "platform": "FACEBOOK"
    },
    {
      "socialAccountId": "page-regional-uuid",
      "platform": "FACEBOOK",
      "customBody": "Special regional announcement! 🌍"
    }
  ]
}
```

### B. Multi-Photo Attached Media Album
```typescript
{
  "body": "Behind the scenes of our team offsite! 📸",
  "mediaUrls": [
    "https://cdn.scriora.io/photo-1.jpg",
    "https://cdn.scriora.io/photo-2.jpg"
  ],
  "targets": [
    {
      "socialAccountId": "page-uuid",
      "platform": "FACEBOOK"
    }
  ]
}
```

### C. Native Video with Custom Cover & Draft Staging
```typescript
{
  "body": "Product walkthrough video 🎥",
  "mediaUrls": ["https://cdn.scriora.io/explainer.mp4"],
  "targets": [
    {
      "socialAccountId": "page-uuid",
      "platform": "FACEBOOK",
      "platformOptions": {
        "platform": "FACEBOOK",
        "options": {
          "published": false, // Creates an unpublished draft
          "videoThumbnailUrl": "https://cdn.scriora.io/custom-cover.jpg"
        }
      }
    }
  ]
}
```

---

## 6. Error Handling & Security Checkpoints

- **Error 190 Subcode 459:** Detects Meta security challenges where the Page owner must log in to `facebook.com` in a desktop browser to solve a verification prompt before API requests can resume.
- **Permanent Tokens:** Page Access Tokens never expire unless the user changes their Facebook password or revokes the app permissions.

---

## 7. MCP Integration (Model Context Protocol)

The Scriora MCP server exposes dedicated tools for AI agents:
- `scriora_get_smart_slots`: Query Thursday 9 AM golden slots.
- `scriora_optimize_cross_post`: Audit Facebook link penalties.
- `scriora_list_social_accounts`: Query all connected Pages.
- `scriora_create_post`: Stage multi-page Facebook posts with human approval gates.
