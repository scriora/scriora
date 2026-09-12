---
title: "MCP Tools & Resource Catalog"
description: "Reference guide for Scriora Model Context Protocol (MCP) server tools, schemas, and readable resources"
---

The **Scriora MCP Server** (`packages/mcp`) connects LLMs and AI Agents directly to Scriora's publishing engine and Buffer datasets via the **Model Context Protocol (v2024-11-05)**.

---

## 1. `scriora_optimize_cross_post`

Pre-flight compliance engine that evaluates copy and media against platform heuristics, limits, and Buffer algorithms (e.g. Facebook 14M zero-link penalty, Instagram 5-hashtag maximum, Threads single-video rule).

### Parameters
| Parameter | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `body` | `string` | Yes | Raw caption or message draft |
| `targetPlatforms` | `array` | Yes | Array of platforms: `FACEBOOK`, `INSTAGRAM`, `THREADS`, `X`, `LINKEDIN` |
| `mediaUrls` | `array` | No | Optional media asset URLs |

---

## 2. `scriora_get_smart_slots`

Retrieves empirical high-engagement posting windows backed by Buffer datasets:
- **Facebook:** 14M posts (Thursday 9:00 AM peak score 100)
- **Instagram:** 9.6M posts (Wednesday 12:00 PM peak score 100)
- **X / Twitter:** 8.7M posts (Tuesday 9:00 AM peak score 100)
- **Threads:** 2.5M posts (Wednesday 7:00 AM peak score 100)

### Parameters
| Parameter | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `platform` | `enum` | Yes | `FACEBOOK`, `INSTAGRAM`, `THREADS`, `X`, `LINKEDIN`, `GENERAL` |
| `timezone` | `string` | No | Target timezone (default: `Africa/Cairo`) |
| `daysAhead` | `number` | No | Projection window in days (default: 7) |

---

## 3. `scriora_list_social_accounts`

Discovers all connected social accounts in a workspace, including individual Facebook Pages, Instagram Business accounts, and Threads profiles.

### Parameters
| Parameter | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `workspaceId` | `string (UUID)` | Yes | The target Scriora workspace UUID |

---

## 4. `scriora_create_post`

Stages a multi-destination post across Facebook Pages, Instagram, Threads, X, or LinkedIn. Automatically enforces the **Human Approval Gate** when required.

### Parameters
| Parameter | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `workspaceId` | `string (UUID)` | Yes | Workspace UUID |
| `body` | `string` | Yes | Post text content |
| `targets` | `array` | Yes | Target destinations (`socialAccountId`, `platform`, `customBody`, `facebookOptions`) |
| `mediaUrls` | `array` | No | URLs of attached media |
| `scheduledAt` | `string (ISO)` | No | Optional scheduling timestamp |

### Facebook Specific Options (`facebookOptions`)
- `pageId`: Optional override Page ID.
- `link`: Outbound link preview URL.
- `published`: Set to `false` to stage as an unpublished Page draft.
- `videoThumbnailUrl`: Custom thumbnail cover image for native video uploads.

---

## 5. MCP Resources

- `scriora://platforms/limits`: Real-time platform constraints (character limits, media limits, and supported formats).
- `scriora://workspace/{id}/brand-voice`: Workspace brand tone, guidelines, and negative keywords.
