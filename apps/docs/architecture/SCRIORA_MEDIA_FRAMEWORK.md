# Scriora — Media Framework

> **Status:** Canonical Platform Architecture Specification (Media Framework 100% Complete)  
> **Role:** Independent Media Processing, Transcoding & Storage Infrastructure Framework  
> **Core Principle:** `scriora-media` manages media ingestion, validation, deterministic transformation, video transcoding, and storage. It **NEVER** generates media via AI (`scriora-agent` owns AI generation).

---

# 1. Purpose & Strategic Goal

`scriora-media` is the dedicated **Media Processing & Storage Infrastructure Framework** in Scriora.

Its core mandate is to manage the end-to-end lifecycle of rich media assets from the instant of ingestion to optimized delivery across:
- **Content Studio & Composer** (Real-time previews, interactive editing)
- **Publication Pipelines** (Strict platform compliance, transcoding)
- **External Social Networks** (Container formats, codecs, aspect ratios)
- **Agent Skills** (Contextual visual analysis, asset transformation)
- **Longitudinal Analytics & Previews** (Low-overhead thumbnails)
- **Durable Multi-Tenant Storage** (Presigned uploads, lifecycle cleanup)
- **AI Media Generation Output** (Validation, transcoding, and persistence)

### The Architectural Divide
```text
Media Generation (AI-driven)  ≠  Media Processing (Deterministic)
```

---

# 2. The Core Separation Principle

> **`scriora-media` does NOT generate images or videos using Artificial Intelligence.**

- **`scriora-media` Responsibilities:** Ingestion, validation, metadata extraction, deterministic transformation, compression, video transcoding, thumbnail generation, aspect ratio adaptation, storage abstraction, and lifecycle retention/cleanup.
- **`scriora-agent` Responsibilities:** Direct interaction with generative model providers (`ImageGenerationProvider`, `VideoGenerationProvider`, `MultimodalProvider`).

---

# 3. End-to-End Asset Generation vs Processing Pipeline

```text
                         AGENT
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
     Image Generation              Video Generation
        Provider                    Provider
             │                           │
             └─────────────┬─────────────┘
                           ▼
                    Generated Asset
                           │
                           ▼
                     MEDIA CONTRACT
                           │
                           ▼
                     SCRIORA-MEDIA
                           │
       ┌───────────────────┼───────────────────┐
       ▼                   ▼                   ▼
   Validate             Transform           Store
  (Magic Bytes)      (Transcode/Crop)    (Object Storage)
       │                   │                   │
       └───────────────────┼───────────────────┘
                           ▼
                      Media Asset
                 (Ready for Publication)
```

---

# 4. Framework Responsibilities & Ownership

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        OWNED BY scriora-media                          │
├────────────────────────────────────────────────────────────────────────┤
│ • Media Contracts & Interfaces       • Video Transcoding & Packaging   │
│ • Direct & Multipart Ingestion       • FFmpeg Isolated Sandbox Runner  │
│ • Strict Security & Type Validation  • Object Storage Abstraction      │
│ • Metadata Extraction Engine         • Storage Lifecycle & Retention   │
│ • Image Processing (Sharp/WASM)      • Automated Cleanup & Garbage Col.│
│ • Aspect Ratio Adaptation Engine     • Resource Concurrency Limits     │
│ • Panorama Carousel Splitter         • Golden Media Test Fixtures      │
│ • PDF-to-Carousel Rendering Engine   • Processor Version Tracking      │
│ • Purpose-Driven Compression Engine  • Deduplication & Hash Indexing   │
└────────────────────────────────────────────────────────────────────────┘
```

---

# 5. Explicitly Excluded (Not Owned by Media)

- LLM & Cognitive Reasoning Models (Owned by `scriora-agent`)
- AI Image/Video Generation Providers (Owned by `scriora-agent`)
- Social Network SDKs & API Adapters (Owned by `scriora-social`)
- OAuth 2.0 Credentials & Token Vault (Owned by `scriora-core`)
- Multi-Tenant Workspace Authorization & RLS (Owned by `scriora-core`)
- Publication State Machine & Business Rules (Owned by `scriora-core`)
- Commercial Stripe Billing & Media Quotas (Owned by `scriora-core`)
- Mission closed-loop growth logic (Owned by `scriora-core` / `scriora-agent`)
- User Interface & Frontend Presentation (Owned by `scriora-web`)

---

# 6. Rationale: Why Decouple Generation from Processing?

Generative AI and Media Processing solve fundamentally different computing problems:

| Dimension | Media Generation (Agent) | Media Processing (Media) |
| :--- | :--- | :--- |
| **Input** | Abstract natural language prompt / seed | Binary stream / existing byte buffer |
| **Engine** | External cloud AI providers (OpenAI, Midjourney) | Local deterministic libraries (Sharp, FFmpeg) |
| **Cost Profile** | High per-generation token/credit expense | Predictable local CPU, GPU, and RAM |
| **Determinism** | Probabilistic, non-deterministic | Highly deterministic across identical inputs |
| **Failure Mode** | Hallucination, safety refusal, provider 5xx | Codec incompatibility, memory limit, timeout |

Coupling them creates a brittle architecture where changing an AI model vendor breaks the local transcoding pipeline.

---

# 7. The Logical Media Asset Entity

A `MediaAsset` represents the durable logical identity of a media object within Scriora:

```text
MediaAsset
 ├── workspace_id: UUID (Mandatory Tenant Boundary)
 ├── type: IMAGE | VIDEO | DOCUMENT | AUDIO
 ├── mime_type: String (Verified via magic bytes)
 ├── file_size_bytes: BigInt
 ├── dimensions: { width: Int, height: Int }
 ├── duration_seconds: Nullable Float
 ├── storage_key: URI (Encrypted pointer in Object Storage)
 ├── processing_state: REGISTERED | PROCESSING | READY | FAILED
 ├── source: USER_UPLOAD | AI_GENERATED | TRANSFORMED | IMPORT
 ├── checksum_sha256: HexString (Integrity and deduplication)
 ├── metadata: JSON (Exif, codecs, bitrate, audio tracks)
 └── lifecycle: RetainForever | ExpireAt(Timestamp)
