# scriora-media

Media Processing & Storage Infrastructure for Scriora.

**Mandate:** Binary validation, image/video/PDF processing,
storage abstraction, thumbnail generation, lifecycle management.

**Critical Invariant:**
This package NEVER generates media via AI.
AI generation (images, video) lives in scriora-agent.

**Processors:**
- Image: Sharp (libvips)  -  resize, crop, compress, thumbnail
- Video: FFmpeg  -  transcode, normalize, thumbnail
- PDF: Rasterize → carousel tiles (300 DPI, max 50 pages)
- Panorama: Split wide images into carousel tiles

**Storage Adapters:** S3 · Cloudflare R2 · MinIO (self-hosted)

**Security:**
- Magic byte validation (not file extension)
- Decompression bomb protection
- FFmpeg sandbox (300s timeout, no network)
- EXIF GPS stripping from public variants
- Original Master Preservation (never overwrite source)

Reference: scriora-docs/architecture/SCRIORA_MEDIA_FRAMEWORK.md

## Quality Gate

```bash
pnpm typecheck && pnpm test && pnpm build
```

Coverage minimum: 90%
