---
title: "REST API Gateway Overview"
---

The Scriora API (`apps/api`) is a high-performance REST gateway powered by **Fastify**, providing strict schema validation via **Zod**, automated **OpenAPI 3.0** documentation, and multi-tenant security gates.

---

## 🌐 Base URL & Environments

- **Local Development**: `http://localhost:4000/api/v1`
- **Production**: `https://api.scriora.com/api/v1`
- **Interactive OpenAPI Documentation**: `http://localhost:4000/docs` (Swagger UI)

---

## 🔐 Authentication

All API requests require authentication using either a **User Session Bearer Token** or a **Workspace API Key**:

```http
Authorization: Bearer <token>
X-Workspace-Id: ws_clx...
```

Or using an API Key:

```http
X-Api-Key: scr_live_...
```

---

## 📊 Core Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/publications` | Create and enqueue a publication |
| `GET` | `/api/v1/publications` | List workspace publications with pagination |
| `GET` | `/api/v1/publications/:id` | Get status and channel logs of a publication |
| `DELETE` | `/api/v1/publications/:id` | Cancel a scheduled publication |
| `GET` | `/api/v1/accounts` | List connected social accounts |
| `POST` | `/api/v1/media/upload` | Generate presigned upload URL for media assets |
| `GET` | `/api/v1/health` | Service health status and database latency |

---

## 🛡️ Rate Limiting

The API enforces tenant-aware rate limits using Redis:

- **Free Tier**: 60 requests / minute per workspace.
- **Pro Tier**: 600 requests / minute per workspace.
- **Enterprise Tier**: Dedicated rate allocations.

Rate-limit headers are included on every response:
```http
X-RateLimit-Limit: 600
X-RateLimit-Remaining: 598
X-RateLimit-Reset: 1726056000
```
