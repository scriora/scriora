# Scriora — Social Platform Framework

> **Status:** Canonical Platform Architecture Specification (Social Framework 100% Complete)  
> **Role:** Independent Social Platform Integration Architecture & Anti-Corruption Layer (ACL)  
> **Core Principle:** `scriora-core` speaks Scriora business language; `scriora-social` speaks external platform language. The adapter translates between them.

---

# 1. Purpose & Architectural Isolation

`scriora-social` is an **independent Social Platform Framework** engineered to interact with heterogeneous external social networks.

### Strategic Objective
> **Enable Scriora to integrate, evolve, and certify social platforms without altering the Business Core.**

```text
scriora-core   ──► Business Contracts & Invariants (Platform-Agnostic)
      ↓
scriora-social ──► Platform Contracts & Anti-Corruption Layer (ACL)
      ↓
External APIs  ──► Heterogeneous Social APIs (LinkedIn, X, Meta, TikTok, YouTube...)
```

`scriora-core` contains zero platform-specific SDKs, API versions, or vendor networking logic.

---

# 2. Repository Ownership & Boundaries

## Owned by `scriora-social`
- Platform Contracts & Interface Specifications
- `PlatformRegistry` & `CapabilityRegistry`
- Granular Capability Models
- OAuth 2.0 Adapters & PKCE Handshakes
- Remote Account Discovery & Introspection
- Content Dispatch & Normalized Publishing
- Asynchronous Post Verification
- Longitudinal Analytics Extraction & Ingestion
- Webhook Ingress, Normalization & Signature Verification
- Rate-Limit Tracking & Quota Normalization
- Error Classification & Normalization
- Media Transcoding Constraints (MIME, sizes, ratios)
- Platform-Specific Extensible Options
- 6-Stage Certification Lifecycle
- High-Fidelity Mock Adapters & Integration Tests

## Explicitly Excluded (Not Owned by Social)
- Workspace Multi-Tenant Business Rules
- Autonomous Mission & Growth Logic
- Content Strategy & Hypothesis Formulation
- Agent Cognitive Runtime & LLM Orchestration
- Commercial Billing & Subscriptions
- Frontend UI / Presentation
- Core Database Schemas & Migrations

---

# 3. The Decoupled Expansion Principle

Adding a new social network follows an isolated engineering loop:

```text
Platform Research
       ↓
Capability Definition
       ↓
Adapter Implementation
       ↓
Contract Tests
       ↓
Mock Integration Tests
       ↓
Real Developer API Tests
       ↓
Certification
```

**Anti-Pattern Prevented:** Introducing a new social platform must **NEVER** trigger changes to `Core`, `Database Schemas`, `Agent Logic`, `API Gateways`, or `Web UI`.

---

# 4. Unified Platform Contract

Every social adapter implements a standardized interface envelope:
- Authentication
- Account Discovery
- Capabilities
- Publishing
- Verification
- Analytics
- Webhooks
- Rate Limits
- Media Constraints
- Errors

### Invariant: Honest Inoperability
> A unified interface does NOT assume identical platform capabilities. If a platform does not support a feature, it must declare `NOT_SUPPORTED`. Synthetic or fake feature support is strictly prohibited.

---

# 5. Granular Capability Model

Every connected account exposes dynamic capabilities across four dimensions:

```text
Publishing
 ├── Text
 ├── Image (Single & Multiple)
 ├── Video
 ├── Carousel (PDF Document / Native Multi-Card)
 ├── Thread / Cascading Posts
 └── Link Previews

Analytics
 ├── Post-Level Metrics
 ├── Account-Level Aggregates
 └── Engagement Breakdowns

Interactions
 ├── Public Comments
 ├── Threaded Replies
 └── Direct Messages

Account Topology
 ├── Personal Profile
 ├── Organization Page
 ├── Community Group
 └── Broadcast Channel
```

### Capability Support States:
```text
SUPPORTED
SUPPORTED_WITH_CONSTRAINTS
NOT_SUPPORTED
PERMISSION_REQUIRED
NOT_VERIFIED
TEMPORARILY_UNAVAILABLE
```

