---
title: "GET mcp/DataForSEO_serp_dump_download/{filename}"
slug: mcp/DataForSEO_serp_dump_download/filename
section: DataForSEO MCP
method: GET
path: /api/mcp/DataForSEO_serp_dump_download/{filename}
auth: open
order: 850
---

GET `/api/mcp/DataForSEO_serp_dump_download/{filename}`.

Fetches a single dataforseo_serp_dump_download item from the DataForSEO MCP API.

## Request

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| _(none)_ | — | — | No JSON body for GET requests. |

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
curl -X GET "https://neodigital.ca/api/mcp/DataForSEO_serp_dump_download/{filename}" \
  -H "Content-Type: application/json" \
```

```javascript
const res = await fetch(`/api/mcp/DataForSEO_serp_dump_download/{filename}`, {
  method: "GET",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
});
const data = await res.json();
```
