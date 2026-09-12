---
title: "Media & PDF Carousel API"
description: "Generate interactive multi-page PDF carousels, slide cards, and document assets optimized for LinkedIn and social platforms."
---

## 🎨 Overview

The **Scriora Media Engine** (`scriora-media`) provides high-performance, automated document and carousel generation. It transforms collections of images or structured slide decks into standardized multi-page PDF documents optimized for LinkedIn (+596% engagement) and other document-sharing networks.

---

## 🚀 Generate PDF Carousel (`POST /v1/media/carousel`)

Generate a multi-page PDF carousel from structured text slides, remote image URLs, or image buffers.

### Headers
```http
POST /v1/media/carousel
Authorization: Bearer <jwt-token>
X-Workspace-Id: <workspace-uuid>
Content-Type: application/json
```

### Query Parameters
| Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `download` | boolean | `false` | When `true`, returns binary `application/pdf` stream with `Content-Disposition: attachment`. |

### Request Body
```json
{
  "slides": [
    {
      "title": "The 2026 Social Architecture",
      "subtitle": "How algorithms changed and why carousels dominate",
      "body": "LinkedIn users spend 5.2x more time on document posts than single images.",
      "bulletPoints": [
        "PDF Carousels boost engagement by +596%",
        "Peak hours shifted to 3:00 PM - 8:00 PM",
        "Wednesday 4:00 PM is peak day"
      ],
      "theme": "dark",
      "accentColor": "#38bdf8",
      "backgroundColor": "#0f172a",
      "branding": "Scriora Insights"
    },
    {
      "title": "Smart Scheduling Pipeline",
      "subtitle": "Autonomous Outbox Queue",
      "bulletPoints": [
        "Timezone-aware localization (Cairo, Riyadh, UTC)",
        "Zero-Trust envelope encryption",
        "Deterministic delivery verification"
      ],
      "theme": "dark",
      "accentColor": "#a855f7"
    },
    "https://example.com/slide3-infographic.png"
  ],
  "options": {
    "aspectRatio": "1:1",
    "documentTitle": "Scriora 2026 Social Playbook",
    "author": "Mohamed Shaban",
    "subject": "Social Media Engineering",
    "keywords": ["SaaS", "LinkedIn", "Automation"]
  }
}
```

### Response (`201 Created`)
```json
{
  "success": true,
  "data": {
    "documentTitle": "Scriora 2026 Social Playbook",
    "pageCount": 3,
    "sizeBytes": 272691,
    "mimeType": "application/pdf",
    "aspectRatio": "1:1",
    "width": 1080,
    "height": 1080,
    "pdfBase64": "JVBERi0xLjcKJeLjz9MKMS..."
  },
  "meta": {
    "requestId": "req_8841a1bf9c",
    "timestamp": "2026-09-12T07:58:00.000Z"
  }
}
```

---

## 📐 Aspect Ratios Supported

| Ratio | Canvas Dimensions | Optimal Usage |
| :--- | :--- | :--- |
| **`1:1`** (Square) | `1080 x 1080 px` | Default. Balanced cross-platform reading on Desktop & Mobile. |
| **`4:5`** (Portrait) | `1080 x 1350 px` | Maximizes vertical screen real-estate in LinkedIn mobile app feed. |

---

## 💻 Programmatic Usage (`scriora-media`)

You can also use the engine directly within internal packages, CLI scripts, or background workers:

```typescript
import { PdfCarouselGenerator } from 'scriora-media';

const generator = new PdfCarouselGenerator();

// 1. Render structured slide cards to PNG buffers
const slide1 = await generator.renderSlideCard({
  title: 'Autonomous Publishing',
  subtitle: 'Scriora Core Architecture',
  slideNumber: 1,
  totalSlides: 2,
  bulletPoints: ['Zero-Trust', 'Multi-tenant', 'Event-driven'],
  theme: 'dark',
}, '1:1');

// 2. Compile into standardized PDF
const carousel = await generator.generateFromImages([slide1, 'path/to/image2.png'], {
  aspectRatio: '1:1',
  documentTitle: 'Architecture Playbook',
  author: 'Mohamed Shaban',
});

console.log(`Generated ${carousel.pageCount} pages, ${(carousel.sizeBytes / 1024).toFixed(1)} KB`);
```