---

# 6. Pre-Flight Capability Discovery

Before initiating any external network action, the system validates account capabilities:

```text
Operation Intent ──► Query Account Capabilities
                          │
         ┌────────────────┼────────────────┐
         ▼                ▼                ▼
     SUPPORTED      NOT_SUPPORTED     PERMISSION_REQUIRED
         │                │                │
     Continue       Deterministic    Halt & Prompt User
     Dispatch          Failure       for Re-Auth
```

This prevents sending invalid payloads that waste platform API quotas or produce cryptic runtime failures.

---

# 7. Unified Social Account Model

Scriora treats social accounts through a clean domain entity, while `scriora-social` manages platform-specific identifiers:

```typescript
interface CanonicalSocialAccount {
  id: string;
  workspace_id: string;
  platform: SocialPlatformType;
  external_account_id: string;
  display_name: string;
  avatar_url?: string;
  status: AccountConnectionStatus;
  capabilities: PlatformCapabilities;
  metadata: Record<string, unknown>;
}
```

Platform-specific properties (e.g. LinkedIn URNs, Meta Page Tokens, X User Handles) reside in encrypted credentials and validated metadata.

---

# 8. OAuth Handshake & Token Lifecycle

`scriora-social` manages platform protocol mechanics:
- Generation of PKCE Code Verifiers and Challenges.
- Construction of platform authorization redirect URLs.
- Exchange of authorization codes for access and refresh tokens.
- Invocation of account discovery endpoints.
- Handover of encrypted envelopes to `scriora-core`.

**Boundary:** Workspace membership, role-based authorization, and RLS session context remain under the exclusive authority of `scriora-core` and `scriora-api`.

---

# 9. Zero-Trust Token Shield

Social adapters maintain a strict cryptographic shield:
> Raw access tokens, refresh tokens, and client secrets are **NEVER** returned to Web clients, Agent reasoning contexts, LLM prompts, MCP responses, logs, or analytics records.

Token refresh occurs silently in the background via `scriora-worker` before expiration thresholds are breached.

---

# 10. Publishing Pipeline Contract

Publishing operations follow a deterministic multi-stage pipeline:

```text
Payload Validation (Length, Character Sets)
            ↓
Pre-Flight Capability Verification
            ↓
Media Asset Validation & Transcoding Check
            ↓
Platform Payload Construction
            ↓
Network Dispatch (HTTPS API Call)
            ↓
Raw Response Ingestion & Parsing
            ↓
Result Normalization
            ↓
Asynchronous Post Verification
```

**Rule:** Receiving an HTTP `200 OK` or `201 Created` is never accepted as definitive proof of publication.

---

# 11. Standardized Publishing Result

Adapters return a normalized result envelope:

```typescript
interface PublishResult {
  status: 'SUCCEEDED' | 'PLATFORM_PENDING' | 'UNKNOWN_EXTERNAL_STATE' | 'FAILED';
  external_post_id?: string;
  external_post_url?: string;
  platform_metadata?: Record<string, unknown>;
  request_id: string;
  operation_id: string;
  error?: NormalizedSocialError;
}
```

This decoupling allows `scriora-worker` to coordinate state transitions without knowing network-specific response structures.

---

# 12. UNKNOWN_EXTERNAL_STATE & Reconciliation

When network sockets time out, gateways disconnect, or responses are unparseable:

```text
Network Disruption ──► UNKNOWN_EXTERNAL_STATE ──► Reconciliation Workflow
```

**Core Prohibition:** The adapter must **NEVER** automatically retry a `POST` operation during `UNKNOWN_EXTERNAL_STATE`. The reconciliation workflow audits the live network feed (via search or account timeline lookup) before any re-attempt can occur.

---

# 13. Independent Verification Contract

Verification is architecturally distinct from publishing:

```text
Did the external post actually appear on the platform feed?
```

