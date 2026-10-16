---
title: "Query Daily Series"
slug: gsc/query-daily-series
section: Google Search Console
method: POST
path: /api/gsc/query-daily-series
auth: open
order: 450
---

POST `/api/gsc/query-daily-series`.

Runs the query daily series action in the Google Search Console API from a JSON request body.

## Request

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `system` | string | yes | Request body field |
| `user` | string | yes | Request body field |
| `model` | string | no | Request body field |
| `temperature` | string | no | Request body field |
| `maxTokens` | string | no | Request body field |
| `responseFormat` | string | no | Request body field |

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
curl -X POST "https://neodigital.ca/api/gsc/query-daily-series" \
  -H "Content-Type: application/json" \
  -d '{   "system": "...",   "user": "..." }'
```

```javascript
const res = await fetch(`/api/gsc/query-daily-series`, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
  "system": "...",
  "user": "..."
}),
});
const data = await res.json();
```
