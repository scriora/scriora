---
title: "Social Platform Adapters"
---

Scriora's social orchestration layer (`@scriora/social`) abstracts differences between various social media APIs into a unified, type-safe interface.

---

## 🌐 Supported Platforms

| Platform | OAuth / Integration Type | Media Support | Status |
|---|---|---|---|
| **LinkedIn** | OAuth 2.0 (PKCE) | Text, Images, Video, PDF Documents | 🟢 Production Live |
| **X (Twitter)** | OAuth 2.0 (PKCE) | Text, Images, Video, 280-char Threading | 🟢 Production Live |
| **Telegram** | Bot API v7 | Channel broadcast, Photos, §14 Approvals | 🟢 Production Live |
| **Discord** | Webhook & Bot API v10 | Rich Embeds, Collages, Threads, Reactions | 🟢 Production Live |
| **Reddit** | OAuth 2.0 (Script App) | Subreddit text & link posts, Flairs | 📋 Roadmap (Phase 7) |
| **Slack** | Webhook / Bot API | Block Kit, Announcements, Channel broadcasts | 📋 Future Roadmap |
| **Facebook** | Meta Graph API | Pages, Groups, Feed Posts, Reels | ⏳ In Progress |
| **Instagram** | Meta Graph API | Reels, Carousel, Single Image | ⏳ In Progress |
| **Threads** | Meta Threads API | Text, Images, Carousel, Video | ⏳ In Progress |
| **YouTube** | Google OAuth 2.0 | Shorts, Long-form Video, Community | ⏳ Roadmap (Phase 8) |
| **TikTok** | Content Posting API | Short-form Video, Direct Share | ⏳ Roadmap (Phase 8) |
| **Bluesky** | AT Protocol | Text, Images, Facets | ⏳ Roadmap |
| **Pinterest** | OAuth 2.0 (v5) | Pins, Boards, Image/Video | ⏳ Roadmap |
| **Mastodon** | ActivityPub / REST | Text, Media Attachments | ⏳ Roadmap |

---

## 📐 The `PlatformContract` Interface

All platform adapters implement `@scriora/social/src/contracts/platform.contract.ts`:

```typescript
export interface PlatformContract {
  readonly platformId: string;
  readonly platformName: string;
  
  publish(payload: PublicationPayload): Promise<PublicationResult>;
  deletePost(externalId: string): Promise<boolean>;
  getMetrics(externalId: string): Promise<PlatformMetrics>;
  validateConstraints(content: ContentDraft): ValidationResult;
  refreshToken(tokenData: OAuthTokenData): Promise<RefreshedToken>;
}
```

---

## 🔒 Token Security & Encryption

- Social access tokens and refresh tokens are **never stored in plaintext**.
- Tokens are encrypted at rest using **AES-256-GCM** with an envelope encryption key (`SOCIAL_TOKEN_ENCRYPTION_KEY`).
- Token refresh routines are executed automatically in background workers prior to token expiration.
