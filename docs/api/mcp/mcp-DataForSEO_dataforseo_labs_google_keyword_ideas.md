---
title: "DataForSEO_dataforseo_labs_google_keyword_ideas"
slug: mcp/DataForSEO_dataforseo_labs_google_keyword_ideas
section: DataForSEO MCP
method: POST
path: /api/mcp/DataForSEO_dataforseo_labs_google_keyword_ideas
auth: open
order: 770
---

POST `/api/mcp/DataForSEO_dataforseo_labs_google_keyword_ideas`.

Runs the dataforseo_dataforseo_labs_google_keyword_ideas action in the DataForSEO MCP API from a JSON request body.

## Request

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| _(optional)_ | object | no | JSON body shape depends on the action. |

## Response

| Field | Type | Description |
| --- | --- | --- |
| `success` / `ok` | boolean | Operation status when present |
| `error` | string | Error message on failure |

## Errors

| Status | error | Cause |
| --- | --- | --- |
| 4xx/5xx | varies | See HTTP status and `error` field in body. |

## Example

```bash
curl -X POST "https://neodigital.ca/api/mcp/DataForSEO_dataforseo_labs_google_keyword_ideas" \
  -H "Content-Type: application/json" \
  -d '{}'
```

```javascript
const res = await fetch(`/api/mcp/DataForSEO_dataforseo_labs_google_keyword_ideas`, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({}),
});
const data = await res.json();
```
