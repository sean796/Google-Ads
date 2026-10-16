---
title: "GET semrush/audit-json/{filename}"
slug: semrush/audit-json/filename
section: Semrush
method: GET
path: /api/semrush/audit-json/{filename}
auth: open
order: 970
---

GET `/api/semrush/audit-json/{filename}`.

Fetches a single audit json item from the Semrush API.

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
curl -X GET "https://neodigital.ca/api/semrush/audit-json/{filename}" \
  -H "Content-Type: application/json" \
```

```javascript
const res = await fetch(`/api/semrush/audit-json/{filename}`, {
  method: "GET",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
});
const data = await res.json();
```
