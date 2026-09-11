# scriora-social
Social Platform Framework (Anti-Corruption Layer) for Scriora.
**Mandate:** The ONLY layer that communicates with external social APIs.
Owns: Platform adapters, OAuth flows, webhooks, rate-limit normalization,
error normalization, capability models, and platform certification.
**13 Platforms (phased):**
Tier 1: LinkedIn, Bluesky, Telegram, Discord
Tier 2: Mastodon, Threads
Tier 3: X, Pinterest, Reddit
Tier 4: Facebook, Instagram
Tier 5: YouTube, TikTok
**Critical Invariants:**
- scriora-core NEVER imports scriora-social (ACL flows one way)
- Platform credentials NEVER leave this package
- All platform errors normalized to canonical codes before propagation
Reference: scriora-docs/architecture/SCRIORA_SOCIAL_PLATFORM_FRAMEWORK.md
## Scripts
| Command | Description |
|---|---|
| `pnpm build` | Compile TypeScript |
| `pnpm test` | Run all tests |
| `pnpm typecheck` | Type-check without emitting |
## Quality Gate
```bash
pnpm typecheck && pnpm test && pnpm build
```
Coverage minimum: 85%