```

*A `MediaAsset` is an infrastructure object; it is NOT the commercial `Content` or `Publication`.*

---

# 8. Supported Media Types & Scope

1. **IMAGE (Core):** JPEG, PNG, WebP, GIF (Validation, resizing, cropping, compression)
2. **VIDEO (Core):** MP4, MOV, WebM (Transcoding, H.264/AAC, resolution, aspect ratio)
3. **DOCUMENT / PDF (Core):** Multi-page PDF (Rasterization into ordered carousel slides)
4. **AUDIO (Extension Point):** MP3, WAV, AAC (Preserved as extension point for voiceovers/podcasts)

---

# 9. Media Ingestion Sources

Every incoming asset is tagged with its provenance:
- `USER_UPLOAD`: Direct manual upload from web dashboard or CLI.
- `IMPORT`: Cloud drive import (Google Drive, Dropbox, OneDrive, Unsplash).
- `SOCIAL_PLATFORM`: Media synced from external social network webhooks.
- `AI_GENERATED`: Binary emitted by an agent image/video provider.
- `TRANSFORMED`: Derived asset produced by local resizing, cropping, or splitting.
- `EXTERNAL_REFERENCE`: Remote media referenced by external URL.

---

# 10. The Media Ingestion Pipeline

```text
Client Request
    │
    ▼
Authenticate User & Verify Workspace Entitlement
    │
    ▼
Register Upload Intent (Generate Asset ID & Presigned URL)
    │
    ▼
Client Uploads Directly to Object Storage
    │
    ▼
Webhook / Notification: Upload Complete
    │
    ▼
Inspect Magic Bytes & Extract Technical Metadata
    │
    ▼
Execute Security Sandboxing & Deep Validation
    │
    ▼
Emit Ready State or Queue Background Transcoding Job
```

---

# 11. Presigned Direct Upload Architecture

Large files (especially 4K video and multi-page PDFs) **NEVER** stream through the API application server memory:

```text
Browser / Client ──► scriora-api (Register Intent) ──► Returns Presigned S3 URL
       │
       └──────────────────► Object Storage (Direct Binary Stream)
                                   │
                                   ▼
                            scriora-media (Background Processing)
```

### Strategic Benefits
1. **Zero API Memory Bloat:** Prevents Node.js event loop starvation.
2. **Infinite Concurrency:** Leverages cloud storage edge ingress bandwidth.
3. **Chunked & Resumable:** Enables robust multipart uploads for massive files.

---

# 12. Deep Binary Validation Standards

File extensions are untrusted user input. The framework enforces deep binary inspection:
- **Magic Byte Verification:** Reads initial binary headers (e.g., `FF D8 FF` for JPEG, `89 50 4E 47` for PNG, `ftyp` for MP4).
- **Container & Codec Parsing:** Validates MP4 atom trees and H.264 NAL units.
- **Dimensional Extraction:** Confirms exact width, height, and color space.
- **Duration & Audio Validation:** Ensures video streams contain valid timecodes.

*Mismatches between filename extension and binary magic bytes trigger immediate rejection.*

---

# 13. Security Validation & Sandboxing

All uploaded media is treated as a potential cyber attack vector:
1. **Decompression Bomb Protection:** Images exceeding 100 megapixels uncompressed are rejected before memory allocation.
2. **Parser Sandboxing:** FFmpeg and PDF renderers run in isolated worker processes with non-root privileges.
3. **No Network Access:** Media processing sub-processes operate with outbound networking completely disabled.
4. **Metadata Sanitization:** Geolocation (GPS) and private camera EXIF data are stripped from public variants.

---

# 14. Strict Resource Limits

Workspaces and deployments enforce unbreakable hardware limits:
- **Max Image Size:** 50 MB
- **Max Video Size:** 2 GB (Self-hosted configurable)
- **Max Video Duration:** 60 minutes
- **Max Image Resolution:** 8192 × 8192 px
- **Max Processing Timeout:** 300 seconds per transcoding job
- **Max Worker Memory:** Hard cap per FFmpeg process (e.g., 2 GB RAM)

---

# 15. Deterministic Image Processing Engine

Image transformation is powered by high-performance native bindings (Sharp / libvips / WASM):
- **Resize:** Lanczos3 bicubic resampling
- **Crop:** Bounded gravity, safe-area focus, smart visual centering
- **Fit Strategies:** `cover`, `contain`, `fill`, `inside`, `outside`
- **Format Conversion:** Progressive JPEG, WebP, PNG
- **Thumbnailing:** Sub-millisecond thumbnail generation

---

# 16. Canonical Social Aspect Ratios

Scriora standardizes content around 4 universal social ratios:
1. **1:1 (Square):** Standard feed posts (Instagram, LinkedIn, X, Facebook)
2. **4:5 (Vertical Feed):** High-engagement mobile feed posts (Instagram, LinkedIn)
3. **16:9 (Landscape):** Desktop, YouTube landscape, X widescreen
4. **9:16 (Full Vertical):** Stories, Reels, TikTok, YouTube Shorts

---

# 17. Intelligent Aspect Ratio Adaptation Strategy

Images are never blindly stretched or distorted:
- **Smart Crop Strategy:** Preserves high-entropy focal points.
- **Safe Area Inset:** Ensures critical text or faces remain outside UI overlays (e.g., TikTok buttons).
- **Pad & Fill:** Optional background blurring or brand padding when cropping is prohibited.

---

# 18. The Panorama Carousel Splitter

Scriora features a dedicated engine to slice wide panoramic artwork into seamless carousel slides:
```text
Wide Panorama (e.g., 3240 × 1080 px)
    │
    ▼
