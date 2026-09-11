# Social Platform Adapters

Scriora's social orchestration layer (`@scriora/social`) abstracts differences between various social media APIs into a unified, type-safe interface.

---

## 🌐 Supported Platforms

| Platform | OAuth Version | Media Support | Status |
|---|---|---|---|
| **LinkedIn** | OAuth 2.0 (PKCE) | Text, Images, Video, PDF Documents | Production |
| **X (Twitter)** | OAuth 2.0 (PKCE) | Text, Images, Video, Polls | Production |
| **Threads** | OAuth 2.0 | Text, Images, Carousel, Video | Production |
| **TikTok** | OAuth 2.0 | Short-form Video, Direct Share | Production |
| **Instagram** | Meta Graph API | Reels, Carousel, Single Image | Production |
| **Facebook** | Meta Graph API | Pages, Groups, Feed Posts | Production |
| **YouTube** | Google OAuth 2.0 | Shorts, Long-form Video | Production |
| **Bluesky** | AT Protocol | Text, Images, Facets | Production |
| **Mastodon** | ActivityPub / REST | Text, Media Attachments | Production |
| **Pinterest** | OAuth 2.0 | Pins, Boards, Image/Video | Production |
| **Reddit** | OAuth 2.0 | Subreddit text & link posts | Production |
| **Telegram** | Bot API (C2 & Broadcast) | Text, Images, Media Albums, Interactive Inline Approvals, C2 Admin Bot | Production |
| **Discord** | Webhook / Bot API | Rich Embeds, Announcements | Production |

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
