---
title: "DataForSEO_serp_google_ai_mode"
slug: mcp/DataForSEO_serp_google_ai_mode
section: DataForSEO MCP
method: POST
path: /api/mcp/DataForSEO_serp_google_ai_mode
auth: open
order: 860
---

POST `/api/mcp/DataForSEO_serp_google_ai_mode`.

Runs the dataforseo_serp_google_ai_mode action in the DataForSEO MCP API from a JSON request body.

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
curl -X POST "https://neodigital.ca/api/mcp/DataForSEO_serp_google_ai_mode" \
  -H "Content-Type: application/json" \
  -d '{}'
```

```javascript
const res = await fetch(`/api/mcp/DataForSEO_serp_google_ai_mode`, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({}),
});
const data = await res.json();
```