### Verification Strategies:
- `DIRECT_LOOKUP`: Direct fetch via `GET /posts/{external_post_id}`.
- `SEARCH`: Search account timeline by deterministic content fingerprint.
- `WEBHOOK_CONFIRMATION`: Asynchronous confirmation via platform push webhook.
- `PLATFORM_STATUS`: Querying async container status (e.g. Instagram Graph API).

---

# 14. Analytics Ingestion Contract

`scriora-social` extracts, normalizes, and timestamps raw platform metrics into canonical structures:

```text
Raw Platform Metrics ──► scriora-social ──► Canonical Metrics ──► scriora-core Persistence
```

The adapter contains zero analytical deduction or business logic; its responsibility is faithful extraction and schema translation.

---

# 15. Analytics Truthfulness Law

When a requested metric cannot be retrieved due to scope or permission constraints:

```text
status = 'PERMISSION_DENIED'
value_numeric = NULL (Never 0)
```

**Law:** Storing `0` for an unpermitted metric is treated as data corruption. A zero indicates zero human interaction; `NULL` indicates unknown observational state.

---

# 16. Webhook Ingestion & Normalization

```text
External Platform (Webhook Push)
            ↓
scriora-api Gateway (Ingress & TLS Termination)
            ↓
scriora-social (HMAC SHA-256 Signature Verification)
            ↓
Payload Normalization to Canonical Event
            ↓
Application Contract Dispatch to Core / Worker
```

Raw platform payloads never enter Core database tables.

---

# 17. Webhook Idempotency & Deduplication

Every webhook is deduplicated using:

```text
(platform, external_event_id)
```

Duplicate deliveries are acknowledged with HTTP `200 OK` and discarded to prevent redundant event processing.

---

# 18. Normalized Rate-Limit Contract

Social adapters translate diverse HTTP rate-limit headers into a canonical model:

```typescript
interface NormalizedRateLimit {
  is_limited: boolean;
  retry_after_seconds?: number;
  remaining_quota?: number;
  reset_at?: Date;
  scope: 'ACCOUNT' | 'APP' | 'IP' | 'ENDPOINT';
  platform_code?: string;
}
```

Downstream workers consume this contract to schedule exact backoff timers with jitter.

---

# 19. Normalized Error Taxonomy

External errors are mapped to 8 canonical categories:
- `VALIDATION`: Content exceeds character, aspect ratio, or media limits.
- `AUTHENTICATION`: Access token expired, revoked, or invalid.
- `AUTHORIZATION`: Account lacks permission for specific operation.
- `RATE_LIMITED`: Platform quota exhausted; backoff required.
- `EXTERNAL`: Remote platform internal server outage.
- `TIMEOUT`: Gateway, connection, or read socket timeout.
- `UNAVAILABLE`: Platform scheduled maintenance.
- `UNKNOWN_EXTERNAL_STATE`: Dispatched state cannot be confirmed.

---

# 20. Media Constraints Specification Contract

Adapters declare exact media specifications:

```typescript
interface PlatformMediaConstraints {
  supported_formats: ('JPEG' | 'PNG' | 'WEBP' | 'MP4' | 'MOV' | 'PDF')[];
  max_image_bytes: number;
  max_video_bytes: number;
  max_video_duration_seconds: number;
  aspect_ratios: { min: number; max: number; recommended: string };
  max_carousel_items: number;
}
```

---

# 21. Extensible Platform-Specific Options

Options unique to single networks are preserved as structured options inside `metadata JSONB`:
- `pinterest`: Board ID, destination link.
- `reddit`: Subreddit name, post flair, spoiler/NSFW flags.
- `instagram`: Container ID, share to feed toggle.
- `youtube`: Privacy status (public/unlisted/private), tags, playlist ID.
- `tiktok`: Privacy level (public/friends/self), disable comments/duet/stitch.

---

# 22. The 13-Platform Integration Ladder

Platforms are grouped into 5 engineering tiers:

| Tier | Platform | Protocol / API | Primary Focus |
| :---: | :--- | :--- | :--- |
| **1** | **LinkedIn** | REST Graph API / OAuth 2.0 | Highest Priority: B2B Authority & Carousels |
| **1** | **Bluesky** | AT Protocol / OAuth2 or App Password | Decentralized Social & Fast Ingestion |
| **1** | **Telegram** | Telegram Bot API / Bot Token | Broadcast Channels & Markdown Media Groups |
| **1** | **Discord** | Webhooks & REST Bot API | Communities, Rich Embeds & Attachments |
| **2** | **Mastodon** | Fediverse REST API / OAuth 2.0 | Decentralized Microblogging |
| **2** | **Threads** | Meta Threads Graph API / OAuth 2.0 | Mobile-Centric Text & Media |
| **3** | **X (Twitter)** | X API v2 / OAuth 2.0 PKCE | Real-time Engagement & Threads |
| **3** | **Pinterest** | Pinterest API v5 / OAuth 2.0 | Visual Discovery & Board Pins |
| **3** | **Reddit** | Reddit OAuth API | Community Discussions & Markdown |
| **4** | **Facebook** | Meta Graph API / OAuth 2.0 | Organization Pages & Groups |
| **4** | **Instagram** | Instagram Graph API / OAuth 2.0 | Professional / Business Media Containers |
| **5** | **YouTube** | Google YouTube Data API v3 | Long-Form Video & Shorts |
| **5** | **TikTok** | TikTok Content Posting API / OAuth 2.0 | Short-Form Vertical Video |

---

# 23. LinkedIn Adapter (Tier 1 - Highest Priority)

- **OAuth Scopes:** `openid`, `profile`, `email`, `w_member_social`.
- **Supported Formats:** Plain text, single image, multi-image, native video, PDF document carousels.
- **Analytics Cadence:** Standard observation snapshots at `T+2h`, `T+6h`, `T+12h`, `T+24h`, `T+48h`, `T+7d`.
- **Permission Shield:** Personal profiles without page analytics permissions yield `status = PERMISSION_LIMITED` and `value = NULL`.

---

# 24. Bluesky Adapter (Tier 1)

- **Protocol:** AT Protocol (`com.atproto.repo.createRecord`).
- **Auth:** App Passwords or OAuth 2.0.
- **Constraints:** 300 characters, up to 4 images per post, rich facet link embedding.
- **Architecture:** Adapter isolates Decentralized Identifiers (`DID`), Handle resolution, and repository commits.

---

# 25. Telegram Adapter (Tier 1)

- **Protocol:** Telegram Bot API (`sendMessage`, `sendPhoto`, `sendVideo`, `sendMediaGroup`).
- **Auth:** Secure Bot Token (`bot<token>`).
- **Capabilities:** MarkdownV2 and HTML formatting, grouped media carousels, document dispatch to channels/groups.

---

# 26. Discord Adapter (Tier 1)

- **Protocol:** Webhook URLs & REST Bot API.
- **Capabilities:** Formatted markdown, rich embed cards, image and file attachments, thread creation.

---

# 27. Mastodon / Fediverse Adapter (Tier 2)

- **Protocol:** Mastodon REST API (`/api/v1/statuses`).
- **Auth:** OAuth 2.0 Bearer tokens across federated instances.
- **Dynamic Limits:** Character limits (500+ chars) are discovered per instance via `/api/v1/instance`, never hard-coded.

---

# 28. Threads Adapter (Tier 2)

- **Protocol:** Meta Threads Graph API.
- **Auth Scopes:** `threads_basic`, `threads_content_publish`.
- **Limits:** 500 characters, carousels (up to 10 items), native video, 250 posts per 24 hours.

---

# 29. X Adapter (Tier 3)

- **Protocol:** X API v2 (`POST /2/tweets`).
- **Auth:** OAuth 2.0 Authorization Code with PKCE.
- **Capabilities:** 280 characters (Standard) / 25,000 characters (Premium), up to 4 images, chunked media upload for video.

---

# 30. Pinterest Adapter (Tier 3)

- **Protocol:** Pinterest API v5.
- **Capabilities:** Image and video pins, board target selection, destination URL binding, 2:3 vertical aspect ratio optimization.

---

# 31. Reddit Adapter (Tier 3)

