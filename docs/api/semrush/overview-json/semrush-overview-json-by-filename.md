---
title: "GET semrush/overview-json/{filename}"
slug: semrush/overview-json/filename
section: Semrush
method: GET
path: /api/semrush/overview-json/{filename}
auth: open
order: 1020
---

GET `/api/semrush/overview-json/{filename}`.

Fetches a single overview json item from the Semrush API.

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
curl -X GET "https://neodigital.ca/api/semrush/overview-json/{filename}" \
  -H "Content-Type: application/json" \
```

```javascript
const res = await fetch(`/api/semrush/overview-json/{filename}`, {
  method: "GET",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
});
const data = await res.json();
```
