# MCP Tools & Resource Catalog

The Scriora MCP server exposes a rich set of tools and resources implementing the official Model Context Protocol specification.

---

## 1. `scriora_create_post`

Creates a new content draft within a designated workspace and pre-validates character limits per platform.

### Input Schema
```json
{
  "type": "object",
  "properties": {
    "workspaceId": { "type": "string", "description": "The target workspace ID" },
    "body": { "type": "string", "description": "Post text content" },
    "platforms": {
      "type": "array",
      "items": { "type": "string", "enum": ["linkedin", "x", "threads", "tiktok", "instagram", "facebook", "youtube"] },
      "description": "Target platforms"
    },
    "mediaIds": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Optional media asset IDs"
    }
  },
  "required": ["workspaceId", "body", "platforms"]
}
```

---

## 2. `scriora_schedule_post`

Schedules a post for automatic dispatch via Inngest and the Outbox worker.

### Input Schema
```json
{
  "type": "object",
  "properties": {
    "publicationId": { "type": "string", "description": "ID of the publication to schedule" },
    "scheduledAt": { "type": "string", "format": "date-time", "description": "ISO-8601 publication timestamp" }
  },
  "required": ["publicationId", "scheduledAt"]
}
```

---

## 3. `scriora_list_accounts`

Lists active social platform connections, token expiration states, and channel IDs.

### Input Schema
```json
{
  "type": "object",
  "properties": {
    "workspaceId": { "type": "string", "description": "The workspace ID" }
  },
  "required": ["workspaceId"]
}
```

---

## 4. MCP Resources

The MCP server exposes readable resources for context-aware prompts:

- `scriora://workspace/{id}/brand-voice`: Brand guidelines, tone of voice, banned keywords.
- `scriora://workspace/{id}/recent-posts`: Recent 20 published posts for style matching.
- `scriora://platforms/limits`: Real-time constraints (character limits, video formats, aspect ratios).