- **Protocol:** Reddit OAuth API (`POST /api/submit`).
- **Capabilities:** Link posts, self/markdown text posts, image galleries, subreddit rules and flair compliance checks.

---

# 32. Facebook Adapter (Tier 4)

- **Protocol:** Meta Graph API (`/{page-id}/feed`).
- **Auth:** Page Access Tokens derived from user OAuth.
- **Target:** Verified business pages and managed groups.

---

# 33. Instagram Adapter (Tier 4)

- **Account Eligibility:** Professional, Business, or Creator accounts linked to a Meta Business Manager.
- **Asynchronous Container Workflow:**
  ```text
  1. POST /{ig-user-id}/media (Create Media Container)
              ↓
  2. Poll Container Status until 'FINISHED'
              ↓
  3. POST /{ig-user-id}/media_publish (Execute Live Release)
  ```
- **Capabilities:** Feed images, multi-slide carousels, native video Reels.

---

# 34. YouTube Adapter (Tier 5)

- **Protocol:** YouTube Data API v3 (`videos.insert`).
- **Quota Management:** Resumable chunked video upload consumes 1600 quota units per upload. Dedicated quota budgeting prevents API exhaustion.

---

# 35. TikTok Adapter (Tier 5)

- **Protocol:** TikTok Content Posting API (`/v2/post/publish/video/init/`).
- **Modes:** Direct post or push to user inbox drafts.
- **Constraints:** 9:16 vertical orientation, H.264 video, AAC audio, strict copyright verification checks.

---

# 36. Unified Platform Registry

A singleton registry exposes metadata and adapter factories for all supported networks:

```typescript
interface PlatformRegistryEntry {
  platform_id: SocialPlatformType;
  display_name: string;
  adapter_factory: () => SocialPlatformAdapter;
  tier: 1 | 2 | 3 | 4 | 5;
  certification_status: CertificationStatus;
  api_version: string;
}
```

---

# 37. Dynamic Configuration vs Hard-Coded Constants

All operational parameters (character limits, media caps, daily rate limits, required scopes) are stored in **dynamic, environment-overridable configuration tables**, never hard-coded into TypeScript business logic.

---

# 38. Platform Versioning Isolation

When a platform updates its API version (e.g. Meta Graph v19 ──► v20):
1. The adapter updates internal endpoints and payload structures.
2. The adapter runs automated contract and certification tests.
3. **Result:** `scriora-core`, `scriora-api`, and `scriora-web` experience **zero code modifications**.

---

# 39. Platform-Specific vs Generalized Abstraction

```text
Rule: Generalize after repeated evidence (3+ platforms), not before.
```
- A feature supported by only one network (e.g. Pinterest Boards) remains an explicit platform option in `metadata JSONB`.
- When a feature is shared across multiple platforms (e.g. Multi-Slide Carousels on LinkedIn, Instagram, Threads), it is elevated to a first-class canonical capability.

---

# 40. Social ↔ Core Boundary Contract

- **`Core` decides:** *"May this user/workspace publish this content?"* (Authorization, Mission, Policy, Approvals).
- **`Social` decides:** *"How do we safely talk to the external platform API, and what did the platform return?"*

---

# 41. Social ↔ Worker Boundary Contract

- **`Worker` controls:** **WHEN** to dispatch, retry strategies, backoff delays, and reconciliation sagas.
- **`Social` controls:** **HOW** to construct HTTP requests, execute OAuth, and normalize responses.

---

# 42. Social ↔ Media Boundary Contract

- **`Social` defines:** Platform intake constraints (e.g. Instagram requires aspect ratio between 4:5 and 1.91:1, max 30 FPS).
- **`Media` executes:** FFmpeg transformations, cropping, and transcoding to guarantee assets satisfy platform constraints.

---

# 43. 6-Stage Certification Lifecycle

```text
1. UNKNOWN               ──► Unverified initial codebase
2. MOCKED                ──► 100% test coverage against synthetic mock adapters
3. CONTRACT_VERIFIED     ──► Validated against canonical typed schemas
4. INTEGRATION_VERIFIED  ──► Sandbox integration testing with simulated network delays
5. REAL_API_VERIFIED     ──► Live dispatch verified against real developer test apps
6. CERTIFIED             ──► Production-ready for enterprise deployment
```

