# 🌐 Scriora Social Platforms Integration Roadmap & Competitor Teardown

## 1. Executive Overview

This document outlines the multi-phase social platform expansion strategy for Scriora, benchmarked against industry leaders (**Ayrshare**, **Postiz**, **Buffer**, **Hootsuite**, and **Publer**).

To maximize engineering throughput and accelerate time-to-market, platforms are categorized into **4 Developer Friction Tiers** based on:
1. **Approval Bureaucracy**: Whether automated/instant API keys exist vs. manual corporate audits (Screencasts, Legal Entity Verification).
2. **Testing Velocity**: Ease of setting up zero-friction local sandboxes, mock runners, and real webhook/bot tokens in minutes.
3. **Media Pipeline Complexity**: Plain text and single image vs. multi-step chunked resumable video uploads.

---

## 2. 🏆 Competitive Benchmark Matrix

| Platform | Competitor Adoption | Auth Protocol | Primary Payload Types | Scriora Implementation Tier | Status |
|---|---|---|---|---|---|
| **LinkedIn** | Ayrshare, Postiz, Buffer, Hootsuite, Publer | OAuth 2.0 PKCE | Text, Image, Video, PDF Document (Carousel) | Core Tier | **Live & Tested** ✅ |
| **Telegram** | Ayrshare, Postiz, Publer | Bot API + C2 Webhook | Text (MarkdownV2), Photos, Channels, Groups, Interactive Approvals | Core Tier | **Live & Tested** ✅ |
| **X (Twitter)** | Ayrshare, Postiz, Buffer, Hootsuite, Publer | OAuth 2.0 PKCE (API v2) | Tweets, Threads, Images, Videos, Polls | Tier 2 (Self-Serve) | **Adapter Ready** 🚀 |
| **Discord** | Postiz | Webhook / Bot API | Rich Embeds, Discussions, Announcements, Media | **Tier 1 (Instant)** ⚡ | Phase 6 (Next) |
| **Slack** | Postiz | Incoming Webhook / Bot Token | Rich Blocks, Team Announcements, Channel Posts | **Tier 1 (Instant)** ⚡ | Phase 6 (Next) |
| **Bluesky** | Ayrshare, Postiz, Buffer, Publer | AT Protocol (App Passwords) | Short Text, Facets, Images | **Tier 1 (Instant)** ⚡ | Phase 6 |
| **Mastodon** | Ayrshare, Postiz, Buffer, Publer | ActivityPub / REST Bearer | Statuses, Content Warnings, Media | **Tier 1 (Instant)** ⚡ | Phase 6 |
| **Medium / Dev.to** | Ayrshare, Publer (WordPress) | Integration Token / API Key | Long-form Markdown, Articles, Canonical URLs | **Tier 1 (Instant)** ⚡ | Phase 6 |
| **Reddit** | Ayrshare, Postiz, Publer | OAuth 2.0 (Script App) | Subreddit Posts, Text, Links, Media | **Tier 2 (Self-Serve)** 🟡 | Phase 7 |
| **Meta Threads** | Ayrshare, Postiz, Buffer, Hootsuite, Publer | Threads API (OAuth 2.0) | Text (500 chars), Images, Carousels, Videos | **Tier 2 (Self-Serve)** 🟡 | Phase 7 |
| **Google Business Profile (GMB)** | Ayrshare, Buffer, Hootsuite, Publer | Google OAuth 2.0 | Local Business Updates, Offers, Events, Photos | **Tier 3 (Quotas)** 🟠 | Phase 8 |
| **Pinterest** | Ayrshare, Postiz, Buffer, Hootsuite, Publer | OAuth 2.0 (API v5) | Pins, Boards, Image & Video Attachments | **Tier 3 (Quotas)** 🟠 | Phase 8 |
| **YouTube** | Ayrshare, Postiz, Buffer, Hootsuite, Publer | Google OAuth 2.0 | Shorts, Videos, Community Posts | **Tier 3 (Quotas)** 🟠 | Phase 8 |
| **Facebook** | Ayrshare, Postiz, Buffer, Hootsuite, Publer | Meta Graph API | Pages, Groups, Reels, Photo Albums | **Tier 4 (Enterprise)** 🔴 | Phase 9 |
| **Instagram** | Ayrshare, Postiz, Buffer, Hootsuite, Publer | Meta Graph API (Containers) | Business/Creator Reels, Carousels, Feed Posts | **Tier 4 (Enterprise)** 🔴 | Phase 9 |
| **TikTok** | Ayrshare, Postiz, Buffer, Hootsuite, Publer | TikTok Content Posting API | Short-form Video, Direct Share | **Tier 4 (Enterprise)** 🔴 | Phase 9 |
| **WhatsApp Channels** | Ayrshare, Hootsuite | Meta Cloud API | Channel Broadcasts, Media Updates | **Tier 4 (Enterprise)** 🔴 | Phase 9 |

---

## 3. 🎯 Integration Tiers (Ranked by Speed & Testing Velocity)