Validate Aspect Ratio & Minimum Dimensions
    │
    ▼
Calculate Seamless Tile Geometry (e.g., 3 tiles of 1080 × 1080 px)
    │
    ▼
Lossless Precision Slicing
    │
    ▼
Output Ordered Asset Array: [Tile 1, Tile 2, Tile 3]
```

---

# 19. Panorama Output Specifications

The splitter outputs an immutable carousel manifest:
- Sequence is guaranteed by integer index (`0, 1, 2...`).
- Individual tiles share matching height and boundary pixel alignments.
- Stored as derived assets linked to the original panoramic source.

---

# 20. PDF to Carousel Conversion Engine

To power LinkedIn Document Posts and educational carousels:
```text
Multi-Page PDF
    │
    ▼
Validate PDF Structure (Reject corrupted or encrypted files)
    │
    ▼
Rasterize Pages into High-Resolution PNG/WebP (300 DPI)
    │
    ▼
Apply Brand Aspect Ratio Normalization (4:5 or 1:1)
    │
    ▼
Produce Ordered Carousel Tile Manifest
```

---

# 21. PDF Processing Security Guardrails

PDF files represent a known vector for remote code execution and memory corruption:
- Strict limit of 50 pages per PDF document.
- JavaScript execution within PDF streams is completely disabled.
- External font or asset fetching via HTTP is blocked at the OS socket level.
- Rendering process is killed if memory consumption exceeds 1 GB.

---

# 22. Video Processing & Transcoding Engine

Video transcoding is managed through a controlled, observable pipeline:
- **Transcoding:** Re-encoding into baseline H.264 (AVC) / AAC audio for universal compatibility.
- **Container Packaging:** Faststart MP4 (`moov` atom relocated to front for instant web streaming).
- **Resolution Scaling:** Downscaling 4K/1080p to platform-optimal target resolutions.
- **Frame Rate Normalization:** Standardizing variable frame rates to a steady 30 or 60 fps.
- **Thumbnail Extraction:** Capturing the primary visual frame at timestamp `00:00:01.000`.

---

# 23. Controlled FFmpeg Architecture

FFmpeg is strictly an underlying infrastructure implementation detail:
- It is **NEVER** exposed via HTTP or direct CLI execution to users or agents.
- Executed solely through typed, validated parameter builders inside `scriora-media`.

```text
Agent / Web ──► Media Contract ──► Media Processor ──► Sandboxed FFmpeg Process
```

---

# 24. FFmpeg Process Isolation & Sandbox

Every FFmpeg job runs inside an OS-level sandbox:
- **Process Timeout:** Hard kill after 300 seconds.
- **Resource Limits:** `ulimit` enforcement on CPU time and virtual memory.
- **Clean Standard Output:** Structured progress reporting via JSON pipe.
- **Zero Temporary Residue:** Temporary scratch frames are deleted immediately upon job completion.

---

# 25. Platform-Agnostic Video Codec Normalization

`scriora-media` does not embed social network business logic. Instead, it processes against standardized **Media Profiles**:
- Social platforms publish their media requirements as abstract profiles.
- Media Framework fulfills the profile without knowing which network requested it.

---

# 26. The Canonical Media Profile Contract

```typescript
interface MediaProfile {
  id: string; // e.g., "social-feed-portrait"
  targetType: "IMAGE" | "VIDEO";
  container: "mp4" | "webp" | "jpeg";
  videoCodec?: "h264";
  audioCodec?: "aac";
  dimensions: { width: number; height: number };
  aspectRatio: "1:1" | "4:5" | "16:9" | "9:16";
  maxBitrateKbps?: number;
  maxFileSizeMB: number;
  maxDurationSeconds?: number;
  fastStart?: boolean;
}
```

---

# 27. Platform Constraints Separation

```text
scriora-social   ──► Declares Platform Capability (e.g., "Instagram requires MP4 H.264, 4:5, max 60s")
       ↓
Media Profile    ──► Canonical Profile Translation ("instagram-feed-video")
       ↓
