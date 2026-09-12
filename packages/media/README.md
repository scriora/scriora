# scriora-media

Media Processing, Document & PDF Carousel Infrastructure for Scriora.

**Mandate:** Binary validation, image/video/PDF processing, multi-page carousel generation, storage abstraction, thumbnail generation, lifecycle management.

**Critical Invariant:**
This package NEVER generates media via AI.
AI generation (images, video) lives in scriora-agent.

## 🚀 Key Processors

- **PDF Carousel Generator (`PdfCarouselGenerator`):**
  - Converts image arrays, URLs, or structured slide cards into standardized multi-page PDF carousels.
  - Formats: Square (`1:1` @ 1080x1080) and Portrait (`4:5` @ 1080x1350) optimized for LinkedIn (+596% engagement).
  - Dynamic card renderer (`renderSlideCard`): Sharp + SVG vector rendering with titles, subtitles, bullet points, numbering, and custom branding.
- **Image Processor:** Sharp (libvips) — resize, crop, compress, Lanczos3 resampling, EXIF auto-orient.
- **Video Processor:** FFmpeg — transcode, normalize, thumbnail generation.
- **PDF Rasterizer:** Converts PDFs into carousel image tiles.
- **Panorama Splitter:** Slices wide panoramic images into swipeable carousel tiles.

## 📦 Storage Adapters
S3 · Cloudflare R2 · MinIO (self-hosted)

## 🔒 Security Standards
- Magic byte binary validation (`%PDF-`, `PNG`, `JFIF/JPEG`)
- Decompression bomb protection
- EXIF GPS stripping from public variants
- Original Master Preservation (never overwrite source)

## 🧪 Quality Gate & Verification

```bash
pnpm --filter scriora-media typecheck && pnpm --filter scriora-media test && pnpm --filter scriora-media build
```