An adapter is never marked production-ready until reaching status `CERTIFIED`.

---

# 44. Standardized Certification Test Suite

Every certified adapter passes an automated suite verifying:
- Token refresh & error recovery
- Account identity discovery
- Text, single-image, multi-image, and video publishing
- Asynchronous verification lookup
- Longitudinal analytics ingestion & NULL handling
- Webhook signature validation & deduplication
- Rate limit 429 response handling & backoff calculation
- Reconciliation from `UNKNOWN_EXTERNAL_STATE`

---

# 45. Deterministic Mock Provider

`scriora-social` provides deterministic in-memory mock adapters for every platform:
- Simulates instantaneous success, socket timeouts, rate limits, and permission denials.
- Enables lightning-fast, zero-cost CI/CD pipeline runs without real API tokens or network latency.

---

# 46. Real API Testing Environment

Live API tests run exclusively in isolated developer environments against registered sandbox applications. They are strictly excluded from default local CI runs to prevent flake and token leakage.

---

# 47. Automated Failure Recovery Matrix

Adapters provide deterministic recovery strategies for every failure mode:

| Error Mode | Normalized Error | Recovery Action |
| :--- | :--- | :--- |
| Token Expired | `AUTHENTICATION` | Execute automated refresh token exchange |
| Token Revoked | `AUTHENTICATION` | Mark account disconnected; alert workspace owner |
| Quota Exceeded | `RATE_LIMITED` | Extract `Retry-After`; schedule worker delay with jitter |
| Network Timeout | `UNKNOWN_EXTERNAL_STATE` | Lock attempt; launch asynchronous reconciliation |
| Media Format Error | `VALIDATION` | Deterministic permanent failure; abort retry |

---

# 48. Reconciliation Protocol

For any operation ending in an uncertain state (`UNKNOWN_EXTERNAL_STATE`):
1. Worker pauses automated queue dispatch.
2. Worker schedules reconciliation step via `SocialPlatformAdapter.verify()`.
3. If external post ID is discovered on platform: update status to `SUCCEEDED`.
4. If post is definitively confirmed absent: allow safe manual or policy-guided re-attempt.
5. If status remains uncertain: retain `UNKNOWN_EXTERNAL_STATE` and escalate for human intervention.

---

# 49. External Scheduling Boundary

`scriora-social` contains zero timer or scheduling infrastructure. It exposes an immediate `publish()` contract. All temporal queues, sleep timers, and calendar scheduling are coordinated by `scriora-worker` via Inngest.

---

# 50. Threading, Comments & Engagement

Thread composition and public comments are modeled as independent modular capabilities. Supporting post publishing does not imply support for comment ingestion.

---

# 51. Unified Inbox & Engagement Pipeline

Incoming platform comments, mentions, and direct messages flow through `scriora-social`:
```text
Platform Webhook / Poller ──► scriora-social Normalization ──► Unified Inbox Event
```
Sentiment analysis, automated replies, and AI triage are managed by `scriora-agent`, keeping `scriora-social` strictly focused on transport.

---

# 52. Social Framework Security Boundary

A Social Adapter has zero permission to:
- Access database tables directly.
- Modify mission goals or content strategy.
- Bypass human governance approvals.
- Access workspaces other than the explicitly bound context.

---

# 53. Comprehensive Observability & Structured Tracing

Every social interaction logs structured diagnostic telemetry:
- `operation_id` & `request_id`
- `workspace_id` & `social_account_id`
- `platform` & `capability`
- HTTP method, URL endpoint, response latency
- HTTP response code & normalized error code
- **Strict redaction:** Access tokens and secret payloads are replaced with `[REDACTED]`.

---

# 54. 16-Step Platform Expansion Process