scriora-media    ──► Executes Transcoding against Profile Specifications
```

`scriora-media` contains zero references to `instagram.com`, `tiktok.com`, or Meta Graph APIs.

---

# 28. Purpose-Driven Compression Strategies

Compression is tailored to the intended consumption tier:
1. **ORIGINAL:** Unaltered master binary (Archival reference).
2. **OPTIMIZED:** Visually lossless compression (Web & high-speed publishing).
3. **PLATFORM_READY:** Strictly conforms to specific social network file size caps.
4. **THUMBNAIL:** Aggressively compressed micro-asset (< 50 KB) for lists.
5. **PREVIEW:** Fast-loading, watermarked, or scaled down asset for editing.

---

# 29. Original Master Preservation Invariant

> **Transformations MUST NEVER overwrite or destroy the Original Master Asset.**

```text
Original Master Asset (Untouched)
 ├── Optimized Variant (Web display)
 ├── Platform Variant (4:5 Crop, 1080×1350)
 ├── Story Variant (9:16 Crop, 1080×1920)
 └── Thumbnail Variant (200×200)
```

This guarantees non-destructive editing and allows re-processing whenever platform standards evolve.

---

# 30. Derived Assets Lineage Tracking

Every derived asset explicitly records its lineage:
- `source_asset_id`: Pointer to master asset
- `transformation_type`: `RESIZE | CROP | TRANSCODE | SPLIT`
- `media_profile_id`: Profile used during processing
- `processor_version`: Engine version string (e.g., `sharp-0.33.5/ffmpeg-6.1`)
- `created_at`: Timestamp of generation

---

# 31. Deterministic Processing Invariant

Identical inputs, profiles, and processor versions **MUST** yield identical or visually indistinguishable binary outputs. This enables caching, fast deduplication, and verifiable test suites.

---

# 32. Cryptographic Content Hashing

Every ingested asset computes a `checksum_sha256` hash:
- Enables instant duplicate detection before processing.
- Validates data integrity across object storage transfers.
- Acts as a cache key for idempotent transformation requests.
- *A content hash is an attribute; it does NOT replace the tenant-isolated `MediaAsset ID`.*

---

# 33. Object Storage Abstraction Layer

`scriora-media` communicates with storage through a provider-neutral interface:
```typescript
interface ObjectStorageProvider {
  generatePresignedUploadUrl(key: string, options: UploadOptions): Promise<string>;
  generatePresignedDownloadUrl(key: string, expiresInSeconds: number): Promise<string>;
  putObject(key: string, stream: ReadableStream, metadata: ObjectMetadata): Promise<void>;
  getObject(key: string): Promise<ReadableStream>;
  deleteObject(key: string): Promise<void>;
  headObject(key: string): Promise<ObjectHeader | null>;
}
```

Implementations include: AWS S3, Cloudflare R2, MinIO, and Local Filesystem.

---

# 34. 100% Self-Hosting Freedom

- Cloudflare R2 is an optional cloud deployment target, **NOT** an architectural requirement.
- In self-hosted environments, Scriora runs seamlessly with local **MinIO** or any S3-compliant storage cluster without vendor lock-in.

---

# 35. Hierarchical Storage Layout

Objects are organized logically in tenant-isolated paths:
```text
/workspaces/{workspace_id}/assets/{asset_id}/master.{ext}
/workspaces/{workspace_id}/assets/{asset_id}/variants/{variant_name}.{ext}
/workspaces/{workspace_id}/tmp/{session_id}/scratch.{ext}
```

*The underlying storage key format is an infrastructure detail hidden from client applications.*

---

# 36. Zero Public Storage by Default

- All media buckets are **PRIVATE BY DEFAULT**.
- Direct public read access to storage buckets is disabled.
- Assets are delivered via short-lived **Presigned URLs** or authenticated application gateways.

---

# 37. Multi-Tenant Media Access Control

Possessing an `asset_id` or storage key does not grant read access:
1. Every access request validates the calling user's workspace membership.
2. If authorized, the system generates an HMAC-signed presigned download URL with an expiration window (e.g., 15 minutes).

---

# 38. Ephemeral vs Permanent Media Assets

```text
                        ┌────────────────────────┐
                        │      Asset Types       │
                        └───────────┬────────────┘
                                    │
           ┌────────────────────────┴────────────────────────┐
           ▼                                                 ▼
