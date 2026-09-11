# 🌐 Scriora — The AI Social Growth Operating System

<div align="center">

**Open-source, self-hostable, multi-platform social media orchestration & autonomous AI agent framework.**

[![CI](https://github.com/scriora/scriora/actions/workflows/ci.yml/badge.svg)](https://github.com/scriora/scriora/actions/workflows/ci.yml)
[![CodeQL](https://github.com/scriora/scriora/actions/workflows/codeql.yml/badge.svg)](https://github.com/scriora/scriora/actions/workflows/codeql.yml)
[![Turborepo](https://img.shields.io/badge/built_with-turborepo-blue)](https://turbo.build/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[English](#-english-overview) • [الملخص التنفيذي بالعربية](#-الملخص-التنفيذي-بالعربية) • [Quickstart](#-quickstart) • [Architecture](#-architecture) • [Documentation](https://docs.scriora.com)

</div>

---

## 📖 English Overview

**Scriora** is an enterprise-grade, modern social media operating system designed to automate, schedule, adapt, and analyze content across **13+ social platforms** while providing an autonomous, governed **AI Growth Loop**.

Built as a high-performance **Turborepo + pnpm Monorepo**, it powers unified publishing, deterministic AI skill execution, media transcoding, and full developer extensibility via the **Model Context Protocol (MCP)** and CLI.

### Key Capabilities
- 🚀 **Multi-Platform Publishing:** LinkedIn, Bluesky, Telegram, Discord, Mastodon, Threads, X (Twitter), Pinterest, Reddit, Facebook, Instagram, YouTube, TikTok.
- 🛡️ **Zero-Corruption Architecture (ACL):** External social APIs and rate limits are completely encapsulated in `packages/social`.
- 🤖 **Autonomous AI Agent:** Multi-agent planning loop with a **Sovereign Human Approval Gate** — the AI proposes, humans decide.
- ⚡ **Atomic Outbox Pattern:** Guarantees zero missed or duplicate publications even during network or database failures.
- 📦 **Model Context Protocol (MCP):** Connect Scriora directly to Claude Desktop, Cursor, and custom AI environments via standard JSON-RPC.

---

## 🌐 الملخص التنفيذي بالعربية

**سكريورا (Scriora)** هو نظام تشغيل مفتوح المصدر لإدارة ونمو التواجد على منصات التواصل الاجتماعي بالذكاء الاصطناعي، يجمع بين محرك جدولة ونشر فائق الدقة عبر **13 منصة اجتماعية**، مع حلقة ذكاء اصطناعي ذاتية القيادة خاضعة لحوكمة بشرية صارمة.

تمت هندسة المنصة بنمط **المستودع الموحد (Unified Monorepo)** عبر **Turborepo** لضمان أقصى درجات الأداء وسرعة التطوير وسهولة المساهمة البرمجية.

---

## 🏛️ Architecture & Workspace Layout

```text
scriora/
├── apps/                         # Deployable Applications
│   ├── web/                      # Next.js 16 Frontend (Dashboard, Studio, Calendar)
│   ├── api/                      # Fastify v5 HTTP Gateway (Auth, RBAC, OpenAPI 3.0)
│   ├── worker/                   # Inngest Background Job Executor (Outbox & Retries)
│   └── docs/                     # Astro + Starlight Documentation & Engineering Specs
│
├── packages/                     # Domain Engines & Shared Packages
│   ├── core/                     # Canonical Prisma schema, Postgres Client, State Machines
│   ├── social/                   # Anti-Corruption Layer: 13 Platform Adapters & OAuth
│   ├── media/                    # Sharp Image & FFmpeg Video Transcoding, S3/R2 Storage
│   ├── agent/                    # Cognitive AI Loop, Skill Registry, 6-Tier Memory
│   ├── mcp/                      # Model Context Protocol (MCP) Server (Stdio / HTTP)
│   └── cli/                      # Developer Terminal Client & Operators CLI
│
├── tooling/                      # Shared Dev Infrastructure
│   ├── typescript/               # Strict base tsconfig presets
│   └── biome/                    # Unified Biome linting & formatting rules
│
├── .github/workflows/            # Unified Turborepo Cached CI & CodeQL Security Gates
├── turbo.json                    # Monorepo task pipeline
└── pnpm-workspace.yaml           # Workspace definitions
```

---

## ⚡ Quickstart & Local Development

### Prerequisites
- **Node.js**: `>= 22.0.0`
- **pnpm**: `>= 11.0.0` (`corepack enable`)
- **Docker**: For local PostgreSQL, Redis, and MinIO

### 1. Clone & Install
```bash
git clone https://github.com/scriora/scriora.git
cd scriora
pnpm install
```

### 2. Generate Database Client
```bash
pnpm db:generate
```

### 3. Run Development Environment
```bash
pnpm dev
```
- Web Studio: `http://localhost:3000`
- Fastify API: `http://localhost:4000`
- Documentation Portal: `http://localhost:4321`

---

## 🧪 Quality Gates & Verification

Every build and pull request is strictly verified across all packages:

```bash
# Monorepo-wide type checking
pnpm typecheck

# Biome linting and formatting
pnpm lint

# Unit & Integration test suite
pnpm test

# Full production compile
pnpm build
```

---

## 📄 License
Released under the [MIT License](LICENSE).
