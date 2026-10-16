---
title: "GET gsc/quick-wins-csv/{filename}"
slug: gsc/quick-wins-csv/filename
section: Google Search Console
method: GET
path: /api/gsc/quick-wins-csv/{filename}
auth: open
order: 470
---

GET `/api/gsc/quick-wins-csv/{filename}`.

Fetches a single quick wins csv item from the Google Search Console API.

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
curl -X GET "https://neodigital.ca/api/gsc/quick-wins-csv/{filename}" \
  -H "Content-Type: application/json" \
```

```javascript
const res = await fetch(`/api/gsc/quick-wins-csv/{filename}`, {
  method: "GET",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
});
const data = await res.json();
```
