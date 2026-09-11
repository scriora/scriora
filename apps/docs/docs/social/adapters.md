# Social Platform Adapters

Scriora's social orchestration layer (`@scriora/social`) abstracts differences between various social media APIs into a unified, type-safe interface.

---

## 🌐 Supported Platforms

| Platform | Auth & Protocol | Media Support | Status |
|---|---|---|---|
| **LinkedIn** | OAuth 2.0 (PKCE) | Text, Images, Video, PDF Documents | Production (Live) ✅ |
| **Telegram** | Bot API + C2 Webhook | Text (MarkdownV2), Photos, Channels, Groups, C2 Approval Bot | Production (Live) ✅ |
| **X (Twitter)** | OAuth 2.0 (PKCE) / API v2 | Text, Threads, Images, Videos, Polls | Production (Adapter Ready) 🚀 |
| **Discord** | Webhook / Bot API | Rich Embeds, Announcements, Channels | Tier 1 (Immediate) |
| **Slack** | Incoming Webhook / Bot Token | Block Kit, Announcements, Team Channels | Tier 1 (Immediate) |
| **Bluesky** | AT Protocol (App Passwords) | Text, Images, Facets | Tier 1 (Immediate) |
| **Mastodon** | ActivityPub / REST Bearer | Statuses, Content Warnings, Media | Tier 1 (Immediate) |
| **Medium / Dev.to** | Integration Tokens | Markdown Articles, Canonical URLs | Tier 1 (Immediate) |
| **Reddit** | OAuth 2.0 (Script App) | Subreddit Posts, Links, Media | Tier 2 (Self-Serve) |
| **Threads** | Threads API (OAuth 2.0) | Text (500 chars), Images, Carousel, Video | Tier 2 (Self-Serve) |
| **Google Business Profile** | Google OAuth 2.0 | Local Business Updates, Offers, Events, Photos | Tier 3 (Quotas) |
| **Pinterest** | OAuth 2.0 (API v5) | Pins, Boards, Image/Video | Tier 3 (Quotas) |
| **YouTube** | Google OAuth 2.0 | Shorts, Long-form Video | Tier 3 (Quotas) |
| **Instagram** | Meta Graph API (Containers) | Reels, Carousel, Single Image | Tier 4 (Enterprise Review) |
| **Facebook** | Meta Graph API | Pages, Groups, Feed Posts | Tier 4 (Enterprise Review) |
| **TikTok** | TikTok Content Posting API | Short-form Video, Direct Share | Tier 4 (Enterprise Review) |
| **WhatsApp Channels** | Meta Cloud API | Channel Broadcasts, Media Updates | Tier 4 (Enterprise Review) |

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
- Tokens are encrypted at rest using **AES-256-GCM** with an envelope encryption key (`MASTER_ENCRYPTION_KEY`).
- Token refresh routines are executed automatically in background workers prior to token expiration.

