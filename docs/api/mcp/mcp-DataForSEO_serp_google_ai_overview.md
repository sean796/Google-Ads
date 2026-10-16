---
title: "DataForSEO_serp_google_ai_overview"
slug: mcp/DataForSEO_serp_google_ai_overview
section: DataForSEO MCP
method: POST
path: /api/mcp/DataForSEO_serp_google_ai_overview
auth: open
order: 870
---

POST `/api/mcp/DataForSEO_serp_google_ai_overview`.

Runs the dataforseo_serp_google_ai_overview action in the DataForSEO MCP API from a JSON request body.

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
curl -X POST "https://neodigital.ca/api/mcp/DataForSEO_serp_google_ai_overview" \
  -H "Content-Type: application/json" \
  -d '{}'
```

```javascript
const res = await fetch(`/api/mcp/DataForSEO_serp_google_ai_overview`, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({}),
});
const data = await res.json();
```