### 🟢 Tier 1: Instant Integration & Zero Friction (Hours — No Bureaucracy)
> [!TIP]
> These platforms allow local testing within 5 minutes using personal tokens, app passwords, or incoming webhooks without requiring developer approval or public callbacks.

1. **Discord**:
   - **Mechanism**: Incoming Webhooks or Discord Bot API (`Bot` header).
   - **Velocity**: Instant setup via server channel settings.
   - **Capabilities**: Rich embeds, custom hex colors, images, threaded discussions.
2. **Slack**:
   - **Mechanism**: Incoming Webhook URL or Bot Token (`chat:write`).
   - **Velocity**: Instant workspace app install without review.
   - **Capabilities**: Block Kit JSON formatting, team announcements, CEO broadcasts.
3. **Bluesky**:
   - **Mechanism**: AT Protocol using account `App Passwords` (no complex OAuth dance required for personal publishing).
   - **Velocity**: 1-minute setup directly from account settings.
   - **Capabilities**: Decentralized social microblogging, facets (links/mentions), images.
4. **Mastodon**:
   - **Mechanism**: ActivityPub REST API using Personal Access Tokens.
   - **Velocity**: Instant token generation under Preferences -> Development.
   - **Capabilities**: Federated microblogging, CW (content warning), alt text.
5. **Medium & Dev.to**:
   - **Mechanism**: Personal Integration Tokens.
   - **Velocity**: Copy token from user profile settings.
   - **Capabilities**: Long-form engineering/product publishing with canonical SEO attribution.

---

### 🟡 Tier 2: Self-Serve Developer Portals (1–2 Days — Automated Approval)
> [!NOTE]
> Requires creating an App in the developer portal, but approval is instant and automated for developer/indie tiers.

6. **X (Twitter)**:
   - **Mechanism**: Twitter API v2 with OAuth 2.0 PKCE.
   - **Status in Scriora**: Fully implemented in `packages/social/src/platforms/x/x.adapter.ts`.
   - **Capabilities**: Tweets, thread chaining (`in_reply_to_tweet_id`), media uploads.
7. **Reddit**:
   - **Mechanism**: OAuth 2.0 with "script" application type.
   - **Velocity**: Instant API secret generation without waiting for subreddit moderator approval.
   - **Capabilities**: Markdown submissions, link posts, target subreddit distribution.
8. **Meta Threads**:
   - **Mechanism**: Threads API (released June 2024).
   - **Velocity**: Significantly cleaner than old Graph API; rapid self-testing in sandbox mode.
   - **Capabilities**: Text updates up to 500 characters, carousels, videos.

---

### 🟠 Tier 3: Quota & Resumable Media Architecture (3–5 Days)
> [!IMPORTANT]
> Developer accounts are standard, but the implementation requires chunked upload state machines, rate-limit monitors, and daily quota budgeting.

9. **Google Business Profile (GMB)**:
   - **Mechanism**: Google Business Information & Performance APIs.
   - **Prerequisites**: Google Cloud Console project and location verification.
   - **Value**: High-ticket B2B/local business SEO, local offers, and call-to-actions.
10. **Pinterest**:
    - **Mechanism**: Pinterest API v5.
    - **Capabilities**: Creating pins with outbound destination URLs and board tagging.
11. **YouTube**:
    - **Mechanism**: YouTube Data API v3.
    - **Challenge**: 10,000 units/day quota management and resumable video upload chunks (`uploadType=resumable`).

---

### 🔴 Tier 4: Enterprise App Review & High Friction (1–3 Weeks)
> [!WARNING]
> Requires registered corporate entities, live screencasts showing OAuth flows, and strict security compliance checks before production access is granted.

12. **Facebook**:
    - **Requirements**: Meta App Review for `pages_manage_posts` and Business Verification.
13. **Instagram**:
    - **Requirements**: Facebook Page binding, Instagram Business Account, and 2-phase Container Publishing (`/media` -> `/media_publish`).
14. **TikTok**:
    - **Requirements**: TikTok for Developers partner approval and strict video format validation.
15. **WhatsApp Channels / Business API**:
    - **Requirements**: Meta Business Manager ID, verified phone number, and template approvals.

---

## 4. 🛠️ Immediate Recommended Execution Order

To deliver maximum platform breadth with the fastest cycle time:

1. **Sprint A (Immediate — Zero Friction)**:
   - Implement **Discord Adapter** (Webhooks & Bot API).
   - Implement **Slack Adapter** (Incoming Webhooks & Block Kit).
   - Activate **X (Twitter)** live credentials using existing `XAdapter`.
2. **Sprint B (Microblogging & Developer Authority)**:
   - Implement **Bluesky Adapter** (AT Protocol).
   - Implement **Reddit Adapter** (Subreddit Publisher).
   - Implement **Medium / Dev.to Adapter** (Long-form Cross-posting).
3. **Sprint C (Visual & Quota Platforms)**:
   - Implement **Threads API Adapter**.
   - Implement **Google Business Profile Adapter**.
   - Implement **Pinterest Adapter**.
4. **Sprint D (Enterprise Meta & Video)**:
   - Facebook, Instagram, YouTube, TikTok.
