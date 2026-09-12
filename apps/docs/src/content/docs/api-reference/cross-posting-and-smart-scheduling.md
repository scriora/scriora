---
title: "Cross-Posting & Smart Scheduling API"
description: "AI-powered cross-posting optimization and ML-driven peak time recommendations"
---

Scriora provides intelligent routing tools to optimize content across disparate social networks before dispatch.

## 1. Cross-Post Content Optimizer (`POST /v1/posts/optimize-cross-post`)

Analyzes content for platform-specific character limits, media incompatibilities, and hashtag policies.

### Request
```http
POST /v1/posts/optimize-cross-post
Content-Type: application/json

{
  "content": "Exciting product update! Check out https://scriora.io #saas #developers",
  "targetPlatforms": ["THREADS", "X", "LINKEDIN", "INSTAGRAM"],
  "mediaUrls": ["https://cdn.example.com/demo.png"]
}
```

### Response
Returns optimized text per platform, character checks, suggested topic tags for Threads, and warnings if media rules are violated (e.g. mixed media on Threads).

---

## 2. Adaptive Smart Scheduling (`GET /v1/posts/smart-schedule`)

Returns recommended publishing times based on 2026 engagement studies (Buffer 2.5M post dataset) and empirical account analytics.

### Request
```http
GET /v1/posts/smart-schedule?platform=THREADS&daysAhead=7&limit=5
```

### Key Threads Peak Slots:
- **Wednesday 07:00 AM** (Score 100) — Morning commute browsing peak.
- **Thursday 09:00 AM** (Score 98) — Conversational peak.
- **Tuesday 10:00 AM** (Score 95) — Community engagement spike.