┌───────────────────────┐                         ┌───────────────────────┐
│   Temporary Assets    │                         │   Permanent Assets    │
├───────────────────────┤                         ├───────────────────────┤
│ • Upload staging      │                         │ • Content Library     │
│ • Intermediate frames │                         │ • Published Assets    │
│ • Candidate AI drafts │                         │ • Brand Media Kit     │
│ • Ephemeral previews  │                         │ • Campaign Masters    │
│ (TTL: 24 to 72 hours) │                         │ (Retained indefinitely│
└───────────────────────┘                         └───────────────────────┘
```

---

# 39. Permanent Asset Retention Policy

Permanent assets referenced by published posts or the workspace Media Library are protected against accidental deletion. They are only removed when explicitly deleted by an authorized workspace administrator.

---

# 40. Automated Cleanup Engine (Garbage Collection)

An automated background job runs periodically to prune unreferenced storage:
- Purges temporary uploads older than 48 hours.
- Removes orphaned scratch files and aborted multipart chunks.
- Emits structured audit logs detailing reclaimed disk space.

---

# 41. Orphan Detection & Reconciliation

The cleanup engine cross-checks physical storage against PostgreSQL:
1. **Dangling Objects:** Storage files with no corresponding record in `media_assets` are safely deleted after a 7-day quarantine window.
2. **Missing Binaries:** Database records whose physical storage objects are missing are marked with status `UNAVAILABLE`.

---

# 42. Media Processing State Machine

```text
┌────────────┐     ┌───────────┐     ┌──────────┐     ┌────────────┐
│ REGISTERED ├───► │ UPLOADING ├───► │ UPLOADED ├───► │ VALIDATING │
└────────────┘     └───────────┘     └──────────┘     └─────┬──────┘
                                                            │
                     ┌──────────────────────────────────────┴──────┐
                     ▼                                             ▼
              ┌────────────┐                                ┌─────────────┐
              │ PROCESSING │                                │ FAILED_PERM │
              └──────┬─────┘                                └─────────────┘
                     │
       ┌─────────────┴─────────────┐
       ▼                           ▼
┌──────────────┐            ┌─────────────┐
│    READY     │            │ FAILED_RETR │
└──────┬───────┘            └─────────────┘
       │
       ▼
┌──────────────┐     ┌───────────┐
│   EXPIRED    ├───► │  DELETED  │
└──────────────┘     └───────────┘
```

---

# 43. Processing Failure Classification

- **`FAILED_RETRYABLE`:** Worker timeout, transient storage 503, out-of-memory killed by host (Retried with backoff).
- **`FAILED_PERMANENT`:** Malformed video file, unsupported codec, corrupted container (Terminated immediately without retry).

---

# 44. Asynchronous Media Jobs

Heavy processing operations are strictly forbidden inside synchronous HTTP request lifecycles:
- Video transcoding, PDF rasterization, and panorama splitting are enqueued as durable background jobs.
- The HTTP API returns an immediate `202 Accepted` with a job tracking URL.

---

# 45. Inter-Repo Contract: Media ↔ Worker

`scriora-worker` coordinates job scheduling and durable execution:
- Worker pulls the transcoding task from the Inngest / Redis queue.
- Worker executes the operation using `scriora-media` processing libraries.
- Worker updates database state upon job completion.

---

# 46. Inter-Repo Contract: Media ↔ Core

- `scriora-core` owns the authoritative `media_assets` relational table.
- `scriora-media` owns the binary processing code, FFmpeg drivers, and storage adapters.
- Status transitions and metadata updates are dispatched via typed Core Application Contracts.

---

# 47. Database Ownership Clarity

> **`media_assets` belongs to `scriora-core` migrations.**

`scriora-media` does not create duplicate tables or independent schemas for business media. It operates against the single relational database contract.

---

# 48. Canonical Media Contract API

```typescript
interface MediaContract {
  registerUpload(request: RegisterUploadDTO): Promise<UploadRegistrationVO>;
  validateAsset(assetId: string): Promise<ValidationResultVO>;
  transformAsset(assetId: string, profile: MediaProfile): Promise<MediaAssetVO>;
  generateVariant(assetId: string, options: VariantOptions): Promise<MediaAssetVO>;
  getMetadata(assetId: string): Promise<MediaMetadataVO>;
  createPreview(assetId: string): Promise<PreviewVO>;
  deleteAsset(assetId: string): Promise<void>;
}
```

---

# 49. Inter-Repo Contract: Media ↔ Agent

The Agent interacts with media exclusively through high-level tool contracts:
- `media.transform`
- `media.get_metadata`
- `media.create_preview`

*The Agent cannot run shell commands or interact with FFmpeg processes directly.*

---

# 50. AI Media Generation Ingestion Flow

When an AI provider generates an image or video:
1. `scriora-agent` receives the binary stream or temporary external download URL.
2. Agent calls `media.register_generated_asset` via Media Contract.
3. `scriora-media` downloads, validates, compresses, and persists the binary into Object Storage.
4. Returns an authoritative `MediaAsset` record to the Agent.

---

# 51. Generative Provenance Metadata

AI-generated media records essential provenance metadata:
- `source`: `AI_GENERATED`
- `provider`: Model provider identifier (e.g., `openai/dall-e-3`, `replicate/flux-schnell`)
- `seed` & `style`: Nonce and style parameters
- *Raw prompts are sanitized to prevent secret leaks.*

---

# 52. Financial Cost Isolation Invariant

- Generative AI costs (model API tokens and generation credits) are logged under **`scriora-agent` Provider Runs**.
- Media processing resource costs (CPU time, local transcoding durations) are recorded under **`scriora-media` Job Telemetry**.
- Processing costs are never conflated with AI generation costs.

---

# 53. Media Deduplication Architecture

When an upload completes, its `checksum_sha256` is checked against existing assets in the workspace:
- If an exact binary duplicate exists:
- The system reuses the existing storage object reference rather than duplicating storage bytes.
- Maintains independent metadata records if needed.

---

# 54. Workspace Media Library Integration

The Media Library is a user-facing product feature powered by `scriora-media` metadata:
- Folder organization, visual tagging, dimensional search, and filtering by aspect ratio.
- Frontend rendering is owned by `scriora-web`.

---

# 55. External Cloud Drives Ingestion

Media imported from third-party storage services (Google Drive, Dropbox, Unsplash, Canva):
- Imported via streaming download directly into the ingestion sandbox.
- Subjected to the exact same deep binary and security validations as manual file uploads.

---

# 56. External Cloud Import Security

Never trust a file simply because it originated from Google Drive or Canva:
- Enforce magic byte detection.
- Enforce maximum size and duration limits.
- Sanitize EXIF metadata prior to public distribution.

---

# 57. Thumbnail Generation Standards

Thumbnails are first-class derived assets:
- Default dimensions: `300 × 300 px` (Square) and `320 × 180 px` (16:9).
- Format: High-efficiency WebP / Progressive JPEG.
- Generated automatically upon asset ingestion for instant UI display.

---

# 58. Fast-Loading Preview Pipeline

Low-resolution, lightweight previews are generated for real-time composer previews:
- Sub-100 KB payload size.
- Pre-rendered with active aspect-ratio crops so content creators see exact layouts instantly.

---

# 59. Large Video Multipart Strategy

Videos exceeding 100 MB utilize chunked multipart uploads:
- Client splits video into 5 MB to 10 MB parts.
- Parts upload concurrently to Object Storage.
- Storage service reassembles parts into a single master object upon completion.

---

# 60. Backpressure & Concurrency Control

To prevent system exhaustion under heavy batch uploads:
- Concurrency limiter caps simultaneous FFmpeg transcode processes per worker node.
- Excess jobs remain in durable queue until worker capacity frees up.
- Priority queuing ensures single user-interactive preview jobs jump ahead of bulk batch transcodes.

---

# 61. Job Processing Priority Tiers

1. **Tier 1 (Interactive):** Real-time composer image crop / preview generation.
2. **Tier 2 (Critical Publishing):** Video scheduled to publish in < 15 minutes.
3. **Tier 3 (Standard Upload):** Regular user media uploads and draft processing.
4. **Tier 4 (Bulk Background):** PDF rasterization and batch imports.
5. **Tier 5 (Maintenance):** Storage cleanup, orphan reconciliation, and cache warming.

---

# 62. Media Observability & Telemetry

Every processing job records structured metrics:
- `asset_id` & `operation_id`
- Processing duration in milliseconds
- Input and output file sizes (compression ratio achieved)
- Peak memory (RSS) and CPU usage
- Processor engine version
- *Signed URLs and access tokens are completely redacted from logs.*

---

# 63. Comprehensive Security Test Suite

The media test suite runs automated penetration tests against:
- Polyglot malicious files (e.g., PHP code appended to valid JPEG headers)
- Decompression zip/image bombs
- Corrupted MP4 moov atoms designed to freeze FFmpeg
- Malformed PDF files containing exploit payloads
- Path traversal attempts in presigned key generation
- Cross-tenant asset access attempts

---

# 64. Media Test Pyramid

```text
                  ┌────────────────────────┐
                  │ Visual Regression Suite│
                  ├────────────────────────┤
                  │    Security Tests      │
                  ├────────────────────────┤
                  │   Integration Tests    │
                  ├────────────────────────┤
                  │     Contract Tests     │
                  ├────────────────────────┤
                  │       Unit Tests       │
                  └────────────────────────┘
```

---

# 65. The Golden Media Test Fixtures

The codebase maintains an immutable repository of verified media fixtures:
- `fixture-valid.jpg` (Standard baseline)
- `fixture-alpha.png` (Transparent PNG)
- `fixture-animation.webp` (Animated WebP)
- `fixture-wide-panorama.jpg` (3240 × 1080 px panorama)
- `fixture-document.pdf` (Multi-page sample presentation)
- `fixture-h264-audio.mp4` (Standard compliant video)
- `fixture-invalid-magic-bytes.jpg` (Malicious executable masquerading as JPEG)
- `fixture-decompression-bomb.png` (High-ratio memory exhaustion bomb)

---

# 66. Image Visual Regression Standards

Image transformations are tested for visual integrity:
- Validates pixel dimensions match requested profile.
- Compares perceptual hashes (pHash) against golden baseline images.
- Ensures crop coordinates correctly track designated safe areas.

---

# 67. Video Quality & Sync Regression

Video processing tests verify:
- Audio and video streams maintain zero drift across duration.
- Target bitrate stays within ±5% of specified constraint.
- Frame rate conforms to steady platform standard.

---

# 68. Processor Version Tracking

Any upgrade to native libraries (e.g., Sharp `0.32` to `0.33` or FFmpeg `6.0` to `7.0`) is tracked in metadata:
- Prevents cache invalidation collisions.
- Enables blue-green verification of visual rendering outputs.

---

# 69. Non-Destructive Reprocessing Architecture

When a new transformation algorithm or video codec profile is deployed:
- The system reads the immutable **Original Master Asset**.
- Generates a new derived variant with updated processor version tags.
- The master asset remains 100% pristine.

---

# 70. Idempotent Processing Execution

Requesting the same transformation multiple times:
```text
transformAsset(assetId, "social-portrait-4x5")
```
Returns the existing derived asset immediately if the checksum and processor versions match, saving 100% of compute time.

---

# 71. Universal Error Classification Mapping

Media errors map directly to the system-wide canonical error taxonomy:
- `MEDIA_INVALID_TYPE` ──► `VALIDATION` (400)
- `MEDIA_TOO_LARGE` ──► `VALIDATION` (413)
- `MEDIA_UNSUPPORTED_FORMAT` ──► `VALIDATION` (415)
- `MEDIA_PROCESSING_TIMEOUT` ──► `TIMEOUT` (504)
- `MEDIA_RESOURCE_EXHAUSTED` ──► `RATE_LIMITED` (429)
- `MEDIA_STORAGE_UNAVAILABLE` ──► `UNAVAILABLE` (503)

---

# 72. Media-Specific Error Enumeration

```typescript
enum MediaErrorCode {
  INVALID_MAGIC_BYTES = "MEDIA_INVALID_MAGIC_BYTES",
  CORRUPTED_STREAM = "MEDIA_CORRUPTED_STREAM",
  EXCEEDS_DIMENSION_LIMIT = "MEDIA_EXCEEDS_DIMENSION_LIMIT",
  EXCEEDS_DURATION_LIMIT = "MEDIA_EXCEEDS_DURATION_LIMIT",
  UNSUPPORTED_CONTAINER = "MEDIA_UNSUPPORTED_CONTAINER",
  TRANSCODING_FAILED = "MEDIA_TRANSCODING_FAILED",
  STORAGE_PUT_FAILED = "MEDIA_STORAGE_PUT_FAILED",
  ASSET_NOT_FOUND = "MEDIA_ASSET_NOT_FOUND"
}
```

---

# 73. Publishing Invariant: Media Never Makes Publishing Decisions

`scriora-media` never decides whether a post can or cannot be published:
- Media reports: *"This video complies with profile `video-h264-1080p`."*
- `scriora-social` decides: *"Instagram accepts this video for publication."*

---

# 74. Architectural Boundary: Social + Media

```text
Social Capability ──► Required Media Profile ──► Media Engine ──► Prepared Asset ──► Social Adapter
```

`scriora-media` does not import social network SDKs; `scriora-social` does not execute FFmpeg commands.

---

# 75. Architectural Boundary: Agent + Media

```text
Agent Skill ──► Media Tool Contract ──► Media Engine ──► Transformed Asset
```

The Agent reasons about visual aesthetics; Media executes pixel calculations.

---

# 76. Architectural Boundary: Storage + Processing

Storage and Processing are strictly decoupled:
- **Storage Layer:** Exclusively stores, retrieves, and signs URLs for binary blobs.
- **Processing Layer:** Pulls binary streams, applies transformations, and pipes results back to Storage.

Swapping MinIO for Cloudflare R2 requires zero changes to image cropping or video transcoding logic.

---

# 77. Self-Hosted Infrastructure Topology

In a self-hosted single-node installation:
```text
┌────────────────────────────────────────────────────────┐
│               Single Host Docker Compose               │
├────────────────────────────────────────────────────────┤
│ PostgreSQL 16  │ Authoritative business state & assets │
│ Redis 7        │ Distributed locks & job queues        │
│ MinIO          │ S3-compatible local object storage    │
│ scriora-media  │ Embedded Sharp & FFmpeg binary worker │
└────────────────────────────────────────────────────────┘
```

The system requires zero external cloud dependencies to process images and videos.

---

# 78. Runtime Deployment Strategies

While `scriora-media` is maintained in an isolated repository:
- **MVP / Moderate Scale:** Embedded as a worker module within the unified background worker process.
- **Enterprise / High-Scale:** Deployed as dedicated GPU-accelerated or high-CPU worker nodes consuming transcoding queues.

---

# 79. Horizontal Scaling Mechanics

When video transcoding demand spikes:
- Spin up additional worker containers running `scriora-media`.
- Scale worker count horizontally via Kubernetes or Docker Swarm.
- Database schemas and domain logic remain completely untouched.

---

# 80. The Anti-Premature Microservices Law

> **Do NOT split media processing into fragmented microservices.**

We strictly reject breaking the framework into:
- `image-resizing-service`
- `video-transcoding-service`
- `pdf-rendering-service`
- `storage-broker-service`

A single, cleanly factored codebase with modular internal adapters provides maximum developer velocity and minimal operational complexity.

---

# 81. Future Extension Roadmap

The architecture provides explicit extension points for future capabilities:
- Automated Speech-to-Text Subtitle Generation (Whisper)
- Dynamic Subtitle Burn-In via FFmpeg filters
- AI-Powered Background Removal (RemBg / WebAssembly)
- Super-Resolution Image Upscaling
- Voiceover Audio Normalization (LUFS standard)

---

# 82. Invariant: Media Variant ≠ Content Variant

```text
Content Variant (scriora-core)   = Multi-channel copy, text hook, tone, hashtags.
Media Variant (scriora-media)     = 4:5 Crop, 9:16 Video, WebP compressed image.
```

A single `ContentVariant` can reference one or more `MediaVariants`. They remain distinct logical entities.

---

# 83. The Carousel Ordering Invariant

Carousels enforce explicit, non-destructive ordering:
- Sequence is governed by an explicit index (`order_index: 0, 1, 2...`).
- Carousel slide ordering is **NEVER** inferred from alphabetical filename sorting.

---

# 84. The Unified Media Manifest

Any composite media package (Carousels, Video chapters, Split panoramas) is defined by a strict manifest:
```typescript
interface MediaManifest {
  manifestId: string;
  type: "CAROUSEL" | "PANORAMA_SPLIT" | "STORY_SEQUENCE";
  items: Array<{
    assetId: string;
    orderIndex: number;
    aspectRatio: string;
    label?: string;
  }>;
}
```

---

# 85. Complete Media Lifecycle Flowchart

```text
                     Upload / Import / AI Generation
                                   │
                                   ▼
                        Registration & Presigning
                                   │
                                   ▼
                        Direct Binary Ingestion
                                   │
                                   ▼
                        Magic Byte & Security Check
                                   │
                                   ▼
                         Metadata Extraction
                                   │
                                   ▼
                      Durable Object Storage Put
                                   │
                                   ▼
                   Derive Variants (Thumbnails, Crops)
                                   │
                                   ▼
                  Attached to Content & Published
                                   │
                                   ▼
                   Retention Policy or Expired Cleanup
```

---

# 86. Master Architectural Interaction Diagram

```text
                 ┌─────────────────────┐
                 │     scriora-web     │
                 └──────────┬──────────┘
                            │
                            ▼
                 ┌─────────────────────┐
                 │    scriora-api      │
                 └──────────┬──────────┘
                            │
                            ▼
                 ┌─────────────────────┐
                 │   Media Contract     │
                 └──────────┬──────────┘
                            │
                            ▼
                 ┌─────────────────────┐
                 │   scriora-media     │
                 ├─────────────────────┤
                 │ Ingestion            │
                 │ Validation           │
                 │ Image Processing     │
                 │ Video Processing     │
                 │ PDF Processing       │
                 │ Carousel Processing  │
                 │ Compression          │
                 │ Storage Abstraction  │
                 └──────────┬──────────┘
                            │
                ┌───────────┴───────────┐
                ▼                       ▼
          Object Storage          Media Metadata
          (MinIO / R2 / S3)      (via Core Contract)
```

---

# 87. Master Responsibility Matrix

| Subsystem Responsibility | Primary Owner | Secondary / Collaborator |
| :--- | :--- | :--- |
| **Media Business Record** | `scriora-core` | `scriora-media` |
| **Media Ingestion & Validation** | `scriora-media` | `scriora-api` |
| **Image Transformation (Sharp)** | `scriora-media` | None |
| **Video Transcoding (FFmpeg)** | `scriora-media` | None |
| **PDF Carousel Rasterization** | `scriora-media` | None |
| **Panorama Splitting** | `scriora-media` | None |
| **Storage Abstraction (S3/R2)** | `scriora-media` | Infrastructure |
| **Object Lifecycle & Cleanup** | `scriora-media` | `scriora-worker` |
| **AI Image/Video Generation** | `scriora-agent` | External Providers |
| **Platform Media Constraints** | `scriora-social` | `scriora-media` |
| **Durable Worker Scheduling** | `scriora-worker` | `scriora-media` |
| **Composer UI Presentation** | `scriora-web` | None |
| **HTTP Presigned Endpoints** | `scriora-api` | `scriora-media` |

---

# 88. The 14 Invariant Media Framework Rules

1. **Rule 1 (Media ≠ AI Generation):** Media Framework NEVER generates assets using AI models.
2. **Rule 2 (Media ≠ Social Platform):** Media Framework NEVER imports social platform SDKs.
3. **Rule 3 (Media ≠ Business Domain):** Media Framework holds zero commercial or mission logic.
4. **Rule 4 (No API Memory Streaming):** Large binary assets NEVER stream through API memory buffers.
5. **Rule 5 (Never Trust Extensions):** Verification strictly relies on magic bytes and container inspection.
6. **Rule 6 (Untrusted Input):** All uploaded files are treated as untrusted and processed in sandboxes.
7. **Rule 7 (Heavy Processing Async):** Video transcoding and PDF rendering are strictly asynchronous.
8. **Rule 8 (Full Lineage Tracking):** Derived assets must permanently link to their originating master.
9. **Rule 9 (Original Master Preservation):** Transformations must NEVER overwrite or destroy the master asset.
10. **Rule 10 (Pluggable Storage):** Storage is provider-agnostic (S3, MinIO, R2) with zero vendor lock-in.
11. **Rule 11 (External Platform Decoupling):** Social requirements are passed solely as abstract Media Profiles.
12. **Rule 12 (Cost Isolation):** Processing hardware costs are isolated from generative AI token costs.
13. **Rule 13 (Anti-Microservices):** Media operations are consolidated in one repository without microservice bloat.
14. **Rule 14 (PostgreSQL System of Record):** Relational PostgreSQL remains the sole authoritative source of truth.

---

# 89. Status: 100% Formally Sealed

```text
Media Framework Architecture
████████████████████████████████████ 100% COMPLETE
```

All 90 architectural specifications, processing pipelines, security guardrails, storage abstractions, and boundary contracts for `scriora-media` are formally frozen and canonical.

---

# 90. The Master Architectural Decision

`scriora-media` is NOT a simple utility helper. It is the **Independent Media Infrastructure Engine** of Scriora:

```text
              AGENT
       (AI Media Generation)
                 │
                 ▼
           MEDIA CONTRACT
                 │
                 ▼
               MEDIA
       (Processing & Storage)
                 ▲
                 │
              SOCIAL
     (Platform Media Profiles)
```

This rigid decoupling guarantees that any AI generator, cloud storage provider, or social network requirement can evolve independently without destabilizing the core media engine.
