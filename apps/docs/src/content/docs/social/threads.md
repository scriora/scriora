---
title: "Threads Adapter"
description: "Publish Text, Media, Carousels, and Chained Breakdown Threads via Threads Graph API"
---

The Threads Adapter allows automated publishing to Meta Threads using the official Threads Graph API v1.0.

## Capabilities
- **Text Posts:** Up to 500 characters per post.
- **Media Support:** Single images, single video (up to 5 minutes / 1GB), and multi-image carousels (2-10 items).
- **Reply Controls:** Limit conversation responses using `replyControl` (`everyone`, `accounts_you_follow`, `mentioned_only`).
- **Accessibility Alt-Text:** WCAG-compliant screen reader descriptions per slide.
- **Chained Threads:** Sequential reply threads (`threadItems`) published immediately in order.

## Strict Platform Rules
- **No Mixed Media:** Combining video and image in a single post is rejected by Threads.
- **Single Video Limit:** Maximum 1 video file per post (no multi-video carousels).
- **GIF Conversion:** Animated GIFs must be converted to MP4 before posting.

## Example Payload
```typescript
{
  platform: 'THREADS',
  socialAccountId: '...',
  platformOptions: {
    platform: 'THREADS',
    options: {
      replyControl: 'everyone',
      topicTag: 'engineering',
      altText: ['System Architecture Diagram']
    }
  }
}
```