Adding any 14th+ social platform follows an exact 16-step engineering protocol:
1. Formal platform API research & documentation review.
2. Capability matrix mapping.
3. OAuth 2.0 PKCE & token refresh design.
4. Publishing payload construction design.
5. Asynchronous post verification design.
6. Analytics snapshot extraction design.
7. Webhook signature & ingress design.
8. Rate-limit & quota calculation design.
9. Media constraint specification.
10. Adapter coding within `scriora-social`.
11. Unit & contract test suite implementation.
12. Mock provider integration.
13. Developer sandbox API verification.
14. Failure & error normalization verification.
15. Formal 6-stage certification review.
16. Public documentation in `scriora-docs`.

---

# 55. Master Central Platform Matrix

| Platform | Tier | Auth Mechanism | Text | Image | Video | Carousel | Analytics | Webhooks | Special Constraints |
| :--- | :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **LinkedIn** | 1 | OAuth 2.0 | ✓ | ✓ | ✓ | ✓* (PDF) | ✓* | ✓* | Member vs Org permissions |
| **Bluesky** | 1 | AT Protocol / App Pass | ✓ | ✓ | ✓* | ✓* | ✓* | ✓* | 300 chars, DIDs, Facets |
| **Telegram** | 1 | Bot Token | ✓ | ✓ | ✓ | ✓* (Media Group) | ✓* | ✓* | MarkdownV2, Bot limits |
| **Discord** | 1 | Webhook / Bot API | ✓ | ✓ | ✓ | ✓* (Attachments)| ✓* | ✓ | Rich Embeds, Channel limits |
| **Mastodon** | 2 | OAuth 2.0 | ✓ | ✓ | ✓ | ✓* | ✓* | ✓* | Dynamic instance limits |
| **Threads** | 2 | Meta OAuth 2.0 | ✓ | ✓ | ✓ | ✓ (Native) | ✓* | ✓* | 500 chars, 250 posts/24h |
| **X** | 3 | OAuth 2.0 PKCE | ✓ | ✓ | ✓ | ✓* | ✓* | ✓* | 280/25k chars, API Quotas |
| **Pinterest**| 3 | OAuth 2.0 | ✓* | ✓ | ✓ | ✓* | ✓* | ✓* | Board & Link required |
| **Reddit** | 3 | OAuth 2.0 | ✓ | ✓ | ✓ | ✓* (Gallery) | ✓* | ✓* | Subreddit flairs & rules |
| **Facebook** | 4 | Meta Graph API | ✓ | ✓ | ✓* | ✓* | ✓* | ✓ | App Review & Page scopes |
| **Instagram**| 4 | Meta Graph API | ✓ | ✓ | ✓ | ✓ (Container) | ✓* | ✓* | Media Container polling |
| **YouTube** | 5 | Google OAuth 2.0 | ✓* | ✓* | ✓ | ✓* | ✓* | ✓* | 1600 quota units / video |
| **TikTok** | 5 | TikTok Posting API | ✓* | ✓* | ✓ | ✓* | ✓* | ✓* | 9:16 vertical, Review checks |

*\* Marked features depend on live platform tier and account verification status.*

---

# 56. Phased Rollout Roadmap

Platform adapters are released in phased milestones:
- **Phase A (Core Foundation):** LinkedIn, Bluesky, Telegram, Discord
- **Phase B (Microblogging Expansion):** Mastodon, Threads
- **Phase C (Public Communities):** X (Twitter), Pinterest, Reddit
- **Phase D (Meta Ecosystem):** Facebook Pages, Instagram Containers
- **Phase E (Video Ecosystem):** YouTube Data API, TikTok Posting API

---

# 57. The Supreme Architectural Law

> **`scriora-social` is the Anti-Corruption Layer between Scriora and the chaotic reality of external social APIs.**  
> `scriora-core` speaks clean, immutable Scriora domain language.  
> `scriora-social` speaks external vendor language.  
> The adapter is the faithful translator between the two worlds.

---

# 58. Status: 100% Complete

```text
████████████████████████████████████ 100% COMPLETE
```

Every boundary, contract, capability model, error classification, and certification protocol for the Social Platform Framework is formally frozen.
