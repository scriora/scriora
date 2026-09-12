---
title: "Instagram Adapter"
description: "Publish Single Images, Reels, Carousels, and Stories via Instagram Graph API v21"
---

The Instagram Adapter enables professional omnichannel publishing to Instagram Professional (Business and Creator) accounts.

## Features
- **Single Images & Photos:** Supports 1:1, 4:5, and 1.91:1 aspect ratios.
- **Reels:** Native short-form and vertical videos (up to 15 minutes / 1GB) with custom video cover images and `shareToFeed` placement controls.
- **Multi-Item Carousels:** Up to 10 images or videos in a single swipeable post.
- **Stories:** 24-hour temporary visual posts.
- **Two-Phase Container Flow:** Handles asynchronous container transcoding checks with exponential polling.

## Configuration
Configure your Meta App with Instagram Login for Business:
```dotenv
INSTAGRAM_APP_ID="your_meta_app_id"
INSTAGRAM_APP_SECRET="your_meta_app_secret"
```

## Payload Options
```typescript
{
  platform: 'INSTAGRAM',
  socialAccountId: '...',
  platformOptions: {
    platform: 'INSTAGRAM',
    options: {
      mediaType: 'REEL',
      shareToFeed: true,
      coverUrl: 'https://cdn.example.com/cover.jpg',
      audioName: 'Original Audio'
    }
  }
}
```
